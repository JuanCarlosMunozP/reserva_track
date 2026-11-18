"""SC-003 con la capa de canales real (Redis): el aviso llega en < 5 s."""
import time

import pytest
from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from rest_framework_simplejwt.tokens import AccessToken

from config.asgi import application
from .conftest import api, assign, make_space

pytestmark = pytest.mark.django_db(transaction=True)


def test_notification_latency_with_real_redis(settings, student, admin, teacher):
    settings.ALLOWED_HOSTS = ["*"]
    import channels.layers as layers
    layers.channel_layers.backends.clear()
    space = make_space()
    assign(teacher, space)
    body = {"space": space.pk, "date": "2030-04-01", "start_time": "10:00", "end_time": "11:00", "reason": "x"}

    def conn(user):
        token = str(AccessToken.for_user(user))
        return WebsocketCommunicator(application, "/ws/notifications/",
                                     headers=[(b"origin", b"http://localhost"), (b"cookie", f"access_token={token}".encode())])

    async def run():
        a, t = conn(admin), conn(teacher)
        assert (await a.connect())[0] and (await t.connect())[0]
        start = time.perf_counter()
        res = await sync_to_async(lambda: api(student).post("/api/v1/reservations/", body, format="json"))()
        assert res.status_code == 201, res.content
        await a.receive_json_from(timeout=5)
        await t.receive_json_from(timeout=5)
        elapsed = time.perf_counter() - start
        print(f"LATENCIA_AVISO_S={elapsed:.3f}")
        assert elapsed < 5
        await a.disconnect(); await t.disconnect()
    async_to_sync(run)()
