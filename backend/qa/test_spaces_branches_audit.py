"""Espacios, responsables, catálogo de sedes y auditoría."""
from types import SimpleNamespace

import pytest
from django.contrib.admin.sites import site as admin_site
from django.test import RequestFactory

from audit.admin import AuditLogAdmin
from audit.models import AuditAction, AuditLog
from audit.utils import _client_ip, log_audit_event
from branches.api_serializers import AreaSerializer, BranchSerializer, CitySerializer, DepartmentSerializer
from branches.models import Area, Branch, City, Department, Location
from spaces.models import Space, SpaceResponsibility
from users.models import User

from .conftest import api, assign, make_space, make_user

SPACES = "/api/v1/spaces/"
RESP = "/api/v1/responsibilities/"
Type = User.Type


# ------------------------------------------------------------------ espacios
def test_space_lists_are_public_and_filterable(db):
    make_space("Lab", "laboratory", 20, description="Prácticas")
    make_space("Gym", "gym", 50, is_active=False)
    client = api()
    assert client.get(SPACES).data["count"] == 2
    assert client.get(SPACES + "?category=gym").data["count"] == 1
    assert client.get(SPACES + "?is_active=true").data["count"] == 1
    assert client.get(SPACES + "?search=prácticas").data["count"] == 1
    assert client.get(SPACES + "?ordering=-capacity").data["results"][0]["name"] == "Gym"
    detail = client.get(f"{SPACES}{Space.objects.get(name='Lab').pk}/")
    assert detail.status_code == 200 and detail.data["category_label"] == "Laboratorio"


def test_space_responsible_names_only_include_active_assignments(db, teacher, staff):
    space = make_space()
    assign(teacher, space)
    assign(staff, space, is_active=False)
    names = api().get(f"{SPACES}{space.pk}/").data["responsible_names"]
    assert names == ["Doc1 Prueba"]


def test_only_admin_can_create_and_delete_spaces(admin, student, staff):
    body = {"name": "Nueva", "category": "gym", "capacity": 10, "location": "Sótano"}
    assert api().post(SPACES, body, format="json").status_code == 401
    assert api(student).post(SPACES, body, format="json").status_code == 403
    assert api(staff).post(SPACES, body, format="json").status_code == 403
    created = api(admin).post(SPACES, body, format="json")
    assert created.status_code == 201
    assert api(staff).delete(f"{SPACES}{created.data['id']}/").status_code == 403
    assert api(admin).delete(f"{SPACES}{created.data['id']}/").status_code == 204


def test_assigned_staff_edits_only_their_spaces(staff):
    mine, other = make_space("Mía"), make_space("Ajena")
    assign(staff, mine)
    assert api(staff).patch(f"{SPACES}{mine.pk}/", {"capacity": 99}, format="json").status_code == 200
    assert api(staff).patch(f"{SPACES}{other.pk}/", {"capacity": 99}, format="json").status_code == 403


def test_space_validations(admin):
    client = api(admin)
    no_location = client.post(SPACES, {"name": "X", "category": "gym", "capacity": 5}, format="json")
    assert "location" in no_location.data
    zero = client.post(SPACES, {"name": "X", "category": "gym", "capacity": 0, "location": "A"}, format="json")
    assert "capacity" in zero.data
    xss = client.post(SPACES, {"name": "<b>x</b>", "category": "gym", "capacity": 3, "location": "A"}, format="json")
    assert xss.status_code == 400
    url_in_name = client.post(SPACES, {"name": "www.malo.com", "category": "gym", "capacity": 3, "location": "A"}, format="json")
    assert "name" in url_in_name.data


def test_space_location_is_filled_from_catalog_place(admin):
    branch = Branch.objects.create(name="Central")
    area = Area.objects.create(name="Bloque A")
    place = Location.objects.create(detail="Piso 2", branch=branch, area=area)
    client = api(admin)
    created = client.post(SPACES, {"name": "Lab", "category": "laboratory", "capacity": 5, "place": place.pk}, format="json")
    assert created.status_code == 201 and created.data["location"] == "Central · Bloque A · Piso 2"
    # actualizar sin enviar ubicación conserva la existente
    updated = client.patch(f"{SPACES}{created.data['id']}/", {"capacity": 8}, format="json")
    assert updated.status_code == 200 and updated.data["location"] == "Central · Bloque A · Piso 2"


def test_space_str_and_admin_registered(db):
    assert str(make_space("Auditorio")) == "Auditorio"
    assert Space in admin_site._registry and SpaceResponsibility in admin_site._registry


