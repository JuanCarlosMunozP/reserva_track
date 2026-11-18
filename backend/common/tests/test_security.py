import json

import pytest
from django.test import RequestFactory
from rest_framework import serializers

from common.middleware import RequestGuardMiddleware, SecurityHeadersMiddleware
from common.security import (
    SanitizedSerializerMixin,
    UnsafeInput,
    clean_text,
    find_injection,
)
from django.http import HttpResponse


@pytest.mark.parametrize("payload", [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "＜script＞alert(1)＜/script＞",
    "javascript:alert(1)",
    "JaVa​ScRiPt:alert(1)",
    "&#60;script&#62;",
    "hola‮txt.exe",
    "x onload=evil()",
])
def test_clean_text_rejects_xss(payload):
    with pytest.raises(UnsafeInput):
        clean_text(payload)


@pytest.mark.parametrize("ok", ["Laboratorio de Física", "Sede Norte & Sur", "Reunión 10:00-12:00", "María José"])
def test_clean_text_allows_legit(ok):
    assert clean_text(ok) == ok


def test_urls_blocked_only_when_requested():
    assert clean_text("ver https://x.co", allow_urls=True)
    with pytest.raises(UnsafeInput):
        clean_text("Gana premio en www.evil.com", allow_urls=False)
    with pytest.raises(UnsafeInput):
        clean_text("http://evil.com", allow_urls=False)


@pytest.mark.parametrize("payload", [
    "1 UNION SELECT password FROM users",
    "' OR '1'='1",
    "1; DROP TABLE users",
    "x' --",
    "1 or 1=1",
    "pg_sleep(5)",
    "../../etc/passwd",
    "a\x00b",
    "{{7*7}}",
])
def test_find_injection_detects(payload):
    assert find_injection(payload)


@pytest.mark.parametrize("ok", ["seleccionar espacio", "unión de cursos", "Aula 2-B", "O'Brien", "Sala 10 y 11"])
def test_find_injection_ignores_legit(ok):
    assert find_injection(ok) is None


def _guard(request):
    return RequestGuardMiddleware(lambda r: HttpResponse("ok"))(request)


def test_guard_blocks_query_injection():
    rf = RequestFactory()
    assert _guard(rf.get("/api/v1/spaces/", {"search": "1' OR '1'='1"})).status_code == 400
    assert _guard(rf.get("/api/v1/spaces/", {"search": "laboratorio"})).status_code == 200


def test_guard_blocks_json_body_but_skips_password():
    rf = RequestFactory()
    bad = rf.post("/api/v1/x/", data=json.dumps({"reason": "a UNION SELECT b"}), content_type="application/json")
    assert _guard(bad).status_code == 400
    pw = rf.post("/api/v1/x/", data=json.dumps({"password": "p' OR '1'='1 --x"}), content_type="application/json")
    assert _guard(pw).status_code == 200


def test_security_headers():
    rf = RequestFactory()
    resp = SecurityHeadersMiddleware(lambda r: HttpResponse("ok"))(rf.get("/api/v1/health/"))
    assert resp["Cache-Control"].startswith("no-store")
    assert "Permissions-Policy" in resp


class _S(SanitizedSerializerMixin, serializers.Serializer):
    name = serializers.CharField()
    password = serializers.CharField(required=False)


def test_serializer_mixin():
    s = _S(data={"name": "<b>x</b>"})
    assert not s.is_valid() and "name" in s.errors
    s = _S(data={"name": "Ana", "password": "<pw>' OR 1=1"})
    assert s.is_valid(), s.errors
    s = _S(data={"name": "http://evil.com"})
    assert not s.is_valid()
