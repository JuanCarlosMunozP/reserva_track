from django.utils.translation import gettext_lazy as _
from rest_framework import permissions

from .models import User


class CanListAssignableUsers(permissions.BasePermission):
    """Permite a los administradores consultar usuarios asignables."""

    message = _("No tienes permisos para esta acción.")

    _ALLOWED_PERMISSIONS = {User.Role.ADMIN}

    def has_permission(self, request, view) -> bool:
        u = request.user
        return bool(
            isinstance(u, User)
            and u.is_authenticated
            and (
                u.is_superuser
                or u.role in self._ALLOWED_PERMISSIONS
                or (
                    u.role == User.Role.USER
                    and u.type == User.Type.PERSONAL_ADMINISTRATOR
                )
            )
        )


class IsAdminRole(permissions.BasePermission):
    """Permite el acceso a usuarios con rol admin."""

    message = _("No tienes permisos para esta acción.")

    def has_permission(self, request, view) -> bool:
        u = request.user
        return bool(
            isinstance(u, User)
            and u.is_authenticated
            and (u.is_superuser or u.role == User.Role.ADMIN)
        )

    def has_object_permission(self, request, view, obj) -> bool:
        return self.has_permission(request, view)


class IsSoftwareEngineer(permissions.BasePermission):
    """Restringe la administración global de cuentas al superusuario técnico."""

    message = _("Solo el ingeniero de software puede realizar esta acción.")

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(isinstance(user, User) and user.is_authenticated and user.is_superuser)


class IsSelf(permissions.BasePermission):
    """Permite el acceso solo si el objeto es el propio usuario autenticado."""

    message = _("No tienes permisos para esta acción.")

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj) -> bool:
        return obj.pk == request.user.pk
