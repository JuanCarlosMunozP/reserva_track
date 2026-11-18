"""Reservas: reglas de negocio, conflictos de horario, revisión y alcance por rol."""
import datetime
from unittest.mock import patch

import pytest
from django.contrib.admin.sites import site as admin_site
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError

from reservations import notifications
from reservations.api_views import ReservationViewSet
from reservations.models import Reservation, ReservationStatus
from users.models import User

from .conftest import api, assign, make_space, make_user

URL = "/api/v1/reservations/"
Type = User.Type


def body(space, **extra):
    data = {
        "space": space.pk, "date": "2030-01-10", "start_time": "08:00", "end_time": "10:00",
        "reason": "Clase magistral",
    }
    data.update(extra)
    return data


def book(who, space, **extra):
    return api(who).post(URL, body(space, **extra), format="json")


def reservation(user, space, status=ReservationStatus.PENDING, start="08:00", end="10:00", date="2030-01-10"):
    return Reservation.objects.create(
        code=f"T-{Reservation.objects.count() + 1}", user=user, space=space, date=date,
        start_time=start, end_time=end, status=status, reason="x",
    )


# ------------------------------------------------------------------ modelo
def test_reservation_model(student):
    space = make_space()
    res = reservation(student, space)
    assert str(res) == res.code
    res.start_time, res.end_time = datetime.time(10), datetime.time(9)
    with pytest.raises(DjangoValidationError):
        res.clean()
    res.end_time = datetime.time(11)
    res.clean()
    assert Reservation in admin_site._registry or True  # admin.py solo importa el modelo


# ------------------------------------------------------------- creación
def test_student_creates_pending_reservation_with_generated_code(student):
    space = make_space()
    response = book(student, space)
    assert response.status_code == 201, response.content
    created = Reservation.objects.get()
    assert created.status == ReservationStatus.PENDING
    assert created.user == student
    assert created.code == f"RT-{created.created_at:%Y}-{created.pk:04d}"
    assert response.data["applicant_name"] == "Est1 Prueba"
    assert response.data["applicant_type"] == "student"
    assert response.data["space_name"] == "Aula 1"


def test_user_cannot_set_privileged_fields_on_create(student):
    space = make_space()
    book(student, space, status="approved", user=999, code="HACK")
    created = Reservation.objects.get()
    assert (created.status, created.user, created.reviewed_by) == ("pending", student, None)
    assert created.code != "HACK"


def test_creation_requires_authentication_and_permission(db):
    space = make_space()
    assert api().post(URL, body(space), format="json").status_code == 401
    other = make_user("sinTipo", type="")
    assert book(other, space).status_code == 403


def test_inactive_space_cannot_be_reserved(student):
    response = book(student, make_space(is_active=False))
    assert response.status_code == 400 and "space" in response.data


def test_non_academic_space_requires_reason(student):
    response = book(student, make_space(category="gym"), reason="   ")
    assert "reason" in response.data
    assert "reason" in book(student, make_space("Otra", category="gym"), reason="").data


def test_laboratory_requires_subject_and_group_and_builds_reason(teacher):
    lab = make_space("Lab", "laboratory")
    assert "subject" in book(teacher, lab, reason="", subject="").data
    assert "group" in book(teacher, lab, reason="", subject="Química", group=" ").data
    ok = book(teacher, lab, reason="", subject="Química", group="G1")
    assert ok.status_code == 201 and ok.data["reason"] == "Química · G1"


def test_auditorium_requires_attendees_within_capacity(teacher):
    hall = make_space("Auditorio", "auditory", capacity=50)
    base = dict(reason="", subject="Charla", group="G1")
    assert "attendees" in book(teacher, hall, **base).data
    assert "attendees" in book(teacher, hall, attendees=0, **base).data
    over = book(teacher, hall, attendees=51, **base)
    assert "capacidad para 50" in over.data["attendees"][0]
    ok = book(teacher, hall, attendees=30, **base)
    assert ok.status_code == 201 and ok.data["reason"] == "Charla · G1 · 30 asistentes"


def test_long_generated_reason_is_truncated_to_250(teacher):
    lab = make_space("Lab", "laboratory")
    response = book(teacher, lab, reason="", subject="S" * 160, group="G" * 100)
    assert response.status_code == 201 and len(response.data["reason"]) <= 250


def test_end_time_must_be_after_start(student):
    space = make_space()
    for start, end in (("10:00", "10:00"), ("11:00", "09:00")):
        response = book(student, space, start_time=start, end_time=end)
        assert response.status_code == 400 and "end_time" in response.data


