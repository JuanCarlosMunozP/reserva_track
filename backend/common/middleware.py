"""Middlewares de endurecimiento.

- `RequestGuardMiddleware`: corta en la puerta las peticiones "inofensivas"
  que en realidad llevan payloads de SQLi / XSS / path traversal / null bytes
  en la query string o en el cuerpo JSON. El ORM de Django ya parametriza las
  consultas; esto es defensa en profundidad + registro de intentos.
- `SecurityHeadersMiddleware`: cabeceras anti-phishing / anti-leak que Django
  no pone por defecto (Permissions-Policy, no-store en la API, CORP...).
"""
from __future__ import annotations

import json
import logging
from urllib.parse import parse_qsl

from django.http import JsonResponse

from .security import SENSITIVE_KEYS, find_injection, iter_strings

logger = logging.getLogger("django.security.requestguard")

MAX_QUERY_STRING_LENGTH = 2048
MAX_JSON_BODY_BYTES = 256 * 1024
_BODY_METHODS = {"POST", "PUT", "PATCH"}


def _client_ip(request) -> str:
    # REMOTE_ADDR: no confiamos en X-Forwarded-For arbitrario (spoofeable).
    return request.META.get("REMOTE_ADDR", "?")


class RequestGuardMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        reason = self._inspect(request)
        if reason:
            logger.warning(
                "Request bloqueada [%s] ip=%s method=%s path=%s",
                reason,
                _client_ip(request),
                request.method,
                request.path[:200],
            )
            return JsonResponse(
                {"detail": "Solicitud rechazada por contener contenido no permitido."},
                status=400,
            )
        return self.get_response(request)

    def _inspect(self, request) -> str | None:
        raw_qs = request.META.get("QUERY_STRING", "")
        if len(raw_qs) > MAX_QUERY_STRING_LENGTH:
            return "query_too_long"

        for key, value in parse_qsl(raw_qs, keep_blank_values=True):
            if key.lower() in SENSITIVE_KEYS:
                continue
            for text in (key, value):
                category = find_injection(text)
                if category:
                    return f"query:{category}"

        content_type = (request.content_type or "").lower()
        if request.method in _BODY_METHODS and content_type == "application/json":
            length = int(request.META.get("CONTENT_LENGTH") or 0)
            if length > MAX_JSON_BODY_BYTES:
                return "body_too_large"
            try:
                payload = json.loads(request.body or b"null")
            except (ValueError, UnicodeDecodeError):
                return None  # JSON inválido: lo rechaza DRF con 400 propio.
            for _key, text in iter_strings(payload):
                category = find_injection(text)
                if category:
                    return f"body:{category}"
        return None


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
        )
        response.setdefault("X-Permitted-Cross-Domain-Policies", "none")
        response.setdefault("Cross-Origin-Resource-Policy", "same-site")
        # Respuestas de la API con datos de sesión/usuario: nunca en caché
        # compartida ni del navegador.
        if request.path.startswith("/api/") and not request.path.startswith(
            ("/api/docs", "/api/redoc", "/api/schema")
        ):
            response["Cache-Control"] = "no-store, max-age=0"
            response["Pragma"] = "no-cache"
        return response


__all__ = ["RequestGuardMiddleware", "SecurityHeadersMiddleware"]
