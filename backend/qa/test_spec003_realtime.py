"""FR-045..FR-047: el canal ws/notifications/ entrega solo a destinatarios y no rompe operaciones."""
import pytest
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from rest_framework_simplejwt.tokens import AccessToken

from config.asgi import application
from realtime.consumers import AUTH_CLOSE_CODE
from realtime.events import broadcast_to_users
from qa.conftest import api, assign, make_space, make_user
from users.models import User

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def in_memory_layer(settings):
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    import channels.layers as layers
    layers.channel_layers.backends.clear()
    yield
    layers.channel_layers.backends.clear()


def _communicator(user=None, *, cookie=True, bearer=False):
    headers = [(b"origin", b"http://localhost")]
    if user is not None:
        token = str(AccessToken.for_user(user))
        if cookie:
            headers.append((b"cookie", f"access_token={token}".encode()))
        if bearer:
            headers.append((b"authorization", f"Bearer {token}".encode()))
    return WebsocketCommunicator(application, "/ws/notifications/", headers=headers)


def test_anonymous_connection_is_closed_with_4401(settings):
    settings.ALLOWED_HOSTS = ["*"]

    async def run():
        comm = _communicator()
        connected, _ = await comm.connect()
        assert connected
        message = await comm.receive_output()
        assert message["type"] == "websocket.close" and message["code"] == AUTH_CLOSE_CODE
    async_to_sync(run)()


def test_cookie_and_bearer_authenticate_and_only_target_user_receives(settings, student, teacher):
    settings.ALLOWED_HOSTS = ["*"]
    payload = {"type": "reservation_reviewed", "code": "RT-2026-0001", "status": "approved"}

    async def run():
        mine = _communicator(student)
        other = _communicator(teacher, cookie=False, bearer=True)
        assert (await mine.connect())[0] and (await other.connect())[0]
        layer = get_channel_layer()
        await layer.group_send(f"user.{student.pk}", {"type": "notification.message", "payload": payload})
        assert await mine.receive_json_from() == payload
        assert await other.receive_nothing()
        await mine.send_json_to({"type": "hack", "group": "user.1"})  # se ignora
        assert await mine.receive_nothing() and await other.receive_nothing()
        await mine.disconnect()
        await other.disconnect()
    async_to_sync(run)()


def test_invalid_token_is_treated_as_anonymous(settings):
    settings.ALLOWED_HOSTS = ["*"]

    async def run():
        comm = WebsocketCommunicator(
            application, "/ws/notifications/",
            headers=[(b"origin", b"http://localhost"), (b"cookie", b"access_token=basura")],
        )
        assert (await comm.connect())[0]
        assert (await comm.receive_output())["code"] == AUTH_CLOSE_CODE
    async_to_sync(run)()


def test_broadcast_failure_is_logged_and_swallowed(monkeypatch, caplog):
    class Broken:
        async def group_send(self, *a, **k):
            raise ConnectionError("redis caído")
    monkeypatch.setattr("realtime.events.get_channel_layer", lambda: Broken())
    broadcast_to_users({1, 2}, {"x": 1})  # no debe lanzar
    assert "No se pudo publicar la notificación" in caplog.text


def test_reservation_flow_survives_broken_channel_layer(monkeypatch, student, admin):
    class Broken:
        async def group_send(self, *a, **k):
            raise ConnectionError("redis caído")
    monkeypatch.setattr("realtime.events.get_channel_layer", lambda: Broken())
    space = make_space()
    body = {"space": space.pk, "date": "2030-03-01", "start_time": "08:00", "end_time": "09:00", "reason": "x"}
    created = api(student).post("/api/v1/reservations/", body, format="json")
    assert created.status_code == 201, created.content
    reviewed = api(admin).post(f"/api/v1/reservations/{created.data['id']}/approve/")
    assert reviewed.status_code == 200 and reviewed.data["status"] == "approved"


def test_creation_notifies_admin_and_responsible_but_not_requester(settings, student, admin, teacher):
    from asgiref.sync import sync_to_async

    settings.ALLOWED_HOSTS = ["*"]
    space = make_space()
    assign(teacher, space)
    body = {"space": space.pk, "date": "2030-03-02", "start_time": "10:00", "end_time": "11:00", "reason": "x"}

    def post():
        return api(student).post("/api/v1/reservations/", body, format="json")

    async def run():
        comms = {}
        for name, user in (("admin", admin), ("teacher", teacher), ("student", student)):
            comms[name] = _communicator(user)
            assert (await comms[name].connect())[0]
        assert (await sync_to_async(post)()).status_code == 201
        for name in ("admin", "teacher"):
            event = await comms[name].receive_json_from()
            assert event["type"] == "reservation_created" and event["space_name"] == space.name
            assert {"code", "date", "start_time", "end_time", "status"} <= event.keys()
        assert await comms["student"].receive_nothing()
        for c in comms.values():
            await c.disconnect()
    async_to_sync(run)()
