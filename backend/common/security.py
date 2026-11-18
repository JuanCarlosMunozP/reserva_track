"""Utilidades de seguridad: sanitización anti-XSS / anti-phishing y detección
de payloads de inyección.

Principio: la API es JSON y el frontend (React) escapa al renderizar, pero no
confiamos en eso como única defensa. Todo texto que entra se normaliza y se
RECHAZA (400) si contiene marcado HTML, esquemas ejecutables, caracteres de
control / spoofing bidireccional, o (en campos cortos tipo nombre) URLs que
sirvan de cebo para phishing en correos o notificaciones.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

# Campos que nunca se inspeccionan ni se modifican (contraseñas / tokens).
SENSITIVE_KEYS = frozenset(
    {"password", "current_password", "new_password", "refresh", "access", "token"}
)

# Control chars, zero-width y overrides bidireccionales (U+202A-202E, U+2066-2069):
# se usan para disfrazar URLs/nombres (spoofing) y evadir filtros.
_INVISIBLE = re.compile(
    "[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁠-⁤⁦-⁩﻿]"
)

_XSS_PATTERNS = (
    re.compile(r"[<>]"),
    re.compile(r"(?i)(?:java|vb)script\s*:"),
    re.compile(r"(?i)data\s*:\s*text/html"),
    re.compile(r"(?i)\bon[a-z]{3,20}\s*="),  # onerror=, onload=, onclick=...
    re.compile(r"(?i)&#x?[0-9a-f]+;?|&(?:lt|gt|quot|apos);"),  # entidades que re-crean <>
    re.compile(r"(?i)\bexpression\s*\("),
)

_URL_PATTERN = re.compile(
    r"(?i)(?:\b[a-z][a-z0-9+.-]{1,15}://|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|info|xyz|top|ru|cn|tk|ml|ga|cf|gq|zip|mov|click|link)\b|//[a-z0-9.-]+)"
)

# Firmas de SQLi / traversal / template injection. Deliberadamente estrechas
# para no bloquear texto legítimo ("seleccionar espacio", "unión de cursos").
_INJECTION_PATTERNS = (
    ("sqli", re.compile(r"(?i)\bunion\b\s+(?:all\s+)?\bselect\b")),
    ("sqli", re.compile(r"(?i)['\"]\s*(?:or|and)\s+['\"]?\d+['\"]?\s*=\s*['\"]?\d+")),
    ("sqli", re.compile(r"(?i)\b(?:or|and)\s+\d+\s*=\s*\d+\b")),
    ("sqli", re.compile(r"(?i);\s*(?:drop|delete|insert|update|alter|truncate|create|exec)\b")),
    ("sqli", re.compile(r"(?i)\b(?:pg_sleep|sleep|benchmark|waitfor\s+delay)\s*\(")),
    ("sqli", re.compile(r"(?i)\binformation_schema\b|\bpg_catalog\b|\bxp_cmdshell\b")),
    ("sqli", re.compile(r"(?i)['\"]\s*(?:--|#|/\*)")),
    ("traversal", re.compile(r"(?:\.\./|\.\.\\|%2e%2e%2f|%2e%2e/|\.\.%2f)", re.IGNORECASE)),
    ("template", re.compile(r"\{\{.*?\}\}|\{%.*?%\}|\$\{.*?\}")),
    ("xss", re.compile(r"(?i)<\s*/?\s*(?:script|iframe|object|embed|svg|img|link|meta|style|form)\b")),
    ("xss", re.compile(r"(?i)(?:java|vb)script\s*:")),
)


class UnsafeInput(ValueError):
    """Entrada rechazada por contener contenido peligroso."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def normalize_text(value: str) -> str:
    """NFKC (colapsa `＜script＞` fullwidth a `<script>`) + quita invisibles."""
    value = unicodedata.normalize("NFKC", value)
    return _INVISIBLE.sub("", value)


def clean_text(value: str, *, allow_urls: bool = True) -> str:
    """Normaliza y valida un texto. Lanza `UnsafeInput` si es peligroso."""
    original = value
    value = normalize_text(value)
    if value != original and _INVISIBLE.search(original):
        raise UnsafeInput("control_chars", "El texto contiene caracteres no permitidos.")
    for pattern in _XSS_PATTERNS:
        if pattern.search(value):
            raise UnsafeInput("markup", "No se permite código HTML ni scripts en este campo.")
    if not allow_urls and _URL_PATTERN.search(value):
        raise UnsafeInput("url", "No se permiten enlaces en este campo.")
    return value


def find_injection(value: str) -> str | None:
    """Devuelve la categoría de ataque detectada en `value`, o None."""
    if "\x00" in value:
        return "null_byte"
    candidate = normalize_text(value)
    for category, pattern in _INJECTION_PATTERNS:
        if pattern.search(candidate):
            return category
    return None


def iter_strings(data: Any, key: str | None = None):
    """Recorre recursivamente un JSON devolviendo (clave, string) omitiendo
    campos sensibles. Las claves también se inspeccionan."""
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(k, str):
                yield None, k
            yield from iter_strings(v, k if isinstance(k, str) else None)
    elif isinstance(data, (list, tuple)):
        for item in data:
            yield from iter_strings(item, key)
    elif isinstance(data, str):
        if key is None or key.lower() not in SENSITIVE_KEYS:
            yield key, data


class SanitizedSerializerMixin:
    """Mixin para serializers DRF: sanitiza TODOS los strings de entrada antes
    de que corra la validación de campos.

    - `url_blocked_fields`: campos cortos (nombres, curso, área...) donde además
      se prohíben URLs (vector clásico de phishing en correos/notificaciones).
    - Los campos de `SENSITIVE_KEYS` (contraseñas) se dejan intactos.
    """

    url_blocked_fields: frozenset[str] = frozenset(
        {"username", "first_name", "last_name", "course", "area", "name", "location", "code"}
    )

    def to_internal_value(self, data):  # type: ignore[override]
        if hasattr(data, "items"):
            cleaned = data.copy() if hasattr(data, "copy") else dict(data)
            errors: dict[str, list[str]] = {}
            for key, value in data.items():
                if not isinstance(value, str) or key.lower() in SENSITIVE_KEYS:
                    continue
                try:
                    cleaned[key] = clean_text(
                        value, allow_urls=key not in self.url_blocked_fields
                    )
                except UnsafeInput as exc:
                    errors[key] = [str(_(str(exc)))]
            if errors:
                raise serializers.ValidationError(errors)
            data = cleaned
        return super().to_internal_value(data)  # type: ignore[misc]
