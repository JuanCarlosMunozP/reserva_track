from typing import Any

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from common.typing_meta import ModelSerializerMeta
from common.security import SanitizedSerializerMixin

from . import mfa
from .models import User


def _normalize_text(value: str) -> str:
    return " ".join(value.split()).strip()


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _normalize_username(value: str) -> str:
    return value.strip()


class MFATokenObtainPairSerializer(TokenObtainPairSerializer):
    """Login con contraseña. Si el usuario tiene MFA activo NO se emiten
    tokens: se devuelve un desafío firmado que sólo sirve en
    `/auth/mfa/verify/`. Así ningún endpoint de login (web ni móvil) puede
    saltarse el segundo factor."""

    def validate(self, attrs):
        data = super().validate(attrs)  # lanza si usuario/contraseña son inválidos
        if mfa.user_has_mfa(self.user):
            return {
                "mfa_required": True,
                "mfa_token": mfa.issue_challenge(self.user),
            }
        return data


class MFAVerifySerializer(serializers.Serializer):
    mfa_token = serializers.CharField(write_only=True)
    code = serializers.CharField(write_only=True, max_length=32)


class MFACodeSerializer(serializers.Serializer):
    code = serializers.CharField(write_only=True, max_length=32)


class MFADisableSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)
    code = serializers.CharField(write_only=True, max_length=32)


class UserSerializer(SanitizedSerializerMixin, serializers.ModelSerializer[User]):
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    mfa_enabled = serializers.BooleanField(read_only=True)

    class Meta(ModelSerializerMeta):
        model: Any = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "role_display",
            "type",
            "type_display",
            "course",
            "area",
            "is_active",
            "is_superuser",
            "mfa_enabled",
            "date_joined",
            "last_login",
        )
        read_only_fields = ("id", "role_display", "is_superuser", "date_joined", "last_login")


class UserCreateSerializer(SanitizedSerializerMixin, serializers.ModelSerializer[User]):
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    password = serializers.CharField(write_only=True, required=True, min_length=8)

    class Meta(ModelSerializerMeta):
        model: Any = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "role_display",
            "type",
            "course",
            "area",
            "is_active",
            "password",
            "date_joined",
            "last_login",
        )
        read_only_fields = ("id", "role_display", "date_joined", "last_login")

    def validate_username(self, value: str) -> str:
        normalized = _normalize_username(value)
        if not normalized:
            raise serializers.ValidationError(_("El nombre de usuario no puede estar vacío."))
        if User.objects.filter(username__iexact=normalized).exists():
            raise serializers.ValidationError(
                _("Ya existe un usuario con este nombre de usuario.")
            )
        return normalized

    def validate_email(self, value: str) -> str:
        normalized = _normalize_email(value)
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError(
                _("Ya existe un usuario con este correo electrónico.")
            )
        return normalized

    def validate_first_name(self, value: str) -> str:
        normalized = _normalize_text(value)
        if not normalized:
            raise serializers.ValidationError(_("Los nombres no pueden estar vacíos."))
        return normalized

    def validate_last_name(self, value: str) -> str:
        normalized = _normalize_text(value)
        if not normalized:
            raise serializers.ValidationError(_("Los apellidos no pueden estar vacíos."))
        return normalized

    def validate_role(self, value: str) -> str:
        request = self.context.get("request")
        caller = getattr(request, "user", None)
        if value == User.Role.ADMIN:
            if caller is None or not caller.is_superuser:
                raise serializers.ValidationError(
                    _("Solo el ingeniero de software puede asignar el rol administrador.")
                )
        return value

    def validate_password(self, value: str) -> str:
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        is_active = validated_data.pop("is_active", True)
        user = User.objects.create_user(password=password, **validated_data)
        if not is_active:
            user.is_active = False
            user.save(update_fields=["is_active"])
        return user


