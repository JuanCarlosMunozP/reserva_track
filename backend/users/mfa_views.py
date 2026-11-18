"""Endpoints de MFA.

Públicos (sin sesión, porque ocurren ANTES de tener tokens):
    POST /auth/mfa/verify/          -> tokens en el body (clientes móviles/API)
    POST /auth/mfa/verify/cookie/   -> tokens en cookies httpOnly (frontend web)

Autenticados (gestión desde "Seguridad"):
    GET  /auth/mfa/status/
    POST /auth/mfa/setup/           -> genera secreto + QR
    POST /auth/mfa/confirm/         -> verifica 1er código, activa, da códigos de recuperación
    POST /auth/mfa/recovery-codes/  -> regenera códigos (exige código vigente)
    POST /auth/mfa/disable/         -> desactiva (exige contraseña + código)
"""
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from audit.utils import AuditAction, log_audit_event
from common.views import _set_auth_cookies

from . import mfa
from .models import User
from .serializers import (
    MFACodeSerializer,
    MFADisableSerializer,
    MFAVerifySerializer,
)

_INVALID_CODE = {"code": ["Código inválido o vencido."]}


def _locked_response(user: User) -> Response:
    wait = max(mfa.lock_remaining_seconds(user), 1)
    return Response(
        {
            "detail": "Demasiados intentos fallidos. Cuenta bloqueada temporalmente.",
            "retry_after": wait,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={"Retry-After": str(wait)},
    )


# --------------------------------------------------------------------------- #
# Segundo paso del login
# --------------------------------------------------------------------------- #
class MFAVerifyView(APIView):
    """Canjea (desafío firmado + código) por los tokens JWT."""

    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "mfa"

    def post(self, request):
        serializer = MFAVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = mfa.user_from_challenge(serializer.validated_data["mfa_token"])
        if user is None:
            return Response(
                {
                    "detail": "La verificación expiró. Inicia sesión de nuevo.",
                    "code": "mfa_token_expired",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = mfa.verify_second_factor(user, serializer.validated_data["code"])
        if result is mfa.VerifyResult.LOCKED:
            return _locked_response(user)
        if result is mfa.VerifyResult.INVALID:
            return Response(_INVALID_CODE, status=status.HTTP_400_BAD_REQUEST)

        if result is mfa.VerifyResult.RECOVERY_USED:
            # Quien usa un código de recuperación suele haber perdido el
            # dispositivo: queda rastro para auditoría.
            log_audit_event(
                user, AuditAction.UPDATE, user, request=request,
                changes={"mfa": "recovery_code_used"},
            )

        refresh = RefreshToken.for_user(user)
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        return self._respond(request, str(refresh.access_token), str(refresh))

    def _respond(self, request, access: str, refresh: str) -> Response:
        return Response({"access": access, "refresh": refresh})


class MFACookieVerifyView(MFAVerifyView):
    """Igual, pero entrega los tokens como cookies httpOnly (frontend web)."""

    def _respond(self, request, access: str, refresh: str) -> Response:
        response = Response({"detail": "ok"})
        _set_auth_cookies(response, access=access, refresh=refresh)
        get_token(request)  # siembra la cookie csrftoken (doble envío)
        return response


# --------------------------------------------------------------------------- #
# Gestión (usuario autenticado)
# --------------------------------------------------------------------------- #
class _MFAManageView(APIView):
    permission_classes = (permissions.IsAuthenticated,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "mfa"


class MFAStatusView(_MFAManageView):
    def get(self, request):
        return Response(
            {
                "enabled": mfa.user_has_mfa(request.user),
                "recovery_codes_remaining": mfa.recovery_codes_remaining(request.user),
            }
        )


class MFASetupView(_MFAManageView):
    def post(self, request):
        try:
            secret = mfa.start_enrollment(request.user)
        except mfa.AlreadyEnabled as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        uri = mfa.provisioning_uri(request.user, secret)
        return Response(
            {
                "qr": mfa.qr_data_uri(uri),
                # Para quien no pueda escanear: ingreso manual en la app.
                "secret": secret,
                "otpauth_uri": uri,
            }
        )


class MFAConfirmView(_MFAManageView):
    def post(self, request):
        serializer = MFACodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        codes = mfa.confirm_enrollment(request.user, serializer.validated_data["code"])
        if codes is None:
            return Response(_INVALID_CODE, status=status.HTTP_400_BAD_REQUEST)
        log_audit_event(
            request.user, AuditAction.UPDATE, request.user, request=request,
            changes={"mfa": "enabled"},
        )
        return Response({"recovery_codes": codes})


class MFARecoveryCodesView(_MFAManageView):
    def post(self, request):
        serializer = MFACodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not mfa.user_has_mfa(request.user):
            return Response(
                {"detail": "La autenticación de dos factores no está activa."},
                status=status.HTTP_409_CONFLICT,
            )
        # Sólo TOTP: un código de recuperación no puede regenerar los demás.
        result = mfa.verify_second_factor(
            request.user, serializer.validated_data["code"], allow_recovery=False
        )
        if result is mfa.VerifyResult.LOCKED:
            return _locked_response(request.user)
        if result is not mfa.VerifyResult.OK:
            return Response(_INVALID_CODE, status=status.HTTP_400_BAD_REQUEST)
        log_audit_event(
            request.user, AuditAction.UPDATE, request.user, request=request,
            changes={"mfa": "recovery_codes_regenerated"},
        )
        return Response({"recovery_codes": mfa.regenerate_recovery_codes(request.user)})


class MFADisableView(_MFAManageView):
    def post(self, request):
        serializer = MFADisableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not request.user.check_password(serializer.validated_data["password"]):
            return Response(
                {"password": ["Contraseña incorrecta."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not mfa.user_has_mfa(request.user):
            return Response(status=status.HTTP_204_NO_CONTENT)
        result = mfa.verify_second_factor(request.user, serializer.validated_data["code"])
        if result is mfa.VerifyResult.LOCKED:
            return _locked_response(request.user)
        if result is mfa.VerifyResult.INVALID:
            return Response(_INVALID_CODE, status=status.HTTP_400_BAD_REQUEST)
        mfa.disable(request.user)
        log_audit_event(
            request.user, AuditAction.UPDATE, request.user, request=request,
            changes={"mfa": "disabled"},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