# -------------------------------------------------------------- responsables
def test_responsibility_str_and_admin_crud(admin, staff, student):
    space = make_space()
    client = api(admin)
    created = client.post(RESP, {"user": staff.pk, "space": space.pk}, format="json")
    assert created.status_code == 201, created.content
    assert created.data["user_name"] == "Adm1 Prueba" and created.data["space_name"] == "Aula 1"
    assert str(SpaceResponsibility.objects.get()) == f"{staff.pk} → {space.pk}"
    assert client.get(RESP).data["count"] == 1
    assert client.patch(f"{RESP}{created.data['id']}/", {"is_active": False}, format="json").status_code == 200
    assert client.delete(f"{RESP}{created.data['id']}/").status_code == 204


def test_responsibility_validations(admin, student):
    space = make_space()
    client = api(admin)
    other_admin = make_user("admin2", role=User.Role.ADMIN)
    assert "user" in client.post(RESP, {"user": other_admin.pk, "space": space.pk}, format="json").data
    inactive = make_user("baja", is_active=False)
    assert "user" in client.post(RESP, {"user": inactive.pk, "space": space.pk}, format="json").data
    duplicated = make_user("dup")
    assert client.post(RESP, {"user": duplicated.pk, "space": space.pk}, format="json").status_code == 201
    assert client.post(RESP, {"user": duplicated.pk, "space": space.pk}, format="json").status_code == 400


def test_responsibility_validate_without_user_instance():
    from spaces.api_serializers import SpaceResponsibilitySerializer

    with pytest.raises(Exception):
        SpaceResponsibilitySerializer().validate({})


def test_staff_assigns_only_in_their_spaces(staff):
    mine, other = make_space("Mía"), make_space("Ajena")
    assign(staff, mine)
    candidate = make_user("cand")
    client = api(staff)
    assert client.post(RESP, {"user": candidate.pk, "space": mine.pk}, format="json").status_code == 201
    denied = client.post(RESP, {"user": candidate.pk, "space": other.pk}, format="json")
    assert denied.status_code == 400 and "space" in denied.data


def test_responsibility_visibility_by_role(admin, teacher, staff, student):
    s1, s2 = make_space("S1"), make_space("S2")
    assign(teacher, s1)
    assign(staff, s1)
    assign(staff, s2)
    assign(teacher, s2, is_active=False)
    assert api(admin).get(RESP).data["count"] == 4
    assert {r["space"] for r in api(teacher).get(RESP).data["results"]} == {s1.pk}
    assert api(staff).get(RESP).data["count"] >= 2
    assert api(student).get(RESP).status_code == 403
    assert api().get(RESP).status_code == 401


def test_responsibility_queryset_for_non_user(db):
    from spaces.api_views import SpaceResponsibilityViewSet

    view = SpaceResponsibilityViewSet()
    view.request = SimpleNamespace(user=None)
    assert list(view.get_queryset()) == []


def test_responsibility_queryset_for_unlisted_type(db):
    from spaces.api_views import SpaceResponsibilityViewSet

    view = SpaceResponsibilityViewSet()
    view.request = SimpleNamespace(user=make_user("e9"))  # estudiante
    assert list(view.get_queryset()) == []


# --------------------------------------------------------------- catálogo
@pytest.fixture
def catalog(db):
    dept = Department.objects.create(name="Cundinamarca")
    city = City.objects.create(name="Bogotá", department=dept)
    branch = Branch.objects.create(name="Sede Central", city=city)
    area = Area.objects.create(name="Bloque A")
    loc = Location.objects.create(detail="Piso 1", branch=branch, area=area)
    return SimpleNamespace(dept=dept, city=city, branch=branch, area=area, loc=loc)


def test_catalog_models_str(catalog):
    assert str(catalog.dept) == "Cundinamarca"
    assert str(catalog.city) == "Bogotá"
    assert str(catalog.branch) == "Sede Central"
    assert str(catalog.area) == "Bloque A"
    assert str(catalog.loc) == "Sede Central · Bloque A · Piso 1"


@pytest.mark.parametrize("route", ["branches", "departments", "cities", "areas", "locations"])
def test_catalog_reads_are_public(catalog, route):
    response = api().get(f"/api/v1/{route}/")
    assert response.status_code == 200 and response.data["count"] == 1


