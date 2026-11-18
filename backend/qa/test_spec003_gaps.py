"""Brechas detectadas al contrastar el spec 003: FR-039, FR-033, SC-001."""
import threading

import pytest
from django.db import connection

from reservations.models import Reservation, ReservationStatus
from users.models import User

from .conftest import api, assign, make_space, make_user
from .test_reservations import URL, body, book, reservation

Type = User.Type
RESP = "/api/v1/responsibilities/"


# ---------------------------------------------------------------- FR-039
def test_owner_modifies_own_pending_reservation(student):
    space = make_space()
    mine = reservation(student, space)
    response = api(student).patch(f"{URL}{mine.pk}/", {"reason": "Cambio"}, format="json")
    assert response.status_code == 200, response.content
    mine.refresh_from_db()
    assert mine.reason == "Cambio"


def test_owner_modification_revalidates_conflicts_excluding_itself(student):
    space = make_space()
    mine = reservation(student, space)
    reservation(student, space, start="12:00", end="13:00")
    client = api(student)
    assert client.patch(f"{URL}{mine.pk}/", {"end_time": "11:00"}, format="json").status_code == 200
    assert client.patch(f"{URL}{mine.pk}/", {"end_time": "12:30"}, format="json").status_code == 400


def test_owner_cannot_modify_after_review(student):
    space = make_space()
    mine = reservation(student, space, status=ReservationStatus.APPROVED)
    response = api(student).patch(f"{URL}{mine.pk}/", {"start_time": "09:00"}, format="json")
    assert response.status_code == 403


def test_user_cannot_modify_someone_elses_reservation(student):
    other = make_user("est2", type=Type.STUDENT)
    mine = reservation(student, make_space())
    assert api(other).patch(f"{URL}{mine.pk}/", {"reason": "x"}, format="json").status_code == 404


def test_responsible_teacher_can_review_but_not_edit_others_reservation(teacher, student):
    space = make_space()
    assign(teacher, space)
    res = reservation(student, space)
    client = api(teacher)
    assert client.patch(f"{URL}{res.pk}/", {"reason": "x"}, format="json").status_code == 403
    assert client.post(f"{URL}{res.pk}/approve/").status_code == 200


# ---------------------------------------------------------------- FR-033
def test_staff_deactivates_and_reactivates_responsible_in_own_space(staff):
    space = make_space()
    assign(staff, space)
    responsible = assign(make_user("doc2", type=Type.TEACHER), space)
    client = api(staff)
    off = client.patch(f"{RESP}{responsible.pk}/", {"is_active": False}, format="json")
    assert off.status_code == 200, off.content
    on = client.patch(f"{RESP}{responsible.pk}/", {"is_active": True}, format="json")
    assert on.status_code == 200 and on.data["is_active"] is True


def test_staff_cannot_touch_responsibilities_of_other_spaces(staff):
    own, other_space = make_space(), make_space("Otra")
    assign(staff, own)
    foreign = assign(make_user("doc3", type=Type.TEACHER), other_space)
    response = api(staff).patch(f"{RESP}{foreign.pk}/", {"is_active": False}, format="json")
    assert response.status_code in (403, 404)
    foreign.refresh_from_db()
    assert foreign.is_active is True


def test_staff_cannot_delete_responsibility(staff):
    space = make_space()
    assign(staff, space)
    responsible = assign(make_user("doc4", type=Type.TEACHER), space)
    assert api(staff).delete(f"{RESP}{responsible.pk}/").status_code == 403


# ---------------------------------------------------------------- SC-001
@pytest.mark.django_db(transaction=True)
def test_simultaneous_requests_for_same_slot_create_only_one():
    space = make_space()
    users = [make_user(f"est{i}", type=Type.STUDENT) for i in range(5)]
    barrier = threading.Barrier(len(users))
    codes = []

    def worker(user):
        try:
            barrier.wait()
            codes.append(book(user, space).status_code)
        finally:
            connection.close()

    threads = [threading.Thread(target=worker, args=(u,)) for u in users]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(codes) == [201, 400, 400, 400, 400], codes
    assert Reservation.objects.count() == 1
