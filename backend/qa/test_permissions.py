"""Matriz de permisos (role_can) y HasRolePermission / permisos de users."""
from types import SimpleNamespace

import pytest
from django.contrib.auth.models import AnonymousUser
from rest_framework.test import APIRequestFactory

from common.permissions import (
    CREATE, DELETE, EDIT, REVIEW, VIEW, HasRolePermission, role_can,
)
from reservations.models import Reservation
from users.models import User
from users.permissions import CanListAssignableUsers, IsAdminRole, IsSelf, IsSoftwareEngineer

from .conftest import assign, make_space, make_user

arf = APIRequestFactory()
Role, Type = User.Role, User.Type


def _request(user, method="get"):
    request = getattr(arf, method)("/x/")
    request.user = user
    return request


def _view(resource="spaces", action=None, **extra):
    return SimpleNamespace(permission_resource=resource, action=action, **extra)


# ---------------------------------------------------------------- role_can
def test_software_engineer_can_do_everything_except_unknown_actions():
    for action in (VIEW, CREATE, EDIT, DELETE, REVIEW):
        assert role_can(None, "users", action, is_software_engineer=True)
    assert not role_can(None, "users", "inventada", is_software_engineer=True)


@pytest.mark.parametrize("role,resource,action,expected", [
    (Role.ADMIN, "branches", DELETE, True),
    (Role.ADMIN, "users", DELETE, False),
    (Role.ADMIN, "reservations", REVIEW, True),
    (Role.USER, "spaces", VIEW, True),
    (Role.USER, "spaces", EDIT, False),
    (None, "spaces", VIEW, False),
    ("rol-raro", "spaces", VIEW, False),
    (Role.USER, "recurso-raro", VIEW, False),
])
def test_role_matrix(role, resource, action, expected):
    assert role_can(role, resource, action) is expected


@pytest.mark.parametrize("user_type,resource,action,expected", [
    (Type.STUDENT, "reservations", CREATE, True),
    (Type.STUDENT, "reservations", REVIEW, False),
    (Type.TEACHER, "reservations", REVIEW, True),
    (Type.TEACHER, "responsibilities", VIEW, True),
    (Type.PERSONAL_ADMINISTRATOR, "spaces", EDIT, True),
    (Type.PERSONAL_ADMINISTRATOR, "users", VIEW, True),
    (Type.PERSONAL_ADMINISTRATOR, "responsibilities", CREATE, True),
    (None, "reservations", CREATE, False),
    ("tipo-raro", "reservations", CREATE, False),
])
def test_type_matrix_adds_permissions_to_user_role(user_type, resource, action, expected):
    assert role_can(Role.USER, resource, action, user_type=user_type) is expected


# ------------------------------------------------------ has_permission
@pytest.mark.django_db
def test_has_permission_rejects_anonymous_and_non_user_objects():
    perm = HasRolePermission()
    assert not perm.has_permission(_request(AnonymousUser()), _view())
    assert not perm.has_permission(_request(None), _view())


@pytest.mark.django_db
def test_has_permission_superuser_and_missing_resource():
    perm = HasRolePermission()
    root = User.objects.create_superuser("root", "r@x.co", "Clave-Segura-123", first_name="R", last_name="T")
    assert perm.has_permission(_request(root), _view("users", "destroy"))
    student = make_user("e1")
    assert perm.has_permission(_request(student), SimpleNamespace(action="list"))  # sin permission_resource


@pytest.mark.django_db
@pytest.mark.parametrize("action,method,expected", [
    ("list", "get", True),
    ("retrieve", "get", True),
    ("create", "post", False),
    ("update", "put", False),
    ("partial_update", "patch", False),
    ("destroy", "delete", False),
    ("approve", "post", False),   # REVIEW: el estudiante no puede
    ("reject", "post", False),
    ("custom", "get", True),      # acción propia de solo lectura (GET)
    ("custom", "post", False),    # acción propia que escribe → EDIT
    (None, "get", True),
    (123, "post", False),         # action no str se ignora
])
def test_has_permission_maps_actions_for_a_plain_user(action, method, expected):
    user = make_user("e1")  # rol usuario + estudiante: solo VIEW en spaces
    assert HasRolePermission().has_permission(_request(user, method), _view("spaces", action)) is expected


@pytest.mark.django_db
def test_has_permission_readonly_actions_and_teacher_review():
    user = make_user("d1", type=Type.TEACHER)
    view = _view("spaces", "exportar", readonly_actions=("exportar",))
    assert HasRolePermission().has_permission(_request(user, "post"), view)
    assert HasRolePermission().has_permission(_request(user, "post"), _view("reservations", "approve"))
    assert HasRolePermission().has_permission(_request(user, "post"), _view("reservations", "create"))


