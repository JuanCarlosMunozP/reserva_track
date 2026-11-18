"""MFA: ramas que la suite original no ejercita (cifrado, re-enrolamiento, bloqueo, vistas)."""
import time as real_time
from datetime import timedelta

import pyotp
import pytest
from django.utils import timezone

from users import mfa
from users.models import MFADevice, MFARecoveryCode

from .conftest import PASSWORD, api, make_user

SETUP = "/api/v1/auth/mfa/setup/"
CONFIRM = "/api/v1/auth/mfa/confirm/"
RECOVERY = "/api/v1/auth/mfa/recovery-codes/"
DISABLE = "/api/v1/auth/mfa/disable/"
STATUS = "/api/v1/auth/mfa/status/"


class Clock:
    def __init__(self):
        self.now = real_time.time()

    def time(self):
        return self.now

    def tick(self, steps=1):
        self.now += 30 * steps


@pytest.fixture
def clock(monkeypatch):
    c = Clock()
    monkeypatch.setattr(mfa, "time", c)
    return c


@pytest.fixture
def user(db):
    return make_user("ana")


def code(secret, clock):
    return pyotp.TOTP(secret).at(clock.now)


def enroll(user, clock):
    """Deja a `user` con MFA activo y devuelve (secret, recovery_codes)."""
    secret = mfa.start_enrollment(user)
    codes = mfa.confirm_enrollment(user, code(secret, clock))
    clock.tick()
    return secret, codes


# -------------------------------------------------------------- cifrado
def test_encryption_uses_explicit_key_when_configured(settings):
    from cryptography.fernet import Fernet

    settings.MFA_ENCRYPTION_KEY = Fernet.generate_key().decode()
    token = mfa.encrypt_secret("JBSWY3DPEHPK3PXP")
    assert mfa.decrypt_secret(token) == "JBSWY3DPEHPK3PXP"
    settings.MFA_ENCRYPTION_KEY = Fernet.generate_key().decode()  # clave rotada
    with pytest.raises(mfa.MFAError):
        mfa.decrypt_secret(token)


def test_encryption_falls_back_to_secret_key_derivation(settings):
    settings.MFA_ENCRYPTION_KEY = ""
    assert mfa.decrypt_secret(mfa.encrypt_secret("abc")) == "abc"
    with pytest.raises(mfa.MFAError):
        mfa.decrypt_secret("no-es-fernet")


def test_provisioning_uri_and_qr(user):
    uri = mfa.provisioning_uri(user, "JBSWY3DPEHPK3PXP")
    assert uri.startswith("otpauth://totp/") and "ReservaTrack" in uri
    assert mfa.qr_data_uri(uri).startswith("data:image/svg+xml;base64,")
    user.email = ""
    assert "ana" in mfa.provisioning_uri(user, "JBSWY3DPEHPK3PXP")


# ----------------------------------------------------------- enrolamiento
def test_re_enrollment_before_confirmation_replaces_pending_secret(user):
    first = mfa.start_enrollment(user)
    device = MFADevice.objects.get(user=user)
    before = device.secret_encrypted
    second = mfa.start_enrollment(user)
    device.refresh_from_db()
    assert first != second and device.secret_encrypted != before
    assert MFADevice.objects.filter(user=user).count() == 1
    assert not device.confirmed


def test_cannot_start_enrollment_when_already_enabled(user, clock):
    enroll(user, clock)
    with pytest.raises(mfa.AlreadyEnabled):
        mfa.start_enrollment(user)


def test_confirm_enrollment_edge_cases(user, clock):
    assert mfa.confirm_enrollment(user, "123456") is None  # sin dispositivo
    secret = mfa.start_enrollment(user)
    assert mfa.confirm_enrollment(user, "000000") is None  # código incorrecto
    assert mfa.confirm_enrollment(user, "no-digitos") is None
    codes = mfa.confirm_enrollment(user, code(secret, clock))
    assert len(codes) == mfa.RECOVERY_CODE_COUNT
    clock.tick()
    assert mfa.confirm_enrollment(user, code(secret, clock)) is None  # ya confirmado


# ------------------------------------------------------------ verificación
def test_verify_without_device_is_invalid(user):
    assert mfa.verify_second_factor(user, "123456") is mfa.VerifyResult.INVALID
    assert mfa.user_has_mfa(user) is False
    assert mfa.lock_remaining_seconds(user) == 0


