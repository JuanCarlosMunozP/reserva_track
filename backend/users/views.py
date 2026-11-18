from django.conf import settings
from django.utils.translation import gettext_lazy as _
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.db import transaction

from audit.utils import AuditAction, log_audit_event

from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from . import mfa
from .models import User
from .permissions import CanListAssignableUsers, IsAdminRole, IsSoftwareEngineer
from .serializers import (
    PasswordChangeSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)


class SelfDeleteConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = _("No puedes eliminar tu propia cuenta.")
    default_code = "self_delete"


class UserViewSet(viewsets.ModelViewSet):
    """CRUD de usuarios + perfil propio + cambio de contraseña."""

    queryset = User.objects.all()
    permission_classes = (IsAuthenticated,)
    filterset_fields = ("role", "type", "is_active")
    search_fields = ("username", "email", "first_name", "last_name")
    ordering_fields = ("username", "email", "role", "date_joined")
    ordering = ("username",)

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("update", "partial_update"):
            return UserUpdateSerializer
        if self.action == "set_password":
            return PasswordChangeSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action == "me":
            return [IsAuthenticated()]
        if self.action in ("retrieve", "update", "partial_update", "set_password"):
            return [IsAuthenticated()]
        if self.action == "list":
            return [IsAuthenticated(), CanListAssignableUsers()]
        if self.action in ("create", "destroy", "reset_mfa"):
            return [IsAuthenticated(), IsSoftwareEngineer()]
        return [IsAuthenticated(), IsAdminRole()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not isinstance(user, User):
            return qs.none()
        if self.action == "list":
            if user.is_superuser or user.role == User.Role.ADMIN:
                return qs
            if user.role == User.Role.USER and user.type == User.Type.PERSONAL_ADMINISTRATOR:
                return qs.filter(role=User.Role.USER, is_active=True)
            return qs.none()
        return qs

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        is_admin = IsAdminRole().has_permission(request, self)
        is_self = obj.pk == request.user.pk

        if self.action in ("retrieve", "set_password", "update", "partial_update"):
            if not (is_admin or is_self):
                self.permission_denied(request, message=str(_("No tienes permisos para esta acción.")))

        if self.action in ("update", "partial_update") and is_self and not is_admin:
            forbidden = {"role", "is_active", "is_staff", "is_superuser"}
            if forbidden.intersection(request.data.keys()):
                self.permission_denied(
                    request,
                    message=str(_("No puedes modificar tu propio rol o estado.")),
                )

    def perform_update(self, serializer):
        tracked_fields = ("role", "is_active")
        before = {f: getattr(serializer.instance, f) for f in tracked_fields}
        with transaction.atomic():  # cambio y auditoría se confirman juntos
            instance = serializer.save()
            changes = {
                f: {"from": str(before[f]), "to": str(getattr(instance, f))}
                for f in tracked_fields
                if before[f] != getattr(instance, f)
            }
            if changes:
                log_audit_event(
                    self.request.user, AuditAction.UPDATE, instance,
                    request=self.request, changes=changes,
                )

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise SelfDeleteConflict()
        with transaction.atomic():
            if instance.reservations.exists():
                # FR-017: con reservas se desactiva en vez de borrar.
                instance.is_active = False
                instance.save(update_fields=("is_active",))
                log_audit_event(
                    self.request.user, AuditAction.UPDATE, instance, request=self.request,
                    changes={"is_active": {"from": "True", "to": "False"}},
                )
                return
            log_audit_event(self.request.user, AuditAction.DELETE, instance, request=self.request)
            instance.delete()

    @action(detail=False, methods=["get"])
    def me(self, request):
        return Response(UserSerializer(request.user).data)

    @action(detail=True, methods=["post"], url_path="reset_mfa")
    def reset_mfa(self, request, pk=None):
        """Recuperación de cuenta: el ingeniero de software desactiva el MFA de
        un usuario que perdió el celular y sus códigos de recuperación. El
        usuario deberá volver a enrolarse. Queda en auditoría."""
        user = self.get_object()
        with transaction.atomic():
            mfa.disable(user)
            log_audit_event(
                request.user, AuditAction.UPDATE, user,
                request=request, changes={"mfa": "reset_by_admin"},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _revoke_sessions(request, user):
        """Cambiar la contraseña cierra las demás sesiones: se pone en lista
        negra todo refresh token vigente del usuario. Si quien cambia su propia
        contraseña usa una cookie válida, esa sesión se conserva."""
        keep_jti = None
        if request.user.pk == user.pk:
            raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH_NAME)
            if raw:
                try:
                    keep_jti = RefreshToken(raw)["jti"]
                except TokenError:
                    pass
        for token in OutstandingToken.objects.filter(user=user).exclude(jti=keep_jti or ""):
            BlacklistedToken.objects.get_or_create(token=token)

    @action(detail=True, methods=["post"], url_path="set_password")
    def set_password(self, request, pk=None):
        user = self.get_object()
        serializer = PasswordChangeSerializer(
            data=request.data,
            context={"request": request, "target_user": user},
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user.set_password(serializer.validated_data["new_password"])
            user.save(update_fields=["password"])
            self._revoke_sessions(request, user)
            # Nunca se guarda la contraseña (ni su hash): solo el hecho del cambio.
            log_audit_event(
                request.user, AuditAction.UPDATE, user,
                request=request, changes={"password": "changed"},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