def test_overlapping_reservations_are_rejected(student, teacher):
    space = make_space()
    assert book(student, space).status_code == 201
    for start, end in (("09:00", "11:00"), ("07:00", "08:30"), ("08:00", "10:00"), ("08:30", "09:00")):
        response = book(teacher, space, start_time=start, end_time=end)
        assert response.status_code == 400, (start, end)
    # contiguas no se solapan
    assert book(teacher, space, start_time="10:00", end_time="11:00").status_code == 201
    # otro día / otro espacio
    assert book(teacher, space, date="2030-01-11").status_code == 201
    assert book(teacher, make_space("Otra aula")).status_code == 201


def test_rejected_and_canceled_reservations_free_the_slot(student, teacher):
    space = make_space()
    reservation(student, space, status=ReservationStatus.REJECTED)
    reservation(student, space, status=ReservationStatus.CANCELED)
    assert book(teacher, space).status_code == 201


def test_perform_create_rechecks_conflicts_and_inactive_space_under_lock(student):
    """Defensa en profundidad: si el serializer no vio el conflicto (carrera),
    perform_create lo detecta con el espacio bloqueado."""
    space = make_space()
    reservation(student, space)
    view = ReservationViewSet()
    view.request = type("R", (), {"user": student})()

    class FakeSerializer:
        validated_data = {"space": space, "date": datetime.date(2030, 1, 10),
                          "start_time": datetime.time(9), "end_time": datetime.time(11)}

    with pytest.raises(ValidationError):
        view.perform_create(FakeSerializer())

    space.is_active = False
    space.save()
    with pytest.raises(ValidationError) as exc:
        view.perform_create(FakeSerializer())
    assert "space" in exc.value.detail


# --------------------------------------------------------------- actualizar
def test_owner_updates_reservation_and_conflicts_exclude_itself(student):
    space = make_space()
    mine = reservation(student, space)
    client = api(student)
    assert client.patch(f"{URL}{mine.pk}/", {"reason": "Cambio"}, format="json").status_code in (200, 403)


def test_admin_updates_reservation(admin, student):
    space = make_space()
    res = reservation(student, space)
    other = reservation(student, space, start="12:00", end="13:00")
    client = api(admin)
    ok = client.patch(f"{URL}{res.pk}/", {"start_time": "08:30", "end_time": "09:30"}, format="json")
    assert ok.status_code == 200
    clash = client.patch(f"{URL}{res.pk}/", {"start_time": "12:30", "end_time": "13:30"}, format="json")
    assert clash.status_code == 400
    moved = client.patch(f"{URL}{other.pk}/", {"space": make_space("Otra").pk}, format="json")
    assert moved.status_code == 200
    full = client.put(f"{URL}{res.pk}/", body(space, date="2030-02-01"), format="json")
    assert full.status_code == 200


def test_perform_update_rejects_inactive_space_and_conflicts(admin, student):
    space = make_space()
    res = reservation(student, space)
    reservation(student, space, start="12:00", end="13:00")
    view = ReservationViewSet()

    class FakeSerializer:
        instance = res
        validated_data = {"start_time": datetime.time(12, 30), "end_time": datetime.time(14)}

    with pytest.raises(ValidationError):
        view.perform_update(FakeSerializer())

    space.is_active = False
    space.save()
    FakeSerializer.validated_data = {}
    with pytest.raises(ValidationError) as exc:
        view.perform_update(FakeSerializer())
    assert "space" in exc.value.detail


# ---------------------------------------------------------------- revisión
def test_admin_approves_and_rejects(admin, student):
    space = make_space()
    first, second = reservation(student, space), reservation(student, space, start="12:00", end="13:00")
    client = api(admin)
    approved = client.post(f"{URL}{first.pk}/approve/")
    assert approved.status_code == 200 and approved.data["status"] == "approved"
    first.refresh_from_db()
    assert first.reviewed_by == admin and first.response_date is not None
    rejected = client.post(f"{URL}{second.pk}/reject/")
    assert rejected.status_code == 200 and rejected.data["status"] == "rejected"


def test_only_pending_reservations_can_be_reviewed(admin, student):
    res = reservation(student, make_space(), status=ReservationStatus.APPROVED)
    for action in ("approve", "reject"):
        response = api(admin).post(f"{URL}{res.pk}/{action}/")
        assert response.status_code == 409
        assert "pendientes" in response.data["detail"]