def test_lock_remaining_seconds_and_locked_result(user, clock):
    secret, _ = enroll(user, clock)
    for _ in range(mfa.MAX_FAILURES):
        result = mfa.verify_second_factor(user, "000000")
    assert result is mfa.VerifyResult.LOCKED
    remaining = mfa.lock_remaining_seconds(user)
    assert 0 < remaining <= mfa.LOCK_MINUTES * 60 + 1
    # bloqueada: ni el código correcto sirve
    clock.tick()
    assert mfa.verify_second_factor(user, code(secret, clock)) is mfa.VerifyResult.LOCKED
    # el bloqueo expira
    MFADevice.objects.filter(user=user).update(locked_until=timezone.now() - timedelta(seconds=1))
    assert mfa.lock_remaining_seconds(user) == 0
    assert mfa.verify_second_factor(user, code(secret, clock)) is mfa.VerifyResult.OK


def test_recovery_code_is_single_use_and_regeneration_replaces_all(user, clock):
    _, codes = enroll(user, clock)
    assert mfa.verify_second_factor(user, codes[0]) is mfa.VerifyResult.RECOVERY_USED
    assert mfa.verify_second_factor(user, codes[0]) is mfa.VerifyResult.INVALID
    assert mfa.verify_second_factor(user, codes[1], allow_recovery=False) is mfa.VerifyResult.INVALID
    new = mfa.regenerate_recovery_codes(user)
    assert len(new) == mfa.RECOVERY_CODE_COUNT
    assert MFARecoveryCode.objects.filter(device__user=user).count() == mfa.RECOVERY_CODE_COUNT
    assert mfa.verify_second_factor(user, codes[2]) is mfa.VerifyResult.INVALID


def test_disable_removes_device_and_challenge_helpers(user, clock):
    enroll(user, clock)
    mfa.disable(user)
    assert not MFADevice.objects.filter(user=user).exists()
    token = mfa.issue_challenge(user)
    assert mfa.user_from_challenge(token) == user
    assert mfa.user_from_challenge("basura") is None
    other = make_user("otra")
    forged = mfa.signing.dumps({"uid": other.pk}, salt=mfa.CHALLENGE_SALT)  # sin huella
    assert mfa.user_from_challenge(forged) is None
    nokey = mfa.signing.dumps({"x": 1}, salt=mfa.CHALLENGE_SALT)
    assert mfa.user_from_challenge(nokey) is None


# ----------------------------------------------------------------- vistas
def test_status_reports_codes_remaining(user, clock):
    client = api(user)
    assert client.get(STATUS).data == {"enabled": False, "recovery_codes_remaining": 0}
    _, codes = enroll(user, clock)
    mfa.verify_second_factor(user, codes[0])
    assert client.get(STATUS).data == {"enabled": True, "recovery_codes_remaining": mfa.RECOVERY_CODE_COUNT - 1}


def test_setup_twice_when_enabled_returns_conflict(user, clock):
    enroll(user, clock)
    assert api(user).post(SETUP).status_code == 409


def test_confirm_view_rejects_wrong_code(user):
    client = api(user)
    client.post(SETUP)
    response = client.post(CONFIRM, {"code": "000000"}, format="json")
    assert response.status_code == 400


def test_recovery_codes_view_requires_mfa_active(user):
    response = api(user).post(RECOVERY, {"code": "123456"}, format="json")
    assert response.status_code == 409


def test_recovery_codes_view_invalid_and_locked(user, clock):
    enroll(user, clock)
    client = api(user)
    for _ in range(mfa.MAX_FAILURES - 1):
        assert client.post(RECOVERY, {"code": "000000"}, format="json").status_code == 400
    locked = client.post(RECOVERY, {"code": "000000"}, format="json")
    assert locked.status_code == 429 and int(locked["Retry-After"]) > 0
    assert client.post(RECOVERY, {"code": "000000"}, format="json").status_code == 429


def test_disable_view_paths(user, clock):
    client = api(user)
    # sin MFA activo: contraseña correcta → 204 sin más
    assert client.post(DISABLE, {"password": PASSWORD, "code": "000000"}, format="json").status_code == 204
    secret, _ = enroll(user, clock)
    assert client.post(DISABLE, {"password": "mala", "code": code(secret, clock)}, format="json").status_code == 400
    assert client.post(DISABLE, {"password": PASSWORD, "code": "000000"}, format="json").status_code == 400
    for _ in range(mfa.MAX_FAILURES - 2):
        client.post(DISABLE, {"password": PASSWORD, "code": "000000"}, format="json")
    assert client.post(DISABLE, {"password": PASSWORD, "code": "000000"}, format="json").status_code == 429
    MFADevice.objects.filter(user=user).update(locked_until=None, failed_attempts=0)
    ok = client.post(DISABLE, {"password": PASSWORD, "code": code(secret, clock)}, format="json")
    assert ok.status_code == 204 and not mfa.user_has_mfa(user)
