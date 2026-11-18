from typing import TYPE_CHECKING

from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from .managers import UserManager


class User(AbstractUser):
    if TYPE_CHECKING:
        def get_role_display(self) -> str: ...

    class Role(models.TextChoices):
        ADMIN = "admin", _("Administrator")
        USER = "usuario", _("User")

    class Type(models.TextChoices):
        STUDENT = "student", _("Estudiante")
        TEACHER = "teacher", _("Docente")
        PERSONAL_ADMINISTRATOR = "personal_administrator", _("Personal administrativo")

    email = models.EmailField(_("Correo electrónico"), unique=True)
    first_name = models.CharField(_("Nombres"), max_length=150)
    last_name = models.CharField(_("Apellidos"), max_length=150)
    role = models.CharField(
        _("Rol"),
        max_length=30,
        choices=Role.choices,
    )
    type = models.CharField(
        _("Tipo"),
        max_length=30,
        choices=Type.choices
    )
    course = models.CharField(_("Course"), max_length=120, blank=True)
    area = models.CharField(_("Area"), max_length=120, blank=True)
    created_at = models.DateTimeField(_("Created"),auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated"),auto_now=True)

    objects = UserManager()

    REQUIRED_FIELDS = ["email", "first_name", "last_name", "role","type"]


    class Meta:
        verbose_name = _("User")
        verbose_name_plural = _("Users")
        ordering = ["username"]
        indexes = [
            models.Index(fields=["role"], name="user_role_idx"),
            models.Index(fields=["is_active"], name="user_is_active_idx"),
            models.Index(fields=["email"], name="user_email_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.username} ({self.get_role_display()})"

    @property
    def is_admin_role(self) -> bool:
        return self.role in {self.Role.ADMIN}

    @property
    def mfa_enabled(self) -> bool:
        device = getattr(self, "mfa_device", None)
        return bool(device and device.confirmed)


class MFADevice(models.Model):
    """Segundo factor TOTP (app autenticadora) de un usuario.

    El secreto NUNCA se guarda en claro: `secret_encrypted` es un token Fernet
    (ver `users.mfa`). Mientras `confirmed` sea False el dispositivo está en
    enrolamiento (QR mostrado, código aún no verificado) y NO protege el login.
    """

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="mfa_device"
    )
    secret_encrypted = models.TextField()
    confirmed = models.BooleanField(default=False)
    # Último paso de tiempo TOTP aceptado: impide reutilizar el mismo código
    # (replay / shoulder-surfing) dentro de su ventana de validez.
    last_used_step = models.BigIntegerField(default=0)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _("Dispositivo MFA")
        verbose_name_plural = _("Dispositivos MFA")

    def __str__(self) -> str:
        state = "activo" if self.confirmed else "pendiente"
        return f"MFA {state} de {self.user_id}"


class MFARecoveryCode(models.Model):
    """Código de un solo uso para entrar si se pierde el celular.

    Se guarda sólo el HMAC-SHA256 del código (nunca el código)."""

    device = models.ForeignKey(
        MFADevice, on_delete=models.CASCADE, related_name="recovery_codes"
    )
    code_hash = models.CharField(max_length=64)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["device", "code_hash"], name="mfa_recovery_unique_per_device"
            )
        ]