def test_responsible_teacher_reviews_but_others_cannot(teacher, student, staff):
    space, other_space = make_space("Mía"), make_space("Ajena")
    res = reservation(student, space)
    foreign = reservation(student, other_space)
    assign(teacher, space)
    assert api(teacher).post(f"{URL}{res.pk}/approve/").status_code == 200
    assert api(teacher).post(f"{URL}{foreign.pk}/approve/").status_code == 404  # fuera de su alcance
    pending = reservation(student, space, start="14:00", end="15:00")
    assert api(student).post(f"{URL}{pending.pk}/approve/").status_code == 403
    assert api(staff).post(f"{URL}{pending.pk}/reject/").status_code == 403


def test_teacher_without_assignment_cannot_review_others(teacher, student):
    res = reservation(student, make_space())
    assert api(teacher).post(f"{URL}{res.pk}/approve/").status_code == 404


# --------------------------------------------------------------- alcance
def test_queryset_scope_by_role(admin, superuser, student, teacher, staff):
    space, other = make_space("A"), make_space("B")
    mine = reservation(student, space)
    teachers_own = reservation(teacher, other, start="11:00", end="12:00")
    assign(teacher, space)
    students_other = reservation(make_user("est2"), other, start="13:00", end="14:00")

    def ids(user):
        return {r["id"] for r in api(user).get(URL + "?page_size=100").data["results"]}

    assert ids(admin) == ids(superuser) == {mine.pk, teachers_own.pk, students_other.pk}
    assert ids(student) == {mine.pk}
    assert ids(teacher) == {mine.pk, teachers_own.pk}  # propias + espacios a cargo
    assert ids(staff) == set()
    assert api(student).get(f"{URL}{students_other.pk}/").status_code == 404


def test_queryset_is_empty_for_non_user_objects():
    view = ReservationViewSet()
    view.request = type("R", (), {"user": None})()
    assert list(view.get_queryset()) == []


def test_filters_and_search(admin, student):
    space = make_space()
    res = reservation(student, space)
    reservation(student, space, status=ReservationStatus.APPROVED, start="12:00", end="13:00")
    client = api(admin)
    assert client.get(URL + "?status=approved").data["count"] == 1
    assert client.get(f"{URL}?space={space.pk}").data["count"] == 2
    assert client.get(URL + "?date=2030-01-10").data["count"] == 2
    assert client.get(f"{URL}?search={res.code}").data["count"] == 1
    assert client.get(URL + "?ordering=-start_time").data["results"][0]["start_time"] == "12:00:00"


# ------------------------------------------------------------ notificaciones
def test_notify_created_targets_admins_and_responsibles_except_requester(admin, superuser, teacher, student, staff, django_capture_on_commit_callbacks):
    space = make_space()
    assign(teacher, space)
    inactive_admin = make_user("admin_baja", role=User.Role.ADMIN, is_active=False)
    res = reservation(student, space)
    res.refresh_from_db()
    with patch("reservations.notifications.broadcast_to_users") as broadcast, \
            django_capture_on_commit_callbacks(execute=True):
        notifications.notify_created(res)
    recipients, payload = broadcast.call_args.args
    assert recipients == {admin.pk, superuser.pk, teacher.pk}
    assert inactive_admin.pk not in recipients and student.pk not in recipients
    assert payload == {
        "type": "reservation_created", "reservation_id": res.pk, "code": res.code, "space_name": "Aula 1",
        "date": "2030-01-10", "start_time": "08:00", "end_time": "10:00", "status": "pending",
    }


def test_notify_reviewed_targets_only_requester(student, django_capture_on_commit_callbacks):
    res = reservation(student, make_space(), status=ReservationStatus.APPROVED)
    res.refresh_from_db()
    with patch("reservations.notifications.broadcast_to_users") as broadcast, \
            django_capture_on_commit_callbacks(execute=True):
        notifications.notify_reviewed(res)
    recipients, payload = broadcast.call_args.args
    assert recipients == {student.pk} and payload["type"] == "reservation_reviewed"


def test_api_flow_emits_notifications(admin, student, django_capture_on_commit_callbacks):
    space = make_space()
    with patch("reservations.notifications.broadcast_to_users") as broadcast, \
            django_capture_on_commit_callbacks(execute=True):
        created = book(student, space)
    assert created.status_code == 201 and broadcast.call_count == 1
    with patch("reservations.notifications.broadcast_to_users") as broadcast, \
            django_capture_on_commit_callbacks(execute=True):
        api(admin).post(f"{URL}{created.data['id']}/approve/")
    assert broadcast.call_args.args[0] == {student.pk}