class UserUpdateSerializer(SanitizedSerializerMixin, serializers.ModelSerializer[User]):
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta(ModelSerializerMeta):
        model: Any = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "role_display",
            "course",
            "area",
            "is_active",
            "date_joined",
            "last_login",
        )
        read_only_fields = ("id", "role_display", "date_joined", "last_login")

    def validate_username(self, value: str) -> str:
        normalized = _normalize_username(value)
        if not normalized:
            raise serializers.ValidationError(_("El nombre de usuario no puede estar vacío."))
        qs = User.objects.filter(username__iexact=normalized)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                _("Ya existe un usuario con este nombre de usuario.")
            )
        return normalized

    def validate_email(self, value: str) -> str:
        normalized = _normalize_email(value)
        qs = User.objects.filter(email__iexact=normalized)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                _("Ya existe un usuario con este correo electrónico.")
            )
        return normalized

    def validate_first_name(self, value: str) -> str:
        normalized = _normalize_text(value)
        if not normalized:
            raise serializers.ValidationError(_("Los nombres no pueden estar vacíos."))
        return normalized

    def validate_last_name(self, value: str) -> str:
        normalized = _normalize_text(value)
        if not normalized:
            raise serializers.ValidationError(_("Los apellidos no pueden estar vacíos."))
        return normalized

    def validate_role(self, value: str) -> str:
        request = self.context.get("request")
        caller = getattr(request, "user", None)
        target = self.instance
        is_software_engineer = caller is not None and caller.is_superuser
        changing_admin_role = target is not None and target.role != value and (
            value == User.Role.ADMIN or target.role == User.Role.ADMIN
        )

        if changing_admin_role and not is_software_engineer:
            raise serializers.ValidationError(
                _("Solo el ingeniero de software puede asignar o retirar el rol administrador.")
            )
        return value


class PasswordChangeSerializer(SanitizedSerializerMixin, serializers.Serializer):
    current_password = serializers.CharField(required=False, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, min_length=8)

    def validate_new_password(self, value: str) -> str:
        target = self.context.get("target_user")
        try:
            validate_password(value, user=target)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        target = self.context.get("target_user")
        caller = getattr(request, "user", None)

        is_self = caller is not None and target is not None and caller.pk == target.pk

        if is_self and target is not None:
            current = attrs.get("current_password")
            if not current:
                raise serializers.ValidationError(
                    {"current_password": _("Este campo es requerido para cambiar tu propia contraseña.")}
                )
            if not target.check_password(current):
                raise serializers.ValidationError(
                    {"current_password": _("La contraseña actual es incorrecta.")}
                )
        return attrs


class PublicRegistrationSerializer(SanitizedSerializerMixin, serializers.ModelSerializer[User]):
    password = serializers.CharField(write_only=True, min_length=8)
    course = serializers.CharField(required=False, allow_blank=True, max_length=120)
    area = serializers.CharField(required=False, allow_blank=True, max_length=120)

    class Meta(ModelSerializerMeta):
        model: Any = User
        fields = ("id", "username", "email", "first_name", "last_name", "type", "course", "area", "password")
        read_only_fields = ("id",)

    def validate_username(self, value: str) -> str:
        normalized = _normalize_username(value)
        if not normalized:
            raise serializers.ValidationError(_("El nombre de usuario no puede estar vacío."))
        if User.objects.filter(username__iexact=normalized).exists():
            raise serializers.ValidationError(_("Ya existe un usuario con este nombre de usuario."))
        return normalized

    def validate_password(self, value: str) -> str:
        # Longitud mínima y contraseñas comunes (AUTH_PASSWORD_VALIDATORS), FR-004.
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def validate_email(self, value: str) -> str:
        normalized = _normalize_email(value)
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError(_("Ya existe una cuenta con este correo."))
        return normalized

    def validate_course(self, value: str) -> str:
        return _normalize_text(value)

    def validate_area(self, value: str) -> str:
        return _normalize_text(value)

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(
            password=password,
            role=User.Role.USER,
            **validated_data,
        )