# ------------------------------------------------ has_object_permission
@pytest.mark.django_db
def test_object_permission_rejects_anonymous_and_allows_admins():
    perm = HasRolePermission()
    space = make_space()
    assert not perm.has_object_permission(_request(AnonymousUser()), _view(), space)
    root = User.objects.create_superuser("root", "r@x.co", "Clave-Segura-123", first_name="R", last_name="T")
    assert perm.has_object_permission(_request(root), _view("spaces", "update"), space)
    admin = make_user("a1", role=Role.ADMIN)
    assert perm.has_object_permission(_request(admin), _view("spaces", "update"), space)


@pytest.mark.django_db
def test_object_permission_space_edit_requires_active_assignment():
    perm = HasRolePermission()
    space, other = make_space("A"), make_space("B")
    staff = make_user("s1", type=Type.PERSONAL_ADMINISTRATOR)
    assign(staff, space)
    for action, method in (("update", "put"), ("partial_update", "patch"), ("custom", "post")):
        view = _view("spaces", action)
        assert perm.has_object_permission(_request(staff, method), view, space)
        assert not perm.has_object_permission(_request(staff, method), view, other)
    student = make_user("e1")
    assert not perm.has_object_permission(_request(student, "put"), _view("spaces", "update"), space)
    inactive = make_user("s2", type=Type.PERSONAL_ADMINISTRATOR)
    assign(inactive, space, is_active=False)
    assert not perm.has_object_permission(_request(inactive, "put"), _view("spaces", "update"), space)


@pytest.mark.django_db
def test_object_permission_reservation_review_requires_responsible_teacher():
    perm = HasRolePermission()
    space = make_space()
    owner = make_user("e1")
    reservation = Reservation.objects.create(
        code="RT-1", user=owner, space=space, date="2030-01-01", start_time="08:00", end_time="09:00", reason="x"
    )
    teacher = make_user("d1", type=Type.TEACHER)
    for action in ("approve", "reject"):
        assert not perm.has_object_permission(_request(teacher, "post"), _view("reservations", action), reservation)
    assign(teacher, space)
    for action in ("approve", "reject"):
        assert perm.has_object_permission(_request(teacher, "post"), _view("reservations", action), reservation)
    student = make_user("e2")
    assert not perm.has_object_permission(_request(student, "post"), _view("reservations", "approve"), reservation)


@pytest.mark.django_db
def test_object_permission_defaults_to_true_for_reads_and_other_resources():
    perm = HasRolePermission()
    space = make_space()
    student = make_user("e1")
    assert perm.has_object_permission(_request(student, "get"), _view("spaces", "retrieve"), space)
    assert perm.has_object_permission(_request(student, "get"), _view("spaces", None), space)
    assert perm.has_object_permission(_request(student, "post"), _view("otro", "custom"), space)
    assert perm.has_object_permission(_request(student, "get"), _view("spaces", 5), space)


# ------------------------------------------------------------ users.permissions
@pytest.mark.django_db
def test_user_permission_classes():
    admin = make_user("a1", role=Role.ADMIN)
    staff = make_user("s1", type=Type.PERSONAL_ADMINISTRATOR)
    student = make_user("e1")
    root = User.objects.create_superuser("root", "r@x.co", "Clave-Segura-123", first_name="R", last_name="T")
    anon = AnonymousUser()

    can_list = CanListAssignableUsers()
    assert can_list.has_permission(_request(admin), None)
    assert can_list.has_permission(_request(root), None)
    assert can_list.has_permission(_request(staff), None)
    assert not can_list.has_permission(_request(student), None)
    assert not can_list.has_permission(_request(anon), None)

    is_admin = IsAdminRole()
    assert is_admin.has_permission(_request(admin), None)
    assert is_admin.has_permission(_request(root), None)
    assert not is_admin.has_permission(_request(student), None)
    assert not is_admin.has_permission(_request(anon), None)
    assert is_admin.has_object_permission(_request(admin), None, student)
    assert not is_admin.has_object_permission(_request(student), None, admin)

    engineer = IsSoftwareEngineer()
    assert engineer.has_permission(_request(root), None)
    assert not engineer.has_permission(_request(admin), None)
    assert not engineer.has_permission(_request(anon), None)

    is_self = IsSelf()
    assert is_self.has_permission(_request(student), None)
    assert not is_self.has_permission(_request(anon), None)
    assert is_self.has_object_permission(_request(student), None, student)
    assert not is_self.has_object_permission(_request(student), None, admin)
    assert not IsSelf().has_permission(SimpleNamespace(user=None), None)
