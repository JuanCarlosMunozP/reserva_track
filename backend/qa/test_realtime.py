"""WebSockets: middleware JWT, consumer, eventos y enrutado (Channels)."""
import logging
from unittest.mock import AsyncMock, patch

import pytest
from asgiref.sync import async_to_sync
from channels.layers import channel_layers, get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken

from realtime import events, middleware
from realtime.consumers import (
    AUTH_CLOSE_CODE, CHANNEL_LAYER_CLOSE_CODE, NOTIFICATIONS_GROUP, NotificationConsumer,
)
from realtime.middleware import CookieJWTAuthMiddleware, _raw_token_from_scope
from realtime.routing import websocket_urlpatterns

from .conftest import make_user

PATH = "/ws/notifications/"
APP = CookieJWTAuthMiddleware(URLRouter(websocket_urlpatterns))


@pytest.fixture(autouse=True)
def in_memory_layer(settings):
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    channel_layers.backends = {}
    yield
    channel_layers.backends = {}


def cookie(token):
    return [(b"cookie", f"access_token={token}".encode())]


def bearer(token):
    return [(b"authorization", f"Bearer {token}".encode())]


def first_output(headers=None):
    async def scenario():
        comm = WebsocketCommunicator(APP, PATH, headers=headers)
        await comm.connect()
        out = await comm.receive_output(timeout=2)
        await comm.disconnect()
        return out

    return async_to_sync(scenario)()


# --------------------------------------------------------------- handshake
@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("headers", [
    None,
    cookie("no-es-un-jwt"),
    bearer("no-es-un-jwt"),
    [(b"authorization", b"Bearer ")],
    [(b"authorization", b"Basic abc")],
    [(b"cookie", b"otra=1")],
])
def test_unauthenticated_handshakes_close_with_4401(headers):
    out = first_output(headers)
    assert out["type"] == "websocket.close" and out["code"] == AUTH_CLOSE_CODE


@pytest.mark.django_db(transaction=True)
def test_token_for_deleted_user_is_closed_with_4401():
    user = make_user("fantasma")
    token = str(AccessToken.for_user(user))
    user.delete()
    out = first_output(cookie(token))
    assert out["type"] == "websocket.close" and out["code"] == AUTH_CLOSE_CODE


@pytest.mark.django_db(transaction=True)
def test_token_for_inactive_user_is_closed_with_4401():
    user = make_user("baja", is_active=False)
    out = first_output(cookie(str(AccessToken.for_user(user))))
    assert out["code"] == AUTH_CLOSE_CODE


# ------------------------------------------------------- conexión y mensajes
@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("transport", [cookie, bearer])
def test_authenticated_user_receives_group_and_private_messages(transport):
    user = make_user("ana")
    headers = transport(str(AccessToken.for_user(user)))

    async def scenario():
        comm = WebsocketCommunicator(APP, PATH, headers=headers)
        connected, _ = await comm.connect()
        layer = get_channel_layer()
        await layer.group_send(NOTIFICATIONS_GROUP, {"type": "notification.message", "payload": {"n": 1}})
        general = await comm.receive_json_from(timeout=2)
        await layer.group_send(f"user.{user.pk}", {"type": "notification.message", "payload": {"n": 2}})
        private = await comm.receive_json_from(timeout=2)
        await comm.send_json_to({"ignorado": True})  # canal de solo lectura
        assert await comm.receive_nothing(timeout=0.2)
        await comm.disconnect()
        return connected, general, private

    connected, general, private = async_to_sync(scenario)()
    assert connected and general == {"n": 1} and private == {"n": 2}


@pytest.mark.django_db(transaction=True)
def test_other_users_do_not_receive_private_messages():
    ana, beto = make_user("ana"), make_user("beto")

    async def scenario():
        a = WebsocketCommunicator(APP, PATH, headers=cookie(str(AccessToken.for_user(ana))))
        b = WebsocketCommunicator(APP, PATH, headers=cookie(str(AccessToken.for_user(beto))))
        await a.connect()
        await b.connect()
        await get_channel_layer().group_send(f"user.{ana.pk}", {"type": "notification.message", "payload": {"x": 1}})
        got = await a.receive_json_from(timeout=2)
        silent = await b.receive_nothing(timeout=0.3)
        await a.disconnect()
        await b.disconnect()
        return got, silent

    got, silent = async_to_sync(scenario)()
    assert got == {"x": 1} and silent


@pytest.mark.django_db(transaction=True)
def test_channel_layer_failure_closes_with_1013(caplog):
    user = make_user("ana")

    async def scenario():
        comm = WebsocketCommunicator(APP, PATH, headers=cookie(str(AccessToken.for_user(user))))
        with patch("channels.layers.InMemoryChannelLayer.group_add", AsyncMock(side_effect=RuntimeError("redis caído"))):
            await comm.connect()
            out = await comm.receive_output(timeout=2)
        await comm.disconnect()
        return out

    with caplog.at_level(logging.ERROR, logger="realtime.consumers"):
        out = async_to_sync(scenario)()
    assert out["code"] == CHANNEL_LAYER_CLOSE_CODE
    assert any("channel layer" in r.getMessage() for r in caplog.records)


