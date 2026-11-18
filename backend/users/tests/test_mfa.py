"""Pruebas de MFA (TOTP por QR): flujo feliz y, sobre todo, los casos de ataque."""
import time as real_time

import pyotp
import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from users import mfa
from users.models import MFADevice, User

PASSWORD = "Str0ng-Pass-123!"

LOGIN = "/api/v1/auth/token/cookie/"
LOGIN_BODY = "/api/v1/auth/token/"
VERIFY = "/api/v1/auth/mfa/verify/"
VERIFY_COOKIE = "/api/v1/auth/mfa/verify/cookie/"
SETUP = "/api/v1/auth/mfa/setup/"
CONFIRM = "/api/v1/auth/mfa/confirm/"
STATUS = "/api/v1/auth/mfa/status/"
DISABLE = "/api/v1/auth/mfa/disable/"
RECOVERY = "/api/v1/auth/mfa/recovery-codes/"


class Clock:
    """Reloj controlable: los TOTP dependen del tiempo y el anti-replay impide
    reutilizar un paso, así que los tests avanzan el reloj entre intentos."""

    def __init__(self):
        self.now = real_time.time()

    def time(self):
        return self.now

    def tick(self, steps=1):
        self.now += 30 * steps


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    cache.clear()  # throttles (scope "mfa"/"login") viven en caché
    c = Clock()
    monkeypatch.setattr(mfa, "time", c)
    return c


def totp(secret, clock):
    return pyotp.TOTP(secret).at(clock.now)


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="ana", email="ana@example.com", password=PASSWORD,
        first_name="Ana", last_name="Gómez", role=User.Role.USER,
        type=User.Type.TEACHER, area="Ciencias",
    )


