"""RequestGuard, cabeceras de seguridad, sanitización y paginación."""
import json

import pytest
from django.http import HttpResponse
from django.test import Client, RequestFactory
from rest_framework import serializers
from rest_framework.test import APIClient

from common import middleware as mw
from common.middleware import RequestGuardMiddleware, SecurityHeadersMiddleware
from common.security import (
    SanitizedSerializerMixin,
    UnsafeInput,
    clean_text,
    find_injection,
    iter_strings,
    normalize_text,
)

from .conftest import api, make_space


def _guard():
    return RequestGuardMiddleware(lambda request: HttpResponse("pasó"))


rf = RequestFactory()


# ------------------------------------------------------------- RequestGuard
def test_guard_blocks_oversized_query_string():
    request = rf.get("/x/", QUERY_STRING="q=" + "a" * (mw.MAX_QUERY_STRING_LENGTH + 1))
    response = _guard()(request)
    assert response.status_code == 400
    assert "no permitido" in json.loads(response.content)["detail"]


@pytest.mark.parametrize("qs", [
    "q=1+union+select+password",
    "q=%27+or+1%3D1",
    "q=../../etc/passwd",
    "q={{7*7}}",
    "q=a%00b",
    "q=<script>alert(1)</script>",
])
def test_guard_blocks_injection_in_query_values(qs):
    assert _guard()(rf.get("/x/", QUERY_STRING=qs)).status_code == 400


def test_guard_inspects_query_keys_too():
    assert _guard()(rf.get("/x/", QUERY_STRING="union select=1")).status_code == 400


def test_guard_skips_sensitive_query_keys_and_allows_normal_text():
    assert _guard()(rf.get("/x/", QUERY_STRING="password=%27+or+1%3D1")).status_code == 200
    assert _guard()(rf.get("/x/", QUERY_STRING="q=seleccionar+espacio+union+de+cursos")).status_code == 200


def test_guard_blocks_injection_in_json_body():
    request = rf.post("/x/", data=json.dumps({"a": {"b": ["' OR 1=1 --"]}}), content_type="application/json")
    assert _guard()(request).status_code == 400


def test_guard_inspects_json_keys():
    request = rf.post("/x/", data=json.dumps({"1 union select 2": "x"}), content_type="application/json")
    assert _guard()(request).status_code == 400


def test_guard_ignores_sensitive_json_fields():
    request = rf.post("/x/", data=json.dumps({"password": "' OR 1=1 --"}), content_type="application/json")
    assert _guard()(request).status_code == 200


def test_guard_blocks_oversized_json_body():
    request = rf.post("/x/", data="{}", content_type="application/json", CONTENT_LENGTH=str(mw.MAX_JSON_BODY_BYTES + 1))
    assert _guard()(request).status_code == 400


def test_guard_lets_invalid_json_through_for_drf_to_reject():
    request = rf.post("/x/", data="{no-json", content_type="application/json")
    assert _guard()(request).status_code == 200


def test_guard_empty_body_and_non_json_content_type_are_ignored():
    assert _guard()(rf.post("/x/", data="", content_type="application/json")).status_code == 200
    assert _guard()(rf.post("/x/", data="union select 1", content_type="text/plain")).status_code == 200
    assert _guard()(rf.delete("/x/", data=json.dumps("' OR 1=1 --"), content_type="application/json")).status_code == 200


def test_guard_end_to_end_returns_400_and_logs(caplog, db):
    with caplog.at_level("WARNING", logger="django.security.requestguard"):
        response = Client().get("/api/v1/spaces/?search=1+union+select+x")
    assert response.status_code == 400
    assert any("Request bloqueada" in r.message for r in caplog.records)


def test_client_ip_prefers_remote_addr():
    assert mw._client_ip(rf.get("/", REMOTE_ADDR="9.9.9.9", HTTP_X_FORWARDED_FOR="1.1.1.1")) == "9.9.9.9"


# ---------------------------------------------------------- SecurityHeaders
def _headers(path):
    view = SecurityHeadersMiddleware(lambda request: HttpResponse("ok"))
    return view(rf.get(path))


