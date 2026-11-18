"""Pruebas de los comportamientos descritos en SSD.md (SSD-07, 12, 13, 16)."""
import datetime

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from branches.models import City, Department
from reservations.models import Reservation, ReservationStatus
from spaces.models import Space
from users.models import User


@pytest.fixture
def superuser(db):
    return User.objects.create_superuser(
        username="root", email="root@example.com", password="Clave-Segura-123"
    )


def _client(user=None):
    client = APIClient()
    client.raise_request_exception = False  # ver el 500 como respuesta, no como excepción
    if user is not None:
        client.force_authenticate(user)
    return client


def _space():
    return Space.objects.create(name="Aula 1", category="classroom", capacity=30, location="Bloque A")


# SSD-13 ---------------------------------------------------------------------
def test_delete_department_with_cities_returns_409(superuser):
    department = Department.objects.create(name="Cundinamarca")
    City.objects.create(name="Bogotá", department=department)

    response = _client(superuser).delete(f"/api/v1/departments/{department.pk}/")

    assert Department.objects.filter(pk=department.pk).exists()
    assert response.status_code == 409


# SSD-16 ---------------------------------------------------------------------
def _new_user_payload(**extra):
    return {
        "username": "nuevo", "email": "nuevo@example.com",
        "first_name": "Nuevo", "last_name": "Usuario",
        "role": "usuario", "password": "Clave-Segura-123", **extra,
    }


def test_create_user_requires_type(superuser):
    response = _client(superuser).post("/api/v1/users/", _new_user_payload(), format="json")

    assert response.status_code == 400
    assert "type" in response.json()


def test_user_created_with_type_can_reserve(superuser):
    created = _client(superuser).post(
        "/api/v1/users/", _new_user_payload(type="teacher"), format="json"
    )
    assert created.status_code == 201, created.content
    user = User.objects.get(username="nuevo")
    assert user.type == "teacher"

    response = _client(user).post(
        "/api/v1/reservations/",
        {
            "space": _space().pk, "date": "2030-01-10",
            "start_time": "08:00", "end_time": "10:00", "reason": "Clase",
        },
        format="json",
    )
    assert response.status_code == 201, response.content


def test_password_change_revokes_other_sessions_and_keeps_current(superuser):
    user = User.objects.create_user(
        username="est", email="est@example.com", password="Clave-Vieja-123",
        role="usuario", type="student",
    )
    other_session = str(RefreshToken.for_user(user))
    current_session = str(RefreshToken.for_user(user))

    client = _client(user)
    client.cookies["refresh_token"] = current_session
    changed = client.post(
        f"/api/v1/users/{user.pk}/set_password/",
        {"current_password": "Clave-Vieja-123", "new_password": "Clave-Nueva-456!"},
        format="json",
    )
    assert changed.status_code == 204, changed.content

    revoked = _client().post("/api/v1/auth/token/refresh/", {"refresh": other_session}, format="json")
    kept = _client().post("/api/v1/auth/token/refresh/", {"refresh": current_session}, format="json")
    assert revoked.status_code == 401
    assert kept.status_code == 200


def test_admin_password_reset_revokes_all_sessions_of_target(superuser):
    user = User.objects.create_user(
        username="est", email="est@example.com", password="Clave-Vieja-123",
        role="usuario", type="student",
    )
    refresh = str(RefreshToken.for_user(user))

    changed = _client(superuser).post(
        f"/api/v1/users/{user.pk}/set_password/",
        {"new_password": "Clave-Nueva-456!"}, format="json",
    )
    assert changed.status_code == 204, changed.content

    renewed = _client().post("/api/v1/auth/token/refresh/", {"refresh": refresh}, format="json")
    assert renewed.status_code == 401


# SSD-07 / SSD-12 --------------------------------------------------------------
class FakeLayer:
    def __init__(self):
        self.sent = []

    async def group_send(self, group, message):
        self.sent.append((group, message["payload"]))


@pytest.fixture
def layer(monkeypatch):
    fake = FakeLayer()
    monkeypatch.setattr("realtime.events.get_channel_layer", lambda: fake)
    return fake


def _student():
    return User.objects.create_user(
        username="alumno", email="alumno@example.com", password="Clave-Segura-123",
        role="usuario", type="student",
    )


def test_review_notifies_only_the_requester(superuser, layer, django_capture_on_commit_callbacks):
    student = _student()
    reservation = Reservation.objects.create(
        user=student, space=_space(), code="RT-2030-0001", date=datetime.date(2030, 1, 10),
        start_time=datetime.time(8), end_time=datetime.time(10), reason="Clase",
    )

    with django_capture_on_commit_callbacks(execute=True):
        response = _client(superuser).post(f"/api/v1/reservations/{reservation.pk}/approve/")

    assert response.status_code == 200
    assert [group for group, _ in layer.sent] == [f"user.{student.pk}"]
    payload = layer.sent[0][1]
    assert payload["type"] == "reservation_reviewed"
    assert payload["status"] == ReservationStatus.APPROVED
    assert payload["code"] == "RT-2030-0001"


def test_create_notifies_admins_and_space_responsibles_not_requester(
    superuser, layer, django_capture_on_commit_callbacks
):
    from spaces.models import SpaceResponsibility

    student = _student()
    teacher = User.objects.create_user(
        username="docente", email="docente@example.com", password="Clave-Segura-123",
        role="usuario", type="teacher",
    )
    bystander = User.objects.create_user(
        username="otro", email="otro@example.com", password="Clave-Segura-123",
        role="usuario", type="teacher",
    )
    space = _space()
    SpaceResponsibility.objects.create(user=teacher, space=space)

    with django_capture_on_commit_callbacks(execute=True):
        response = _client(student).post(
            "/api/v1/reservations/",
            {
                "space": space.pk, "date": "2030-01-10",
                "start_time": "08:00", "end_time": "10:00", "reason": "Clase",
            },
            format="json",
        )

    assert response.status_code == 201, response.content
    groups = {group for group, _ in layer.sent}
    assert groups == {f"user.{superuser.pk}", f"user.{teacher.pk}"}
    assert f"user.{bystander.pk}" not in groups
    assert {payload["type"] for _, payload in layer.sent} == {"reservation_created"}