@pytest.fixture
def authed(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def enroll(user, clock):
    """Activa MFA para `user` y devuelve (secret, recovery_codes)."""
    c = APIClient()
    c.force_authenticate(user)
    secret = c.post(SETUP).json()["secret"]
    codes = c.post(CONFIRM, {"code": totp(secret, clock)}, format="json").json()[
        "recovery_codes"
    ]
    clock.tick()
    return secret, codes


def password_login(url=LOGIN):
    return APIClient().post(
        url, {"username": "ana", "password": PASSWORD}, format="json"
    )


# --------------------------------------------------------------------------- #
# Enrolamiento
# --------------------------------------------------------------------------- #
def test_setup_returns_qr_and_does_not_protect_until_confirmed(authed, user):
    res = authed.post(SETUP)
    assert res.status_code == 200
    data = res.json()
    assert data["qr"].startswith("data:image/svg+xml;base64,")
    assert data["otpauth_uri"].startswith("otpauth://totp/ReservaTrack:")
    assert "secret=" + data["secret"] in data["otpauth_uri"]
    # Sin confirmar, el login sigue siendo sólo contraseña.
    assert not mfa.user_has_mfa(user)
    assert "access_token" in password_login().cookies


def test_secret_is_encrypted_at_rest(authed, user):
    secret = authed.post(SETUP).json()["secret"]
    stored = MFADevice.objects.get(user=user).secret_encrypted
    assert secret not in stored
    assert mfa.decrypt_secret(stored) == secret


def test_confirm_rejects_wrong_code_and_accepts_right_one(authed, user, clock):
    secret = authed.post(SETUP).json()["secret"]
    assert authed.post(CONFIRM, {"code": "000000"}, format="json").status_code == 400
    assert not mfa.user_has_mfa(user)

    res = authed.post(CONFIRM, {"code": totp(secret, clock)}, format="json")
    assert res.status_code == 200
    codes = res.json()["recovery_codes"]
    assert len(codes) == mfa.RECOVERY_CODE_COUNT
    assert mfa.user_has_mfa(user)
    assert authed.get(STATUS).json() == {
        "enabled": True,
        "recovery_codes_remaining": mfa.RECOVERY_CODE_COUNT,
    }


def test_cannot_setup_again_when_already_enabled(authed, user, clock):
    enroll(user, clock)
    assert authed.post(SETUP).status_code == 409


def test_setup_requires_authentication(db):
    assert APIClient().post(SETUP).status_code == 401


def test_recovery_codes_are_stored_hashed(user, clock):
    _, codes = enroll(user, clock)
    stored = set(user.mfa_device.recovery_codes.values_list("code_hash", flat=True))
    assert len(stored) == len(codes)
    assert not any(c.replace("-", "") in stored for c in codes)


# --------------------------------------------------------------------------- #
# Login con MFA
# --------------------------------------------------------------------------- #
def test_login_with_mfa_issues_no_tokens_only_a_challenge(user, clock):
    enroll(user, clock)
    for url in (LOGIN, LOGIN_BODY):  # ¡también el endpoint móvil!
        res = password_login(url)
        assert res.status_code == 200
        body = res.json()
        assert body["mfa_required"] is True
        assert "access" not in body and "refresh" not in body
        assert "access_token" not in res.cookies
        assert "refresh_token" not in res.cookies


def test_challenge_alone_grants_no_access(user, clock):
    enroll(user, clock)
    token = password_login().json()["mfa_token"]
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert c.get("/api/v1/users/me/").status_code == 401


def test_full_login_flow_sets_cookies(user, clock):
    secret, _ = enroll(user, clock)
    token = password_login().json()["mfa_token"]
    res = APIClient().post(
        VERIFY_COOKIE, {"mfa_token": token, "code": totp(secret, clock)}, format="json"
    )
    assert res.status_code == 200
    assert res.cookies["access_token"].value
    assert res.cookies["access_token"]["httponly"]
    assert res.cookies["refresh_token"].value
    assert "access" not in res.json()  # los tokens no viajan en el body web


def test_verify_body_variant_returns_tokens_for_mobile(user, clock):
    secret, _ = enroll(user, clock)
    token = password_login(LOGIN_BODY).json()["mfa_token"]
    res = APIClient().post(
        VERIFY, {"mfa_token": token, "code": totp(secret, clock)}, format="json"
    )
    assert res.status_code == 200
    assert {"access", "refresh"} <= set(res.json())


def test_wrong_code_is_rejected(user, clock):
    enroll(user, clock)
    token = password_login().json()["mfa_token"]
    res = APIClient().post(VERIFY, {"mfa_token": token, "code": "123456"}, format="json")
    assert res.status_code == 400
    assert "access" not in res.json()


def test_totp_code_cannot_be_replayed(user, clock):
    secret, _ = enroll(user, clock)
    code = totp(secret, clock)
    token = password_login().json()["mfa_token"]
    assert APIClient().post(VERIFY, {"mfa_token": token, "code": code}, format="json").status_code == 200
    # Mismo código, misma ventana de 30 s: debe fallar.
    token2 = password_login().json()["mfa_token"]
    assert APIClient().post(VERIFY, {"mfa_token": token2, "code": code}, format="json").status_code == 400


def test_code_from_previous_step_within_window_is_accepted(user, clock):
    secret, _ = enroll(user, clock)
    # El paso del enrolamiento ya está "gastado" (anti-replay); avanzamos uno
    # y usamos el código del paso inmediatamente anterior (desfase de reloj).
    clock.tick()
    old = pyotp.TOTP(secret).at(clock.now - 30)
    token = password_login().json()["mfa_token"]
    res = APIClient().post(VERIFY, {"mfa_token": token, "code": old}, format="json")
    assert res.status_code == 200  # tolerancia a desfase de reloj


def test_code_outside_window_is_rejected(user, clock):
    secret, _ = enroll(user, clock)
    stale = pyotp.TOTP(secret).at(clock.now - 120)
    token = password_login().json()["mfa_token"]
    res = APIClient().post(VERIFY, {"mfa_token": token, "code": stale}, format="json")
    assert res.status_code == 400


def test_bruteforce_locks_account_even_for_correct_code(user, clock):
    secret, _ = enroll(user, clock)
    token = password_login().json()["mfa_token"]
    last = None
    for i in range(mfa.MAX_FAILURES):
        cache.clear()  # aislamos el bloqueo de cuenta del throttle por IP
        last = APIClient().post(VERIFY, {"mfa_token": token, "code": f"00000{i}"}, format="json")
    assert last.status_code == 429
    assert int(last["Retry-After"]) > 0

    cache.clear()
    good = APIClient().post(
        VERIFY, {"mfa_token": token, "code": totp(secret, clock)}, format="json"
    )
    assert good.status_code == 429  # ni el código correcto pasa mientras dure el bloqueo

    MFADevice.objects.filter(user=user).update(locked_until=None)  # simula expiración
    cache.clear()
    clock.tick(1)
    ok = APIClient().post(
        VERIFY, {"mfa_token": token, "code": totp(secret, clock)}, format="json"
    )
    assert ok.status_code == 200


def test_verify_endpoint_is_rate_limited(user, clock):
    enroll(user, clock)
    token = password_login().json()["mfa_token"]
    codes = []
    for _ in range(12):
        MFADevice.objects.filter(user=user).update(failed_attempts=0, locked_until=None)
        codes.append(
            APIClient().post(VERIFY, {"mfa_token": token, "code": "111111"}, format="json").status_code
        )
    assert 429 in codes


def test_garbage_or_tampered_challenge_is_rejected(user, clock):
    secret, _ = enroll(user, clock)
    for bad in ("nope", password_login().json()["mfa_token"] + "x"):
        res = APIClient().post(
            VERIFY, {"mfa_token": bad, "code": totp(secret, clock)}, format="json"
        )
        assert res.status_code == 400
        assert res.json()["code"] == "mfa_token_expired"


def test_expired_challenge_is_rejected(user, clock, monkeypatch):
    secret, _ = enroll(user, clock)
    token = password_login().json()["mfa_token"]
    real_loads = mfa.signing.loads
    monkeypatch.setattr(
        mfa.signing, "loads",
        lambda t, **kw: real_loads(t, **{**kw, "max_age": -1}),
    )
    res = APIClient().post(VERIFY, {"mfa_token": token, "code": totp(secret, clock)}, format="json")
    assert res.status_code == 400


def test_challenge_dies_when_password_changes(user, clock):
    secret, _ = enroll(user, clock)
    token = password_login().json()["mfa_token"]
    user.set_password("Another-Pass-456!")
    user.save()
    res = APIClient().post(VERIFY, {"mfa_token": token, "code": totp(secret, clock)}, format="json")
    assert res.status_code == 400


def test_inactive_user_cannot_complete_login(user, clock):
    secret, _ = enroll(user, clock)
    token = password_login().json()["mfa_token"]
    User.objects.filter(pk=user.pk).update(is_active=False)
    res = APIClient().post(VERIFY, {"mfa_token": token, "code": totp(secret, clock)}, format="json")
    assert res.status_code == 400


# --------------------------------------------------------------------------- #
# Códigos de recuperación
# --------------------------------------------------------------------------- #
def test_recovery_code_works_exactly_once(user, clock):
    _, codes = enroll(user, clock)
    token = password_login().json()["mfa_token"]
    first = APIClient().post(VERIFY, {"mfa_token": token, "code": codes[0]}, format="json")
    assert first.status_code == 200
    token2 = password_login().json()["mfa_token"]
    again = APIClient().post(VERIFY, {"mfa_token": token2, "code": codes[0]}, format="json")
    assert again.status_code == 400
    assert mfa.recovery_codes_remaining(user) == mfa.RECOVERY_CODE_COUNT - 1


def test_recovery_code_accepts_lowercase_and_no_dash(user, clock):
    _, codes = enroll(user, clock)
    token = password_login().json()["mfa_token"]
    res = APIClient().post(
        VERIFY, {"mfa_token": token, "code": codes[1].replace("-", "").lower()}, format="json"
    )
    assert res.status_code == 200


def test_regenerate_recovery_codes_invalidates_old_ones(authed, user, clock):
    secret, old = enroll(user, clock)
    res = authed.post(RECOVERY, {"code": totp(secret, clock)}, format="json")
    assert res.status_code == 200
    new = res.json()["recovery_codes"]
    assert set(new).isdisjoint(old)
    token = password_login().json()["mfa_token"]
    assert APIClient().post(VERIFY, {"mfa_token": token, "code": old[0]}, format="json").status_code == 400


def test_recovery_code_cannot_regenerate_codes(authed, user, clock):
    _, codes = enroll(user, clock)
    assert authed.post(RECOVERY, {"code": codes[0]}, format="json").status_code == 400


# --------------------------------------------------------------------------- #
# Desactivar / reset
# --------------------------------------------------------------------------- #
def test_disable_requires_password_and_code(authed, user, clock):
    secret, _ = enroll(user, clock)
    assert authed.post(DISABLE, {"password": "wrong", "code": totp(secret, clock)}, format="json").status_code == 400
    assert authed.post(DISABLE, {"password": PASSWORD, "code": "000000"}, format="json").status_code == 400
    assert mfa.user_has_mfa(user)

    res = authed.post(DISABLE, {"password": PASSWORD, "code": totp(secret, clock)}, format="json")
    assert res.status_code == 204
    assert not mfa.user_has_mfa(user)
    assert "access_token" in password_login().cookies


def test_reset_mfa_only_for_software_engineer(user, clock, db):
    enroll(user, clock)
    admin = User.objects.create_user(
        username="adm", email="adm@example.com", password=PASSWORD,
        first_name="A", last_name="D", role=User.Role.ADMIN, type=User.Type.PERSONAL_ADMINISTRATOR,
    )
    c = APIClient()
    c.force_authenticate(admin)
    assert c.post(f"/api/v1/users/{user.pk}/reset_mfa/").status_code == 403
    assert mfa.user_has_mfa(user)

    root = User.objects.create_superuser(
        username="root", email="root@example.com", password=PASSWORD,
        first_name="R", last_name="T", role=User.Role.ADMIN, type=User.Type.PERSONAL_ADMINISTRATOR,
    )
    c.force_authenticate(root)
    assert c.post(f"/api/v1/users/{user.pk}/reset_mfa/").status_code == 204
    assert not mfa.user_has_mfa(user)


def test_me_exposes_mfa_enabled_flag(authed, user, clock):
    assert authed.get("/api/v1/users/me/").json()["mfa_enabled"] is False
    enroll(user, clock)
    user.refresh_from_db()
    c = APIClient()
    c.force_authenticate(User.objects.get(pk=user.pk))
    assert c.get("/api/v1/users/me/").json()["mfa_enabled"] is True