def test_security_headers_on_api_are_no_store():
    response = _headers("/api/v1/spaces/")
    assert response["Cache-Control"] == "no-store, max-age=0"
    assert response["Pragma"] == "no-cache"
    assert "camera=()" in response["Permissions-Policy"]
    assert response["Cross-Origin-Resource-Policy"] == "same-site"
    assert response["X-Permitted-Cross-Domain-Policies"] == "none"


@pytest.mark.parametrize("path", ["/api/docs/", "/api/redoc/", "/api/schema/", "/otra/ruta/"])
def test_security_headers_skip_no_store_for_docs_and_non_api(path):
    response = _headers(path)
    assert "Cache-Control" not in response
    assert "Permissions-Policy" in response


# --------------------------------------------------------------- security.py
@pytest.mark.parametrize("value,category", [
    ("a\x00b", "null_byte"),
    ("1 UNION ALL SELECT 2", "sqli"),
    ("x' or '1'='1", "sqli"),
    ("x or 1=1", "sqli"),
    ("a; DROP TABLE users", "sqli"),
    ("pg_sleep(5)", "sqli"),
    ("information_schema.tables", "sqli"),
    ("x' -- comentario", "sqli"),
    ("../../etc/passwd", "traversal"),
    ("%2e%2e%2fsecret", "traversal"),
    ("{{ 7*7 }}", "template"),
    ("${jndi:ldap://x}", "template"),
    ("<script>x</script>", "xss"),
])
def test_find_injection_categories(value, category):
    assert find_injection(value) == category


def test_find_injection_accepts_plain_text():
    assert find_injection("Reserva del laboratorio de sistemas") is None


def test_normalize_and_clean_text():
    assert normalize_text("＜b＞") == "<b>"
    assert clean_text("Texto normal ñ") == "Texto normal ñ"
    with pytest.raises(UnsafeInput) as exc:
        clean_text("hola​mundo")
    assert exc.value.code == "control_chars"
    with pytest.raises(UnsafeInput) as exc:
        clean_text("<b>x</b>")
    assert exc.value.code == "markup"
    with pytest.raises(UnsafeInput) as exc:
        clean_text("visita www.malo.com", allow_urls=False)
    assert exc.value.code == "url"
    assert clean_text("visita www.malo.com", allow_urls=True)


def test_iter_strings_walks_nested_data_and_skips_sensitive_values():
    data = {"a": "x", "password": "secreto", "lista": ["y", ("z",)], "n": 5, "d": {"k": "v"}}
    assert sorted(iter_strings(data), key=str) == sorted(
        [(None, "a"), ("a", "x"), (None, "password"), (None, "lista"), ("lista", "y"), ("lista", "z"),
         (None, "n"), (None, "d"), (None, "k"), ("k", "v")], key=str,
    )
    assert list(iter_strings("suelto")) == [(None, "suelto")]
    assert list(iter_strings(42)) == []


class _Ser(SanitizedSerializerMixin, serializers.Serializer):
    name = serializers.CharField()
    note = serializers.CharField(required=False)
    password = serializers.CharField(required=False)


def test_sanitized_mixin_reports_every_unsafe_field():
    ser = _Ser(data={"name": "http://malo.com", "note": "<b>x</b>", "password": "<script>"})
    assert not ser.is_valid()
    assert set(ser.errors) == {"name", "note"}


def test_sanitized_mixin_accepts_clean_data_querydict_and_non_mappings():
    from django.http import QueryDict

    ser = _Ser(data=QueryDict("name=Ana&note=ok"))
    assert ser.is_valid(), ser.errors
    assert _Ser(data={"name": "Ana", "note": "visita www.ok.com"}).is_valid()  # URL permitida en `note`
    ser = _Ser(data=["no-es-dict"])
    assert not ser.is_valid()


# --------------------------------------------------------------- paginación
def test_pagination_honors_page_size_up_to_max(db):
    for i in range(5):
        make_space(f"Espacio {i}")
    client = api()
    assert len(client.get("/api/v1/spaces/?page_size=2").data["results"]) == 2
    assert client.get("/api/v1/spaces/?page_size=2").data["count"] == 5
    assert len(client.get("/api/v1/spaces/?page_size=999").data["results"]) == 5
    assert len(client.get("/api/v1/spaces/").data["results"]) == 5
