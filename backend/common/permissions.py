from django.utils.translation import gettext_lazy as _
from rest_framework.permissions import BasePermission

from users.models import User

Role = User.Role
UserType = User.Type

VIEW, CREATE, EDIT, DELETE = "view", "create", "edit", "delete"
REVIEW = "review"

ROLE_MATRIX: dict[str, dict[str, frozenset[str]]] = {
    Role.ADMIN: {
        "branches": frozenset({VIEW, CREATE, EDIT, DELETE}),
        "spaces": frozenset({VIEW, CREATE, EDIT, DELETE}),
        "reservations": frozenset({VIEW, CREATE, EDIT, REVIEW}),
        "responsibilities": frozenset({VIEW, CREATE, EDIT, DELETE}),
        "users": frozenset({VIEW, EDIT}),
    },
    Role.USER: {
        "branches": frozenset({VIEW}),
        "spaces": frozenset({VIEW}),
        "reservations": frozenset({VIEW}),
        "responsibilities": frozenset(),
        "users": frozenset(),
    },
}

TYPE_MATRIX: dict[str, dict[str, frozenset[str]]] = {
    UserType.STUDENT: {"reservations": frozenset({CREATE, EDIT})},
    UserType.TEACHER: {
        "reservations": frozenset({CREATE, EDIT, REVIEW}),
        "responsibilities": frozenset({VIEW}),
    },
    UserType.PERSONAL_ADMINISTRATOR: {
        "spaces": frozenset({EDIT}),
        "reservations": frozenset({CREATE, EDIT}),
        "responsibilities": frozenset({VIEW, CREATE, EDIT}),
        "users": frozenset({VIEW}),
    },
}

_STANDARD_ACTIONS = {
    "list": VIEW,
    "retrieve": VIEW,
    "create": CREATE,
    "update": EDIT,
    "partial_update": EDIT,
    "destroy": DELETE,
}


def role_can(
    role: str | None,
    resource: str,
    action: str,
    *,
    user_type: str | None = None,
    is_software_engineer: bool = False,
) -> bool:
    if is_software_engineer:
        return action in {VIEW, CREATE, EDIT, DELETE, REVIEW}

    role_actions = ROLE_MATRIX.get(role or "", {}).get(resource, frozenset())
    type_actions = TYPE_MATRIX.get(user_type or "", {}).get(resource, frozenset())
    return action in role_actions or action in type_actions


class HasRolePermission(BasePermission):
    """Authorize ReservationTrack actions using role, type and assignment."""

    message = _("Tu rol no tiene permiso para realizar esta acción.")

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not isinstance(user, User) or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        resource = getattr(view, "permission_resource", None)
        if resource is None:
            return True

        action_name = getattr(view, "action", None)
        action_key = action_name if isinstance(action_name, str) else None
        needed = _STANDARD_ACTIONS.get(action_key) if action_key is not None else None
        if needed is None:
            if action_key in {"approve", "reject"}:
                needed = REVIEW
            else:
                is_read_only = request.method in ("GET", "HEAD", "OPTIONS") or (
                    action_key in getattr(view, "readonly_actions", ())
                )
                needed = VIEW if is_read_only else EDIT

        return role_can(
            getattr(user, "role", None),
            resource,
            needed,
            user_type=getattr(user, "type", None),
        )

    def has_object_permission(self, request, view, obj) -> bool:
        user = request.user
        if not isinstance(user, User) or not user.is_authenticated:
            return False
        if user.is_superuser or user.role == Role.ADMIN:
            return True

        resource = getattr(view, "permission_resource", None)
        action_name = getattr(view, "action", None)
        action_key = action_name if isinstance(action_name, str) else None
        action = _STANDARD_ACTIONS.get(action_key) if action_key is not None else None
        if action_key in {"approve", "reject"}:
            action = REVIEW
        if action is None and request.method not in ("GET", "HEAD", "OPTIONS"):
            action = EDIT

        if resource == "spaces" and action == EDIT:
            return (
                user.type == UserType.PERSONAL_ADMINISTRATOR
                and obj.responsibilities.filter(user=user, is_active=True).exists()
            )
        if resource == "reservations" and action == EDIT:
            # FR-039: solo el solicitante modifica su solicitud, y mientras
            # siga pendiente (una aprobada no se mueve sin nueva revisión).
            return obj.user_id == user.pk and obj.status == "pending"
        if resource == "reservations" and action == REVIEW:
            return (
                user.type == UserType.TEACHER
                and obj.space.responsibilities.filter(user=user, is_active=True).exists()
            )
        return True