def test_catalog_filters_and_search(catalog):
    client = api()
    assert client.get(f"/api/v1/cities/?department={catalog.dept.pk}").data["count"] == 1
    assert client.get(f"/api/v1/locations/?branch={catalog.branch.pk}&area={catalog.area.pk}").data["count"] == 1
    assert client.get("/api/v1/locations/?search=piso").data["count"] == 1
    assert client.get("/api/v1/branches/?search=zzz").data["count"] == 0
    assert client.get("/api/v1/city_detail/").status_code == 404
    assert client.get(f"/api/v1/cities/{catalog.city.pk}/").data["department_name"] == "Cundinamarca"
    assert client.get(f"/api/v1/locations/{catalog.loc.pk}/").data["label"].endswith("Piso 1")


def test_catalog_writes_require_admin(catalog, admin, student):
    assert api().post("/api/v1/areas/", {"name": "Nueva"}, format="json").status_code == 401
    assert api(student).post("/api/v1/areas/", {"name": "Nueva"}, format="json").status_code == 403
    created = api(admin).post("/api/v1/areas/", {"name": "  Bloque   B "}, format="json")
    assert created.status_code == 201 and created.data["name"] == "Bloque B"
    assert api(admin).patch(f"/api/v1/areas/{created.data['id']}/", {"name": "Bloque C"}, format="json").status_code == 200
    assert api(admin).delete(f"/api/v1/areas/{created.data['id']}/").status_code == 204


def test_branch_create_update_and_duplicates(catalog, admin):
    client = api(admin)
    ok = client.post("/api/v1/branches/", {"name": " Sede   Norte "}, format="json")
    assert ok.status_code == 201 and ok.data["name"] == "Sede Norte"
    dup = client.post("/api/v1/branches/", {"name": "sede norte"}, format="json")
    assert dup.status_code == 400 and "name" in dup.data
    same = client.patch(f"/api/v1/branches/{ok.data['id']}/", {"name": "SEDE NORTE"}, format="json")
    assert same.status_code == 200


def test_catalog_serializers_reject_blank_normalized_names(db):
    for serializer in (BranchSerializer, DepartmentSerializer, AreaSerializer, CitySerializer):
        with pytest.raises(Exception):
            serializer().validate_name("   ")
        assert serializer().validate_name("  A   B ") == "A B"


@pytest.mark.parametrize("route,attr", [
    ("departments", "dept"), ("cities", "city"), ("branches", "branch"), ("areas", "area"), ("locations", "loc"),
])
def test_deleting_referenced_catalog_item_returns_409(catalog, admin, route, attr):
    # La jerarquía protege cada nivel que tiene hijos; la hoja (location) se
    # protege cuando un espacio la usa.
    if attr == "loc":
        make_space("Con lugar", place=catalog.loc)
    response = api(admin).delete(f"/api/v1/{route}/{getattr(catalog, attr).pk}/")
    assert response.status_code == 409
    assert "depende" in response.data["detail"]


def test_catalog_admin_classes_registered(db):
    for model in (Department, City, Branch, Area, Location):
        assert model in admin_site._registry


# ------------------------------------------------------------------ auditoría
def test_client_ip_variants():
    rf = RequestFactory()
    assert _client_ip(None) is None
    assert _client_ip(rf.get("/", HTTP_X_FORWARDED_FOR="1.1.1.1, 2.2.2.2")) == "1.1.1.1"
    assert _client_ip(rf.get("/", REMOTE_ADDR="3.3.3.3")) == "3.3.3.3"


def test_log_audit_event_records_actor_ip_and_changes(student):
    rf = RequestFactory()
    log = log_audit_event(
        student, AuditAction.UPDATE, student,
        request=rf.get("/", REMOTE_ADDR="4.4.4.4"), changes={"a": 1},
    )
    assert (log.actor, log.ip_address, log.changes) == (student, "4.4.4.4", {"a": 1})
    anon = log_audit_event(SimpleNamespace(is_authenticated=False), AuditAction.CREATE, student)
    assert anon.actor is None and anon.changes == {}
    assert str(log) == f"Actualización users.user#{student.pk} por est1 (Usuario)"


def test_audit_log_admin_is_read_only(db):
    model_admin = admin_site._registry[AuditLog]
    assert isinstance(model_admin, AuditLogAdmin)
    request = RequestFactory().get("/")
    assert model_admin.has_add_permission(request) is False
    assert model_admin.has_change_permission(request) is False
    assert model_admin.has_change_permission(request, obj=object()) is False
    assert model_admin.has_delete_permission(request) is False
    assert model_admin.has_delete_permission(request, obj=object()) is False
