"""Decisiones del usuario sobre el spec: desactivar en vez de borrar (P1C),
cancelar por solicitante o administrador (P2C) y horario permitido (P3B)."""
from reservations.models import Reservation, ReservationStatus
from spaces.models import Space
from users.models import User

from .conftest import api, make_space, make_user
from .test_reservations import URL, book, reservation


# ------------------------------------------------------------- P3B horario
def test_reservation_outside_allowed_hours_is_rejected(student):
    space = make_space()
    assert book(student, space, start_time="06:00", end_time="08:00").status_code == 400
    assert book(student, space, start_time="20:00", end_time="22:00").status_code == 400


def test_reservation_at_the_edges_of_allowed_hours_is_accepted(student):
    space = make_space()
    assert book(student, space, start_time="07:00", end_time="09:00").status_code == 201
    assert book(student, space, start_time="19:00", end_time="21:00").status_code == 201


# ------------------------------------------------------------- P2C cancelar
def test_owner_cancels_own_reservation_and_slot_is_free(student):
    space = make_space()
    mine = reservation(student, space, date="2099-01-10")
    response = api(student).post(f"{URL}{mine.pk}/cancel/")
    assert response.status_code == 200 and response.json()["status"] == "canceled"
    other = make_user("est2", type=User.Type.STUDENT)
    assert book(other, space, date="2099-01-10").status_code == 201


def test_admin_cancels_approved_reservation(student, admin):
    mine = reservation(student, make_space(), status=ReservationStatus.APPROVED, date="2099-01-10")
    assert api(admin).post(f"{URL}{mine.pk}/cancel/").status_code == 200


def test_other_user_cannot_cancel(student):
    mine = reservation(student, make_space(), date="2099-01-10")
    other = make_user("est2", type=User.Type.STUDENT)
    assert api(other).post(f"{URL}{mine.pk}/cancel/").status_code == 404


def test_cannot_cancel_started_or_already_closed_reservation(student):
    started = reservation(student, make_space(), date="2020-01-10")
    assert api(student).post(f"{URL}{started.pk}/cancel/").status_code == 409
    rejected = reservation(student, make_space(), status=ReservationStatus.REJECTED, date="2099-01-10")
    assert api(student).post(f"{URL}{rejected.pk}/cancel/").status_code == 409


def test_responsible_teacher_who_is_not_owner_cannot_cancel(teacher, student):
    from .conftest import assign
    space = make_space()
    assign(teacher, space)
    res = reservation(student, space, date="2099-01-10")
    assert api(teacher).post(f"{URL}{res.pk}/cancel/").status_code == 403


# ------------------------------------------------------------- P1C desactivar
def test_deleting_user_with_reservations_deactivates_them(superuser, student):
    reservation(student, make_space())
    assert api(superuser).delete(f"/api/v1/users/{student.pk}/").status_code == 204
    student.refresh_from_db()
    assert student.is_active is False
    assert Reservation.objects.filter(user=student).count() == 1


def test_deleting_user_without_reservations_removes_them(superuser, student):
    assert api(superuser).delete(f"/api/v1/users/{student.pk}/").status_code == 204
    assert not User.objects.filter(pk=student.pk).exists()


def test_deleting_space_with_reservations_deactivates_it(admin, student):
    space = make_space()
    reservation(student, space)
    assert api(admin).delete(f"/api/v1/spaces/{space.pk}/").status_code == 204
    space.refresh_from_db()
    assert space.is_active is False and Reservation.objects.filter(space=space).count() == 1


def test_deleting_space_without_reservations_removes_it(admin):
    space = make_space()
    assert api(admin).delete(f"/api/v1/spaces/{space.pk}/").status_code == 204
    assert not Space.objects.filter(pk=space.pk).exists()
