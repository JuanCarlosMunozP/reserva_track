"""Autenticación por cookies httpOnly + CSRF, refresh, logout y health."""
from unittest.mock import MagicMock, patch

import pytest
from django.conf import settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .conftest import PASSWORD, api, make_user

CSRF = "a" * 32
LOGIN = "/api/v1/auth/token/cookie/"
REFRESH = "/api/v1/auth/token/cookie/refresh/"
LOGOUT = "/api/v1/auth/token/cookie/logout/"
ACCESS = settings.AUTH_COOKIE_ACCESS_NAME
REFRESH_NAME = settings.AUTH_COOKIE_REFRESH_NAME


def csrf_client():
    """Cliente que SÍ valida CSRF (el APIClient normal lo omite)."""
    client = APIClient(enforce_csrf_checks=True)
    client.raise_request_exception = False
    return client


def with_csrf(client, token=CSRF):
    client.cookies["csrftoken"] = token
    return {"HTTP_X_CSRFTOKEN": token}


# ----------------------------------------------------------------- login
def test_cookie_login_sets_httponly_cookies_and_hides_tokens(db):
    user = make_user("ana")
    response = api().post(LOGIN, {"username": user.username, "password": PASSWORD}, format="json")

    assert response.status_code == 200
    assert "access" not in response.data and "refresh" not in response.data
    for name in (ACCESS, REFRESH_NAME):
        assert response.cookies[name]["httponly"]
        assert response.cookies[name].value
    assert "csrftoken" in response.cookies


def test_cookie_login_wrong_password_sets_no_cookies(db):
    user = make_user("ana")
    response = api().post(LOGIN, {"username": user.username, "password": "mala"}, format="json")

    assert response.status_code == 401
    assert ACCESS not in response.cookies


def test_body_login_returns_tokens_for_mobile_clients(db):
    user = make_user("ana")
    response = api().post("/api/v1/auth/token/", {"username": user.username, "password": PASSWORD}, format="json")

    assert response.status_code == 200
    assert response.data["access"] and response.data["refresh"]


def test_login_is_rate_limited(db):
    user = make_user("ana")
    codes = [
        api().post("/api/v1/auth/token/", {"username": user.username, "password": PASSWORD}, format="json").status_code
        for _ in range(12)
    ]
    assert 429 in codes


# --------------------------------------------------------------- refresh
def test_refresh_without_cookie_returns_401(db):
    response = api().post(REFRESH)
    assert response.status_code == 401
    assert response.data["detail"] == "No hay refresh token."


def test_refresh_with_invalid_cookie_deletes_cookies(db):
    client = api()
    client.cookies[REFRESH_NAME] = "no-es-un-jwt"
    response = client.post(REFRESH)

    assert response.status_code == 401
    assert response.cookies[ACCESS].value == ""
    assert response.cookies[REFRESH_NAME].value == ""


def test_refresh_rotates_cookies(db):
    user = make_user("ana")
    client = api()
    client.cookies[REFRESH_NAME] = str(RefreshToken.for_user(user))
    response = client.post(REFRESH)

    assert response.status_code == 200
    assert response.data == {"detail": "ok"}
    assert response.cookies[ACCESS].value
    assert response.cookies[REFRESH_NAME].value
    assert "csrftoken" in response.cookies


def test_refresh_requires_csrf_header_when_enforced(db):
    user = make_user("ana")
    client = csrf_client()
    client.cookies[REFRESH_NAME] = str(RefreshToken.for_user(user))

    assert client.post(REFRESH).status_code == 403
    headers = with_csrf(client)
    assert client.post(REFRESH, **headers).status_code == 200


# ---------------------------------------------------------------- logout
def test_logout_blacklists_refresh_and_clears_cookies(db):
    user = make_user("ana")
    refresh = RefreshToken.for_user(user)
    client = api()
    client.cookies[REFRESH_NAME] = str(refresh)
    response = client.post(LOGOUT)

    assert response.status_code == 204
    assert response.cookies[REFRESH_NAME].value == ""
    assert BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists()


def test_logout_tolerates_garbage_or_missing_cookie(db):
    client = api()
    assert client.post(LOGOUT).status_code == 204
    client.cookies[REFRESH_NAME] = "basura"
    assert client.post(LOGOUT).status_code == 204


def test_logout_requires_csrf_when_enforced(db):
    assert csrf_client().post(LOGOUT).status_code == 403


# ------------------------------------------------- CookieJWTAuthentication
def test_authenticates_with_access_cookie(db):
    user = make_user("ana")
    client = api()
    client.cookies[ACCESS] = str(AccessToken.for_user(user))
    response = client.get("/api/v1/users/me/")

    assert response.status_code == 200
    assert response.data["username"] == "ana"


def test_authenticates_with_bearer_header(db):
    user = make_user("ana")
    response = api().get(
        "/api/v1/users/me/", HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}"
    )
    assert response.status_code == 200


def test_no_credentials_returns_401(db):
    assert api().get("/api/v1/users/me/").status_code == 401


def test_invalid_cookie_token_returns_401(db):
    client = api()
    client.cookies[ACCESS] = "token.invalido.x"
    assert client.get("/api/v1/users/me/").status_code == 401


def test_header_without_token_returns_401(db):
    assert api().get("/api/v1/users/me/", HTTP_AUTHORIZATION="Bearer").status_code == 401


def test_cookie_auth_enforces_csrf_on_unsafe_methods_only(db):
    user = make_user("ana")
    client = csrf_client()
    client.cookies[ACCESS] = str(AccessToken.for_user(user))

    assert client.get("/api/v1/auth/mfa/status/").status_code == 200  # método seguro: sin CSRF
    forbidden = client.post("/api/v1/auth/mfa/setup/")
    assert forbidden.status_code == 403
    headers = with_csrf(client)
    assert client.post("/api/v1/auth/mfa/setup/", **headers).status_code == 200


def test_header_auth_does_not_need_csrf(db):
    user = make_user("ana")
    client = csrf_client()
    response = client.post(
        "/api/v1/auth/mfa/setup/", HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}"
    )
    assert response.status_code == 200


# ----------------------------------------------------------------- health
def _redis_ok():
    return MagicMock(ping=MagicMock(return_value=True))


def test_health_ok(db):
    with patch("redis.Redis.from_url", return_value=_redis_ok()):
        response = api().get("/api/v1/health/")
    assert response.status_code == 200
    assert response.data == {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}


def test_health_degraded_when_redis_down(db):
    broken = MagicMock(ping=MagicMock(side_effect=ConnectionError("redis caído")))
    with patch("redis.Redis.from_url", return_value=broken):
        response = api().get("/api/v1/health/")
    assert response.status_code == 503
    assert response.data["status"] == "degraded"
    assert response.data["checks"]["redis"] == "error"  # sin filtrar el detalle


def test_health_degraded_when_database_down(db):
    with patch("redis.Redis.from_url", return_value=_redis_ok()), patch(
        "django.db.backends.base.base.BaseDatabaseWrapper.ensure_connection",
        side_effect=RuntimeError("db caída"),
    ):
        response = api().get("/api/v1/health/")
    assert response.status_code == 503
    assert response.data["checks"]["database"] == "error"  # sin filtrar el detalle
    assert response.data["checks"]["redis"] == "ok"


@pytest.mark.parametrize("secure", [True, False])
def test_cookie_secure_flag_follows_settings(db, settings, secure):
    settings.AUTH_COOKIE_SECURE = secure
    user = make_user("ana")
    response = api().post(LOGIN, {"username": user.username, "password": PASSWORD}, format="json")
    assert bool(response.cookies[ACCESS]["secure"]) is secure
