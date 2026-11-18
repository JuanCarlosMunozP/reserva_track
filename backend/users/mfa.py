"""Autenticación multifactor (TOTP, RFC 6238) con enrolamiento por código QR.

Propósito: proteger las cuentas aunque la contraseña se filtre, se adivine o se
reutilice. El segundo factor es "algo que se tiene" (el celular con la app
autenticadora), por lo que robar la contraseña ya no basta para entrar.

Decisiones de seguridad:
- El secreto TOTP se cifra en reposo (Fernet). Un volcado de la BD no permite
  generar códigos válidos.
- Cada código sólo se acepta una vez (`last_used_step`), evitando replay.
- Tras `MAX_FAILURES` fallos seguidos la cuenta se bloquea `LOCK_MINUTES`
  (los códigos de 6 dígitos son fuerza-bruteables sin este límite).
- Los códigos de recuperación se guardan como HMAC, son de un solo uso.
- Las comparaciones usan `hmac.compare_digest` (tiempo constante).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import io
import re
import secrets
import time
from datetime import timedelta
from enum import Enum

import pyotp
import qrcode
import qrcode.image.svg
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone

from .models import MFADevice, MFARecoveryCode, User

ISSUER = "ReservaTrack"
TOTP_DIGITS = 6
TOTP_INTERVAL = 30
# ±1 paso (30 s) tolera el desfase de reloj del celular sin abrir demasiado la ventana.
TOTP_WINDOW = 1

MAX_FAILURES = 5
LOCK_MINUTES = 15

CHALLENGE_SALT = "users.mfa.challenge"
CHALLENGE_MAX_AGE_SECONDS = 300

RECOVERY_CODE_COUNT = 8
_RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O/1/I
_RECOVERY_LEN = 10

_TOTP_RE = re.compile(r"^\d{6}$")


class MFAError(Exception):
    """Error de dominio de MFA (mensaje apto para mostrar al usuario)."""


class AlreadyEnabled(MFAError):
    pass


class VerifyResult(Enum):
    OK = "ok"
    RECOVERY_USED = "recovery_used"
    INVALID = "invalid"
    LOCKED = "locked"


# --------------------------------------------------------------------------- #
# Cifrado del secreto
# --------------------------------------------------------------------------- #
def _fernet() -> Fernet:
    raw = getattr(settings, "MFA_ENCRYPTION_KEY", "") or ""
    if raw:
        key = raw.encode()
    else:
        # Derivada de SECRET_KEY. En producción conviene fijar MFA_ENCRYPTION_KEY
        # para poder rotar SECRET_KEY sin invalidar los secretos ya enrolados.
        digest = hashlib.sha256(b"mfa-secret|" + settings.SECRET_KEY.encode()).digest()
        key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:  # clave rotada o dato corrupto
        raise MFAError("No se pudo leer el secreto MFA.") from exc


# --------------------------------------------------------------------------- #
# Enrolamiento (QR)
# --------------------------------------------------------------------------- #
def provisioning_uri(user: User, secret: str) -> str:
    return pyotp.TOTP(
        secret, digits=TOTP_DIGITS, interval=TOTP_INTERVAL
    ).provisioning_uri(name=user.email or user.username, issuer_name=ISSUER)


def qr_data_uri(uri: str) -> str:
    """QR como `data:image/svg+xml;base64,...` (SVG: sin Pillow; la CSP ya
    permite `img-src data:`)."""
    img = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage, box_size=10)
    buf = io.BytesIO()
    img.save(buf)
    return "data:image/svg+xml;base64," + base64.b64encode(buf.getvalue()).decode()


@transaction.atomic
def start_enrollment(user: User) -> str:
    """Genera un secreto nuevo (pendiente de confirmar) y lo devuelve en claro,
    sólo para mostrarlo una vez en el QR. Re-escanear antes de confirmar
    reemplaza el secreto pendiente."""
    existing = MFADevice.objects.select_for_update().filter(user=user).first()
    if existing and existing.confirmed:
        raise AlreadyEnabled("La autenticación de dos factores ya está activa.")
    secret = pyotp.random_base32()
    if existing:
        existing.secret_encrypted = encrypt_secret(secret)
        existing.last_used_step = 0
        existing.save(update_fields=["secret_encrypted", "last_used_step"])
    else:
        MFADevice.objects.create(user=user, secret_encrypted=encrypt_secret(secret))
    return secret


def _normalize_code(code: str) -> str:
    return re.sub(r"[\s-]", "", code or "").upper()


def _match_totp(device: MFADevice, code: str, now: float | None = None) -> int | None:
    """Devuelve el paso de tiempo que coincide con `code` (o None). Sólo acepta
    pasos posteriores a `last_used_step` (anti-replay)."""
    if not _TOTP_RE.match(code):
        return None
    totp = pyotp.TOTP(
        decrypt_secret(device.secret_encrypted),
        digits=TOTP_DIGITS,
        interval=TOTP_INTERVAL,
    )
    now = time.time() if now is None else now
    current = int(now // TOTP_INTERVAL)
    matched: int | None = None
    # Se recorren todos los pasos sin cortar, para no filtrar por tiempo cuál acertó.
    for step in range(current - TOTP_WINDOW, current + TOTP_WINDOW + 1):
        expected = totp.at(step * TOTP_INTERVAL)
        if hmac.compare_digest(expected, code) and step > device.last_used_step:
            matched = step
    return matched


@transaction.atomic
def confirm_enrollment(user: User, code: str) -> list[str] | None:
    """Verifica el primer código; si es correcto activa MFA y devuelve los
    códigos de recuperación (única vez que se ven en claro). None si es inválido."""
    device = MFADevice.objects.select_for_update().filter(user=user).first()
    if device is None or device.confirmed:
        return None
    step = _match_totp(device, _normalize_code(code))
    if step is None:
        return None
    device.confirmed = True
    device.confirmed_at = timezone.now()
    device.last_used_step = step
    device.save(update_fields=["confirmed", "confirmed_at", "last_used_step"])
    return _issue_recovery_codes(device)


# --------------------------------------------------------------------------- #
# Códigos de recuperación
# --------------------------------------------------------------------------- #
def _hash_recovery(code: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(), b"mfa-recovery|" + code.encode(), hashlib.sha256
    ).hexdigest()


def _issue_recovery_codes(device: MFADevice) -> list[str]:
    device.recovery_codes.all().delete()
    plain: list[str] = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(_RECOVERY_LEN))
        plain.append(f"{raw[:5]}-{raw[5:]}")
    MFARecoveryCode.objects.bulk_create(
        [
            MFARecoveryCode(device=device, code_hash=_hash_recovery(c.replace("-", "")))
            for c in plain
        ]
    )
    return plain


def recovery_codes_remaining(user: User) -> int:
    # Consulta directa (no `user.mfa_device`): evita leer una relación cacheada
    # y desactualizada en el mismo objeto `user`.
    return MFARecoveryCode.objects.filter(
        device__user=user, device__confirmed=True, used_at__isnull=True
    ).count()


# --------------------------------------------------------------------------- #
# Verificación en login / acciones sensibles
# --------------------------------------------------------------------------- #
def user_has_mfa(user: User) -> bool:
    return MFADevice.objects.filter(user=user, confirmed=True).exists()


def lock_remaining_seconds(user: User) -> int:
    device = MFADevice.objects.filter(user=user, confirmed=True).first()
    if device and device.locked_until and device.locked_until > timezone.now():
        return int((device.locked_until - timezone.now()).total_seconds()) + 1
    return 0


@transaction.atomic
def verify_second_factor(
    user: User, code: str, *, allow_recovery: bool = True
) -> VerifyResult:
    """Valida TOTP o código de recuperación aplicando bloqueo por fuerza bruta.

    Los fallos se contabilizan aquí (y se confirman en la transacción) en vez
    de lanzar excepciones, para que el contador no se revierta."""
    device = (
        MFADevice.objects.select_for_update().filter(user=user, confirmed=True).first()
    )
    if device is None:
        return VerifyResult.INVALID

    now = timezone.now()
    if device.locked_until and device.locked_until > now:
        return VerifyResult.LOCKED

    normalized = _normalize_code(code)
    result = VerifyResult.INVALID

    step = _match_totp(device, normalized)
    if step is not None:
        device.last_used_step = step
        result = VerifyResult.OK
    elif allow_recovery and len(normalized) == _RECOVERY_LEN:
        updated = MFARecoveryCode.objects.filter(
            device=device, code_hash=_hash_recovery(normalized), used_at__isnull=True
        ).update(used_at=now)
        if updated:
            result = VerifyResult.RECOVERY_USED

    if result in (VerifyResult.OK, VerifyResult.RECOVERY_USED):
        device.failed_attempts = 0
        device.locked_until = None
    else:
        device.failed_attempts += 1
        if device.failed_attempts >= MAX_FAILURES:
            device.locked_until = now + timedelta(minutes=LOCK_MINUTES)
            device.failed_attempts = 0
            result = VerifyResult.LOCKED
    device.save(update_fields=["last_used_step", "failed_attempts", "locked_until"])
    return result


@transaction.atomic
def regenerate_recovery_codes(user: User) -> list[str]:
    device = MFADevice.objects.select_for_update().get(user=user, confirmed=True)
    return _issue_recovery_codes(device)


def disable(user: User) -> None:
    MFADevice.objects.filter(user=user).delete()


# --------------------------------------------------------------------------- #
# Desafío entre "contraseña correcta" y "segundo factor correcto"
# --------------------------------------------------------------------------- #
def _password_fingerprint(user: User) -> str:
    return hashlib.sha256(user.password.encode()).hexdigest()[:16]


def issue_challenge(user: User) -> str:
    """Token firmado y de vida corta que prueba que la contraseña ya fue
    validada. NO da acceso a nada: sólo sirve en el endpoint de verificación.
    Incluye una huella de la contraseña, así que cambiarla lo invalida."""
    return signing.dumps(
        {"uid": user.pk, "pf": _password_fingerprint(user)}, salt=CHALLENGE_SALT
    )


def user_from_challenge(token: str) -> User | None:
    try:
        data = signing.loads(
            token, salt=CHALLENGE_SALT, max_age=CHALLENGE_MAX_AGE_SECONDS
        )
        user = User.objects.get(pk=data["uid"], is_active=True)
    except (signing.BadSignature, User.DoesNotExist, KeyError):
        return None
    if not hmac.compare_digest(data.get("pf", ""), _password_fingerprint(user)):
        return None
    return user
