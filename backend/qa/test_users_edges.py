"""Usuarios: ramas defensivas de serializers y del ViewSet que la API no alcanza por HTTP
(DRF filtra antes los valores vacíos y los permisos), verificadas llamando a las unidades."""
from types import SimpleNamespace

import pytest
from django.contrib.auth.models import AnonymousUser
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated

from users.models import User
from users.serializers import UserCreateSerializer, UserUpdateSerializer
from users.views import UserViewSet

from .conftest import api, make_user


@pytest.mark.parametrize("serializer_cls", [UserCreateSerializer, UserUpdateSerializer])
@pytest.mark.parametrize("field", ["username", "first_name", "last_name"])
def test_validators_reject_values_that_normalize_to_empty(serializer_cls, field, db):
    serializer = serializer_cls()
    with pytest.raises(ValidationError):
        getattr(serializer, f"validate_{field}")("   \t  ")


def test_create_validators_detect_duplicates_case_insensitively(db):
    make_user("ana", email="ana@example.com")
    serializer = UserCreateSerializer()
    with pytest.raises(ValidationError):
        serializer.validate_username("ANA")
    with pytest.raises(ValidationError):
        serializer.validate_email("  ANA@Example.com ")
    assert serializer.validate_email(" Nuevo@Example.com ") == "nuevo@example.com"


def test_update_validators_allow_own_values_but_reject_other_users_email(db):
    ana = make_user("ana", email="ana@example.com")
    make_user("beto", email="beto@example.com")
    serializer = UserUpdateSerializer(instance=ana)
    assert serializer.validate_username("ana") == "ana"
    assert serializer.validate_email("ANA@example.com") == "ana@example.com"
    with pytest.raises(ValidationError):
        serializer.validate_email("beto@example.com")
    with pytest.raises(ValidationError):
        serializer.validate_username("BETO")


def test_update_duplicate_email_through_api_returns_400(db):
    admin = make_user("root", role=User.Role.ADMIN, type="")
    other = make_user("beto", email="beto@example.com")
    target = make_user("ana", email="ana@example.com")
    response = api(admin).patch(f"/api/v1/users/{target.pk}/", {"email": other.email}, format="json")
    assert response.status_code == 400 and "email" in response.data


def test_options_request_falls_back_to_admin_permissions(db):
    viewset = UserViewSet()
    viewset.action = "metadata"
    classes = [type(p).__name__ for p in viewset.get_permissions()]
    assert classes == ["IsAuthenticated", "IsAdminRole"]
    assert api(make_user("est")).options("/api/v1/users/").status_code == 403


def _viewset(action, user):
    viewset = UserViewSet()
    viewset.action = action
    viewset.request = SimpleNamespace(user=user)
    return viewset


def test_queryset_is_empty_for_non_user_principals(db):
    make_user("ana")
    assert _viewset("list", AnonymousUser()).get_queryset().count() == 0


def test_queryset_for_list_by_role(db):
    admin = make_user("root", role=User.Role.ADMIN, type="")
    assistant = make_user("pa", type=User.Type.PERSONAL_ADMINISTRATOR)
    student = make_user("est")
    inactive = make_user("baja", is_active=False)
    admin_ids = set(_viewset("list", admin).get_queryset().values_list("pk", flat=True))
    assert {admin.pk, assistant.pk, student.pk, inactive.pk} <= admin_ids
    pa_ids = set(_viewset("list", assistant).get_queryset().values_list("pk", flat=True))
    assert student.pk in pa_ids and inactive.pk not in pa_ids and admin.pk not in pa_ids
    # un usuario común sin permiso de listado no ve a nadie
    assert _viewset("list", student).get_queryset().count() == 0
    # fuera de "list" no se filtra
    assert _viewset("retrieve", student).get_queryset().count() >= 4
