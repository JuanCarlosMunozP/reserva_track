"""US3/US7/US8: registro, roles, auto-edición, auditoría y 403 directo."""
from audit.models import AuditLog
from users.models import User

from .conftest import PASSWORD, api, assign, make_space, make_user
from .test_reservations import URL, reservation

USERS = "/api/v1/users/"


def test_public_registration_never_creates_admin(db):
    payload = {
        "username": "nuevo", "email": "nuevo@example.com", "first_name": "N", "last_name": "U",
        "type": "student", "course": "Sistemas", "password": "Clave-Muy-Segura-9", "role": "admin", "is_superuser": True,
    }
    response = api().post("/api/v1/auth/register/", payload, format="json")
    assert response.status_code == 201, response.content
    created = User.objects.get(username="nuevo")
    assert created.role == User.Role.USER and not created.is_superuser and not created.is_staff


def test_registration_rejects_case_insensitive_duplicates_and_weak_passwords(student):
    base = {"first_name": "N", "last_name": "U", "type": "student", "course": "Sistemas"}
    dup_user = api().post("/api/v1/auth/register/", {**base, "username": student.username.upper(),
                          "email": "otro@example.com", "password": "Clave-Muy-Segura-9"}, format="json")
    dup_mail = api().post("/api/v1/auth/register/", {**base, "username": "otro",
                          "email": student.email.upper(), "password": "Clave-Muy-Segura-9"}, format="json")
    common = api().post("/api/v1/auth/register/", {**base, "username": "otro2",
                        "email": "o2@example.com", "password": "password123"}, format="json")
    assert dup_user.status_code == dup_mail.status_code == common.status_code == 400


def test_admin_cannot_grant_admin_role(admin, student):
    response = api(admin).patch(f"{USERS}{student.pk}/", {"role": "admin"}, format="json")
    assert response.status_code in (400, 403)
    student.refresh_from_db()
    assert student.role == User.Role.USER


def test_user_cannot_change_own_role_or_status(student):
    client = api(student)
    for field, value in (("role", "admin"), ("is_active", False), ("is_superuser", True)):
        assert client.patch(f"{USERS}{student.pk}/", {field: value}, format="json").status_code == 403
    student.refresh_from_db()
    assert student.role == User.Role.USER and student.is_active


def test_superuser_cannot_delete_self(superuser):
    assert api(superuser).delete(f"{USERS}{superuser.pk}/").status_code == 409
    assert User.objects.filter(pk=superuser.pk).exists()


def test_role_and_status_changes_are_audited_with_old_and_new_values(superuser, student):
    client = api(superuser)
    assert client.patch(f"{USERS}{student.pk}/", {"role": "admin"}, format="json").status_code == 200
    assert client.patch(f"{USERS}{student.pk}/", {"is_active": False}, format="json").status_code == 200
    logs = list(AuditLog.objects.filter(object_id=str(student.pk)).order_by("id"))
    assert logs[0].changes == {"role": {"from": "usuario", "to": "admin"}}
    assert logs[1].changes == {"is_active": {"from": "True", "to": "False"}}
    assert logs[0].actor_id == superuser.pk and logs[0].created_at


def test_password_reset_and_user_deletion_are_audited(superuser, student):
    client = api(superuser)
    assert client.post(f"{USERS}{student.pk}/set_password/", {"new_password": "Otra-Clave-Larga-77"}, format="json").status_code == 204
    pwd = AuditLog.objects.get(changes={"password": "changed"})
    assert "Otra-Clave" not in str(pwd.changes) and pwd.object_id == str(student.pk)
    pk = student.pk
    assert client.delete(f"{USERS}{pk}/").status_code == 204
    assert AuditLog.objects.filter(action="delete", object_id=str(pk)).exists()


def test_staff_lists_only_active_plain_users(staff, student, admin):
    make_user("inactivo", is_active=False)
    response = api(staff).get(USERS)
    assert response.status_code == 200
    rows = response.data["results"] if isinstance(response.data, dict) else response.data
    assert rows and all(r["role"] == "usuario" and r["is_active"] for r in rows)
    assert admin.username not in {r["username"] for r in rows}


def test_hidden_operations_are_denied_by_the_api(student, teacher):
    client = api(student)
    assert client.get(USERS).status_code == 403
    assert client.post("/api/v1/spaces/", {"name": "X", "category": "other", "capacity": 5, "location": "A"}, format="json").status_code == 403
    assert client.post("/api/v1/departments/", {"name": "D"}, format="json").status_code == 403
    res = reservation(make_user("otro1"), make_space())
    assert client.post(f"{URL}{res.pk}/approve/").status_code in (403, 404)
    assert api(teacher).post(f"{URL}{res.pk}/approve/").status_code in (403, 404)  # no es responsable


def test_health_does_not_leak_error_details(db):
    from unittest.mock import patch

    boom = RuntimeError("host=secret-db password=hunter2")
    with patch("django.db.backends.base.base.BaseDatabaseWrapper.ensure_connection", side_effect=boom):
        response = api().get("/api/v1/health/")
    assert response.status_code == 503
    assert "hunter2" not in str(response.data) and response.data["checks"]["database"] == "error"