@pytest.mark.django_db(transaction=True)
def test_disconnect_tolerates_channel_layer_errors():
    user = make_user("ana")

    async def scenario():
        comm = WebsocketCommunicator(APP, PATH, headers=cookie(str(AccessToken.for_user(user))))
        await comm.connect()
        with patch("channels.layers.InMemoryChannelLayer.group_discard", AsyncMock(side_effect=RuntimeError("x"))):
            await comm.disconnect()

    async_to_sync(scenario)()


def test_disconnect_with_anonymous_scope_discards_only_global_group():
    consumer = NotificationConsumer()
    consumer.scope = {"user": None}
    consumer.channel_name = "chan"
    consumer.channel_layer = type("L", (), {"group_discard": AsyncMock()})()
    async_to_sync(consumer.disconnect)(1000)
    consumer.channel_layer.group_discard.assert_awaited_once_with(NOTIFICATIONS_GROUP, "chan")


# ------------------------------------------------------------------ eventos
def test_events_are_noops_without_channel_layer():
    with patch("realtime.events.get_channel_layer", return_value=None):
        events.broadcast_notification({"a": 1})
        events.broadcast_to_users([1, 2], {"a": 1})


def test_events_swallow_channel_layer_errors(caplog):
    class Broken:
        async def group_send(self, *args, **kwargs):
            raise RuntimeError("redis caído")

    with patch("realtime.events.get_channel_layer", return_value=Broken()), caplog.at_level(logging.ERROR):
        events.broadcast_notification({"a": 1})
        events.broadcast_to_users({7}, {"a": 1})
    messages = " ".join(r.getMessage() for r in caplog.records)
    assert "No se pudo publicar la notificación (channel layer/Redis)" in messages
    assert "al usuario 7" in messages


def test_user_group_name():
    assert events.user_group(5) == "user.5"


@pytest.mark.django_db(transaction=True)
def test_broadcast_helpers_reach_connected_clients():
    user = make_user("ana")

    async def scenario():
        comm = WebsocketCommunicator(APP, PATH, headers=cookie(str(AccessToken.for_user(user))))
        await comm.connect()
        from asgiref.sync import sync_to_async

        await sync_to_async(events.broadcast_notification)({"todos": True})
        first = await comm.receive_json_from(timeout=2)
        await sync_to_async(events.broadcast_to_users)([user.pk, user.pk], {"yo": True})
        second = await comm.receive_json_from(timeout=2)
        assert await comm.receive_nothing(timeout=0.2)  # set(): sin duplicados
        await comm.disconnect()
        return first, second

    assert async_to_sync(scenario)() == ({"todos": True}, {"yo": True})


# ------------------------------------------------------------ middleware / ASGI
def test_raw_token_extraction():
    assert _raw_token_from_scope({"headers": []}) is None
    assert _raw_token_from_scope({}) is None
    assert _raw_token_from_scope({"headers": [(b"authorization", b"Bearer  abc ")]}) == "abc"
    assert _raw_token_from_scope({"headers": [(b"authorization", b"bearer xyz")]}) == "xyz"
    assert _raw_token_from_scope({"headers": [(b"cookie", b"access_token=tok; other=1")]}) == "tok"
    assert _raw_token_from_scope({"headers": [(b"cookie", b"other=1")]}) is None


@pytest.mark.django_db(transaction=True)
def test_user_from_token_helper():
    user = make_user("ana")
    resolved = async_to_sync(middleware._user_from_token)(str(AccessToken.for_user(user)))
    assert resolved.pk == user.pk
    assert isinstance(async_to_sync(middleware._user_from_token)("basura"), AnonymousUser)


def test_routing_exposes_the_notifications_endpoint():
    assert len(websocket_urlpatterns) == 1
    assert websocket_urlpatterns[0].pattern.match("ws/notifications/") is not None
    assert websocket_urlpatterns[0].pattern.match("ws/otro/") is None


@pytest.mark.django_db(transaction=True)
def test_full_asgi_application_validates_origin_and_serves_websocket():
    from config.asgi import application

    user = make_user("ana")
    headers = cookie(str(AccessToken.for_user(user))) + [(b"origin", b"http://localhost")]

    async def ok():
        comm = WebsocketCommunicator(application, PATH, headers=headers)
        connected, _ = await comm.connect()
        await comm.disconnect()
        return connected

    async def bad_origin():
        comm = WebsocketCommunicator(
            application, PATH, headers=cookie(str(AccessToken.for_user(user))) + [(b"origin", b"http://evil.example")]
        )
        connected, _ = await comm.connect()
        return connected

    assert async_to_sync(ok)() is True
    assert async_to_sync(bad_origin)() is False
