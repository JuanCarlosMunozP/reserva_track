"""Configuración: URLs, ASGI/WSGI/Celery, manage.py y módulos de settings."""
import importlib
import os
import runpy
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.test import Client
from django.urls import clear_url_caches

from .conftest import api

BACKEND = Path(__file__).resolve().parent.parent


def _reload_urls():
    import config.urls

    importlib.reload(config.urls)
    clear_url_caches()


# --------------------------------------------------------------- /admin
def test_admin_redirects_to_frontend_on_loopback(settings, db):
    settings.FRONTEND_BASE_URL = "http://127.0.0.1:5173"
    response = Client().get("/admin", HTTP_HOST="localhost:8000")
    assert response.status_code == 302 and response["Location"] == "http://localhost:5173/"


def test_admin_redirects_to_public_frontend_in_production(settings, db):
    settings.FRONTEND_BASE_URL = "https://app.example.com/"
    settings.ALLOWED_HOSTS = ["*"]
    response = Client().get("/admin", HTTP_HOST="api.example.com")
    assert response.status_code == 302 and response["Location"] == "https://app.example.com/"
    # un host loopback con frontend público tampoco usa el atajo local
    response = Client().get("/admin", HTTP_HOST="localhost")
    assert response["Location"] == "https://app.example.com/"


def test_admin_with_extra_char_is_also_redirected(settings, db):
    settings.FRONTEND_BASE_URL = "https://app.example.com"
    assert Client().get("/admin/x", HTTP_HOST="localhost").status_code == 302


def test_admin_redirect_loopback_frontend_without_port(settings, db):
    settings.FRONTEND_BASE_URL = "http://localhost"
    client = Client()
    client.raise_request_exception = False
    response = client.get("/admin", HTTP_HOST="localhost")
    assert response.status_code == 302 and response["Location"] == "http://localhost/"


def test_admin_trailing_slash_redirects(settings, db):
    settings.FRONTEND_BASE_URL = "https://app.example.com"
    assert Client().get("/admin/", HTTP_HOST="localhost").status_code == 302


# ------------------------------------------------------------- OpenAPI
def test_openapi_schema_and_swagger_are_served(db):
    client = Client()
    client.raise_request_exception = False
    assert client.get("/api/schema/").status_code == 200
    assert client.get("/api/docs/").status_code == 200


def test_redoc_is_served(db):
    client = Client()
    client.raise_request_exception = False
    assert client.get("/api/redoc/").status_code == 200


def test_django_admin_is_mounted(db):
    assert Client().get("/django-admin/login/").status_code == 200


# ----------------------------------------------------------- DEBUG routes
def test_debug_routes_are_added_when_debug_is_on(settings):
    settings.DEBUG = True
    try:
        _reload_urls()
        import config.urls

        patterns = [str(p.pattern) for p in config.urls.urlpatterns]
        assert any(p.startswith("^media") for p in patterns)
        assert any("__debug__" in p for p in patterns)
    finally:
        settings.DEBUG = False
        _reload_urls()


def test_media_files_are_served_in_debug(settings):
    settings.DEBUG = True
    try:
        _reload_urls()
        client = Client()
        client.raise_request_exception = False
        assert client.get(f"{settings.MEDIA_URL}inexistente.png").status_code == 404
    finally:
        settings.DEBUG = False
        _reload_urls()


# ----------------------------------------------- ASGI / WSGI / Celery / manage
def test_asgi_wsgi_and_celery_modules_expose_their_apps():
    import config.asgi
    import config.celery
    import config.wsgi

    assert set(config.asgi.application.application_mapping) == {"http", "websocket"}
    assert callable(config.wsgi.application)
    assert config.celery.app.main == "reserva_track"


def test_manage_main_runs_check(capsys, monkeypatch):
    monkeypatch.setattr(sys, "argv", ["manage.py", "check"])
    runpy.run_path(str(BACKEND / "manage.py"), run_name="__main__")
    assert "no issues" in capsys.readouterr().out


def test_manage_reports_missing_django(monkeypatch):
    namespace = runpy.run_path(str(BACKEND / "manage.py"), run_name="manage_under_test")
    with patch.dict(sys.modules, {"django.core.management": None}):
        with pytest.raises(ImportError, match="Couldn't import Django"):
            namespace["main"]()


# ------------------------------------------------------------- settings
@pytest.fixture
def fresh_settings(monkeypatch):
    """Permite reimportar los módulos de settings con otro entorno y deja todo como estaba."""
    names = ("config.settings.base", "config.settings.dev", "config.settings.prod")
    saved = {n: sys.modules.get(n) for n in names}

    def load(module, **env):
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        for n in names:
            sys.modules.pop(n, None)
        return importlib.import_module(module)

    yield load
    for n, mod in saved.items():
        sys.modules.pop(n, None)
        if mod is not None:
            sys.modules[n] = mod


