"""ASGI config: HTTP (Django) + WebSocket (Channels)."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE","config.settings.dev")

django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator

from realtime.middleware import CookieJWTAuthMiddleware
from realtime.routing import websocket_urlpatterns # noqa: E402

application = ProtocolTypeRouter(
    {
        "http":django_asgi_app,
        "websocket":AllowedHostsOriginValidator(
            CookieJWTAuthMiddleware(URLRouter(websocket_urlpatterns))
        )
    }
)