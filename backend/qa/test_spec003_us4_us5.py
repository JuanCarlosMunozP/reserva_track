"""US1/US4/US5: franjas contiguas, conflicto oculto, búsqueda de espacios y rendimiento (SC-007)."""
import datetime
import time

from reservations.models import Reservation, ReservationStatus
from spaces.models import Space
from users.models import User

from .conftest import api, assign, make_space, make_user
from .test_reservations import URL, book, reservation

Type = User.Type


def test_contiguous_slots_do_not_conflict(student, teacher):
    space = make_space()
    assert book(student, space, start_time="08:00", end_time="10:00").status_code == 201
    assert book(teacher, space, start_time="10:00", end_time="11:00").status_code == 201
    assert book(teacher, space, start_time="07:00", end_time="08:00").status_code == 201


def test_conflict_detected_even_if_the_busy_slot_is_hidden_from_the_user(student, teacher):
    space = make_space()
    reservation(teacher, space, status=ReservationStatus.APPROVED)
    seen = api(student).get(f"{URL}?space={space.pk}&date=2030-01-10").data
    assert seen["count"] == 0  # el estudiante no ve la reserva ajena
    assert book(student, space).status_code == 400


def test_space_search_and_filters_are_public(admin):
    make_space("Laboratorio Química", "laboratory", 20, description="Equipos de análisis", location="Bloque C")
    make_space("Aula Magna", "auditory", 200, location="Edificio Central")
    make_space("Cancha", "gym", 50, location="Bloque D", is_active=False)
    client = api()
    assert client.get("/api/v1/spaces/?search=Química").data["count"] == 1
    assert client.get("/api/v1/spaces/?search=análisis").data["count"] == 1  # descripción
    assert client.get("/api/v1/spaces/?search=Central").data["count"] == 1   # ubicación
    assert client.get("/api/v1/spaces/?category=gym").data["count"] == 1
    assert client.get("/api/v1/spaces/?is_active=false").data["count"] == 1
    assert client.get("/api/v1/spaces/?category=gym&is_active=true").data["count"] == 0


def test_deactivating_a_space_keeps_reservations_and_blocks_new_ones(admin, student, teacher):
    space = make_space()
    kept = reservation(student, space)
    assert api(admin).patch(f"/api/v1/spaces/{space.pk}/", {"is_active": False}, format="json").status_code == 200
    assert Reservation.objects.filter(pk=kept.pk).exists()
    assert book(teacher, space, start_time="14:00", end_time="15:00").status_code == 400


def test_deleting_space_with_reservations_keeps_them_and_deactivates(admin, student):
    """P1C: se desactiva en vez de borrar en cascada."""
    space = make_space()
    reservation(student, space)
    assert api(admin).delete(f"/api/v1/spaces/{space.pk}/").status_code == 204
    assert Reservation.objects.count() == 1


def test_space_and_availability_queries_are_fast_with_load(admin, student):
    """SC-007: < 3 s. Datos de carga: 300 espacios, 6000 reservas."""
    spaces = Space.objects.bulk_create(
        [Space(name=f"Aula {i}", category="classroom", capacity=30, location="Bloque") for i in range(300)]
    )
    base = datetime.date(2030, 5, 1)
    Reservation.objects.bulk_create([
        Reservation(code=f"L-{i}", user=student, space=spaces[i % 300], date=base + datetime.timedelta(days=i % 20),
                    start_time=datetime.time(7 + i % 10), end_time=datetime.time(8 + i % 10), reason="x")
        for i in range(6000)
    ])
    client = api(admin)
    for path in ("/api/v1/spaces/?search=Aula", f"{URL}?date=2030-05-03", f"{URL}?search=L-12"):
        start = time.perf_counter()
        response = client.get(path)
        elapsed = time.perf_counter() - start
        assert response.status_code == 200 and elapsed < 3, (path, elapsed)