def test_base_uses_s3_storage_only_with_credentials(fresh_settings):
    base = fresh_settings("config.settings.base", AWS_ACCESS_KEY_ID="id", AWS_STORAGE_BUCKET_NAME="bucket")
    assert base.STORAGES["default"]["BACKEND"] == "storages.backends.s3.S3Storage"
    base = fresh_settings("config.settings.base", AWS_ACCESS_KEY_ID="", AWS_STORAGE_BUCKET_NAME="")
    assert base.STORAGES["default"]["BACKEND"] == "django.core.files.storage.FileSystemStorage"


def test_base_initializes_sentry_when_dsn_is_set(fresh_settings):
    with patch("sentry_sdk.init") as init:
        fresh_settings("config.settings.base", SENTRY_DSN="https://key@o0.ingest.sentry.io/1",
                       SENTRY_ENVIRONMENT="qa", SENTRY_TRACES_SAMPLE_RATE="0.5")
    kwargs = init.call_args.kwargs
    assert kwargs["dsn"].startswith("https://key@") and kwargs["environment"] == "qa"
    assert kwargs["traces_sample_rate"] == 0.5 and kwargs["send_default_pii"] is False
    with patch("sentry_sdk.init") as init:
        fresh_settings("config.settings.base", SENTRY_DSN="")
    init.assert_not_called()


def test_dev_settings_enable_toolbar_only_if_installed(fresh_settings):
    dev = fresh_settings("config.settings.dev")
    assert dev.DEBUG is True and "debug_toolbar" in dev.INSTALLED_APPS
    with patch.dict(sys.modules, {"debug_toolbar": None}):
        dev = fresh_settings("config.settings.dev")
    assert "debug_toolbar" not in dev.INSTALLED_APPS
    assert dev.CORS_ALLOW_ALL_ORIGINS is False and dev.CORS_ALLOW_CREDENTIALS is True


GOOD_PROD = dict(
    DJANGO_SECRET_KEY="x" * 60,
    DJANGO_ALLOWED_HOSTS="reservas.example.com",
    CORS_ALLOWED_ORIGINS="https://reservas.example.com",
    CSRF_TRUSTED_ORIGINS="https://reservas.example.com",
    FRONTEND_BASE_URL="https://reservas.example.com",
)


def test_prod_settings_accept_a_hardened_configuration(fresh_settings):
    prod = fresh_settings("config.settings.prod", **GOOD_PROD)
    assert prod.DEBUG is False and prod.SECURE_SSL_REDIRECT and prod.AUTH_COOKIE_SECURE
    assert prod.SECURE_HSTS_SECONDS == 31536000 and prod.X_FRAME_OPTIONS == "DENY"
    assert prod.CONTENT_SECURITY_POLICY["DIRECTIVES"]["upgrade-insecure-requests"] is True


@pytest.mark.parametrize("override", [
    {"DJANGO_SECRET_KEY": ""},                        # vacía
    {"DJANGO_SECRET_KEY": "insecure-default-change-me"},
    {"DJANGO_SECRET_KEY": "corta"},                   # < 50 caracteres
])
def test_prod_rejects_weak_secret_key(fresh_settings, override):
    with pytest.raises(ImproperlyConfigured):
        fresh_settings("config.settings.prod", **{**GOOD_PROD, **override})


@pytest.mark.parametrize("override,message", [
    ({"DJANGO_ALLOWED_HOSTS": "*"}, "ALLOWED_HOSTS"),
    ({"DJANGO_ALLOWED_HOSTS": "a.com,*"}, "ALLOWED_HOSTS"),
    ({"CORS_ALLOWED_ORIGINS": "http://reservas.example.com"}, "CORS_ALLOWED_ORIGINS"),
    ({"FRONTEND_BASE_URL": "http://reservas.example.com"}, "FRONTEND_BASE_URL"),
    ({"CSRF_TRUSTED_ORIGINS": "http://reservas.example.com"}, "CSRF_TRUSTED_ORIGINS"),
])
def test_prod_rejects_insecure_hosts_and_origins(fresh_settings, override, message):
    with pytest.raises(ImproperlyConfigured, match=message):
        fresh_settings("config.settings.prod", **{**GOOD_PROD, **override})


def test_prod_rejects_empty_allowed_hosts(fresh_settings):
    with pytest.raises(ImproperlyConfigured, match="ALLOWED_HOSTS"):
        fresh_settings("config.settings.prod", **{**GOOD_PROD, "DJANGO_ALLOWED_HOSTS": ""})


def test_env_file_uses_the_variable_name_the_settings_read():
    """Regresión: .env debe declarar DJANGO_SECRET_KEY, el nombre que realmente lee base.py;
    con otro nombre se usaría silenciosamente el valor por defecto inseguro."""
    env_file = (BACKEND / ".env").read_text(encoding="utf-8")
    declared = {line.split("=", 1)[0].strip() for line in env_file.splitlines() if "=" in line and not line.lstrip().startswith("#")}
    assert "DJANGO_SECRET_KEY" in declared
