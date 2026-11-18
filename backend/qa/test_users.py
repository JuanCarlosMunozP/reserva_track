"""API de usuarios, registro público, serializers, manager, modelo, admin y seed."""
import pytest
from django.contrib.admin.sites import site as admin_site
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from audit.models import AuditLog
from users.management.commands import seed_demo_users as seed
from users.models import MFADevice, User

from .conftest import PASSWORD, api, make_user

Role, Type = User.Role, User.Type
URL = "/api/v1/users/"


def payload(**extra):
    return {
        "username": "nuevo", "email": "Nuevo@Example.com", "first_name": "  Nuevo  ", "last_name": "Usuario",
        "role": "usuario", "type": "student", "password": PASSWORD, **extra,
    }


# ---------------------------------------------------------------- manager
def _custom_manager():
    """`User.objects` NO usa users.managers.UserManager (ver test siguiente),
    así que se enlaza a mano para probar su lógica."""
    from users.managers import UserManager

    manager = UserManager()
    manager.model = User
    manager._db = None
    return manager


def test_custom_manager_is_wired_to_user_model():
    """Corregido: User declara `objects = UserManager()` (valores por defecto de rol/tipo,
    normalización de email y helpers de queryset)."""
    from users.managers import UserManager

    assert isinstance(User._default_manager, UserManager)
    assert hasattr(User.objects, "active")


def test_superuser_gets_admin_role_by_default(db):
    root = User.objects.create_superuser("root2", "root2@y.co", PASSWORD)
    assert root.role == "admin"


def test_manager_helpers_and_validation(db):
    manager = _custom_manager()
    admin = make_user("a1", role=Role.ADMIN)
    active = make_user("u1")
    inactive = make_user("u2", is_active=False)
    assert set(manager.active()) >= {admin, active}
    assert inactive in manager.inactive() and active not in manager.inactive()
    assert list(manager.by_role(Role.ADMIN)) == [admin]
    assert list(manager.staff_roles()) == [admin]
    assert manager.get_queryset().active().filter(pk=active.pk).exists()

    with pytest.raises(ValueError, match="usuario"):
        manager.create_user("", "x@y.co", PASSWORD)
    with pytest.raises(ValueError, match="correo"):
        manager.create_user("sinmail", "", PASSWORD)
    with pytest.raises(ValueError, match="is_staff"):
        manager.create_superuser("r", "r@y.co", PASSWORD, is_staff=False)
    with pytest.raises(ValueError, match="is_superuser"):
        manager.create_superuser("r", "r@y.co", PASSWORD, is_superuser=False)

    created = manager.create_user("MixedCase", "MiXed@Example.COM", PASSWORD, first_name="M", last_name="C")
    assert created.email == "mixed@example.com"
    assert (created.role, created.type, created.is_staff) == ("usuario", "student", False)
    root = manager.create_superuser("root", "root@y.co", PASSWORD, first_name="R", last_name="T")
    assert (root.role, root.type, root.is_staff, root.is_superuser) == ("admin", "personal_administrator", True, True)


def test_user_model_helpers(db):
    admin = make_user("a1", role=Role.ADMIN)
    student = make_user("u1")
    assert admin.is_admin_role and not student.is_admin_role
    assert str(admin) == "a1 (Administrator)"
    assert student.mfa_enabled is False
    device = MFADevice.objects.create(user=student, secret_encrypted="x")
    assert str(device) == f"MFA pendiente de {student.pk}"
    student = User.objects.get(pk=student.pk)
    assert student.mfa_enabled is False
    device.confirmed = True
    device.save()
    assert str(device).startswith("MFA activo")
    assert User.objects.get(pk=student.pk).mfa_enabled is True


def test_user_admin_is_registered():
    assert User in admin_site._registry
    assert "role" in admin_site._registry[User].list_display


# ------------------------------------------------------------ listado / me
def test_me_returns_own_profile(student):
    response = api(student).get(URL + "me/")
    assert response.status_code == 200
    assert response.data["username"] == "est1"
    assert response.data["type_display"] == "Estudiante"


def test_list_visibility_by_role(admin, staff, student, teacher, superuser):
    make_user("otro_admin", role=Role.ADMIN)
    inactive = make_user("inactivo", is_active=False)

    all_users = api(admin).get(URL + "?page_size=100").data["results"]
    assert {u["username"] for u in all_users} >= {"admin1", "est1", "doc1", "adm1", "inactivo"}

    root_users = api(superuser).get(URL + "?page_size=100").data["results"]
    assert len(root_users) == User.objects.count()

    # personal administrativo: solo usuarios con rol "usuario" y activos
    visible = {u["username"] for u in api(staff).get(URL + "?page_size=100").data["results"]}
    assert "admin1" not in visible and inactive.username not in visible
    assert {"est1", "doc1", "adm1"} <= visible

    assert api(student).get(URL).status_code == 403
    assert api(teacher).get(URL).status_code == 403
    assert api().get(URL).status_code == 401


def test_list_filters_and_search(admin, student, teacher):
    client = api(admin)
    assert [u["username"] for u in client.get(URL + "?type=teacher").data["results"]] == ["doc1"]
    assert client.get(URL + "?search=est1").data["count"] == 1
    assert client.get(URL + "?ordering=-username").data["results"][0]["username"] == "est1"


# ------------------------------------------------------------ create / delete
def test_create_user_normalizes_and_only_software_engineer_can_create(superuser, admin, student):
    response = api(superuser).post(URL, payload(), format="json")
    assert response.status_code == 201, response.content
    user = User.objects.get(username="nuevo")
    assert (user.email, user.first_name) == ("nuevo@example.com", "Nuevo")
    assert "password" not in response.data

    assert api(admin).post(URL, payload(username="otro", email="o@x.co"), format="json").status_code == 403
    assert api(student).post(URL, payload(username="otro2", email="o2@x.co"), format="json").status_code == 403


def test_create_user_validations(superuser, student):
    client = api(superuser)
    bad = {
        "username": "   ", "first_name": "   ", "last_name": "   ", "password": "corta",
    }
    response = client.post(URL, payload(**bad), format="json")
    assert response.status_code == 400
    assert {"username", "first_name", "last_name", "password"} <= set(response.data)

    dup = client.post(URL, payload(username="EST1", email="distinto@x.co"), format="json")
    assert "username" in dup.data
    dup = client.post(URL, payload(username="otro", email="EST1@example.com"), format="json")
    assert "email" in dup.data
    weak = client.post(URL, payload(username="o3", email="o3@x.co", password="12345678"), format="json")
    assert "password" in weak.data


def test_create_admin_role_requires_software_engineer(superuser):
    response = api(superuser).post(URL, payload(role="admin"), format="json")
    assert response.status_code == 201
    assert User.objects.get(username="nuevo").role == "admin"


def test_create_user_validate_role_without_superuser_context():
    from users.serializers import UserCreateSerializer

    ser = UserCreateSerializer()
    with pytest.raises(Exception) as exc:
        ser.validate_role("admin")
    assert "ingeniero" in str(exc.value)
    assert ser.validate_role("usuario") == "usuario"


def test_create_inactive_user(superuser):
    response = api(superuser).post(URL, payload(is_active=False), format="json")
    assert response.status_code == 201
    assert User.objects.get(username="nuevo").is_active is False


def test_delete_user_logs_audit_and_blocks_self_delete(superuser, student):
    client = api(superuser)
    assert client.delete(f"{URL}{superuser.pk}/").status_code == 409
    response = client.delete(f"{URL}{student.pk}/")
    assert response.status_code == 204
    assert not User.objects.filter(pk=student.pk).exists()
    log = AuditLog.objects.get(action="delete")
    assert log.actor == superuser and log.model_label == "users.user"


def test_delete_requires_software_engineer(admin, student):
    assert api(admin).delete(f"{URL}{student.pk}/").status_code == 403


# ------------------------------------------------------ retrieve / update
def test_retrieve_self_or_admin_only(admin, student, teacher):
    assert api(student).get(f"{URL}{student.pk}/").status_code == 200
    assert api(admin).get(f"{URL}{student.pk}/").status_code == 200
    assert api(teacher).get(f"{URL}{student.pk}/").status_code == 403


def test_user_updates_own_profile_but_not_privileged_fields(student):
    client = api(student)
    ok = client.patch(f"{URL}{student.pk}/", {"first_name": " Nuevo  Nombre "}, format="json")
    assert ok.status_code == 200 and ok.data["first_name"] == "Nuevo Nombre"
    for field, value in (("role", "admin"), ("is_active", False), ("is_staff", True), ("is_superuser", True)):
        assert client.patch(f"{URL}{student.pk}/", {field: value}, format="json").status_code == 403


def test_update_validations(admin, student, teacher):
    client = api(admin)
    response = client.patch(
        f"{URL}{student.pk}/",
        {"username": "   ", "first_name": " ", "last_name": " "}, format="json",
    )
    assert {"username", "first_name", "last_name"} <= set(response.data)
    assert "username" in client.patch(f"{URL}{student.pk}/", {"username": "DOC1"}, format="json").data
    assert "email" in client.patch(f"{URL}{student.pk}/", {"email": "doc1@example.com"}, format="json").data
    ok = client.patch(f"{URL}{student.pk}/", {"username": "est1", "email": "EST1@example.com"}, format="json")
    assert ok.status_code == 200 and ok.data["email"] == "est1@example.com"


def test_only_software_engineer_changes_admin_role(admin, student, superuser):
    forbidden = api(admin).patch(f"{URL}{student.pk}/", {"role": "admin"}, format="json")
    assert forbidden.status_code == 400
    forbidden = api(admin).patch(f"{URL}{admin.pk}/", {"role": "usuario"}, format="json")
    assert forbidden.status_code == 400
    allowed = api(superuser).patch(f"{URL}{student.pk}/", {"role": "admin"}, format="json")
    assert allowed.status_code == 200
    # mismo rol no cuenta como cambio
    other_admin = make_user("admin2", role=Role.ADMIN)
    assert api(admin).patch(f"{URL}{other_admin.pk}/", {"role": "admin"}, format="json").status_code == 200


def test_role_and_active_changes_are_audited(superuser, student):
    api(superuser).patch(f"{URL}{student.pk}/", {"role": "admin", "is_active": False}, format="json")
    log = AuditLog.objects.get(action="update")
    assert log.changes["role"] == {"from": "usuario", "to": "admin"}
    assert log.changes["is_active"] == {"from": "True", "to": "False"}
    count = AuditLog.objects.count()
    api(superuser).patch(f"{URL}{student.pk}/", {"first_name": "Otro"}, format="json")
    assert AuditLog.objects.count() == count  # sin cambios sensibles no se audita


def test_put_full_update(admin, student):
    response = api(admin).put(
        f"{URL}{student.pk}/",
        {"username": "est1", "email": "est1@example.com", "first_name": "A", "last_name": "B", "role": "usuario"},
        format="json",
    )
    assert response.status_code == 200


# ------------------------------------------------------------- set_password
def test_set_password_self_requires_current_password(student):
    client = api(student)
    url = f"{URL}{student.pk}/set_password/"
    assert "current_password" in client.post(url, {"new_password": "Otra-Clave-456"}, format="json").data
    wrong = client.post(url, {"current_password": "mala", "new_password": "Otra-Clave-456"}, format="json")
    assert "current_password" in wrong.data
    weak = client.post(url, {"current_password": PASSWORD, "new_password": "12345678"}, format="json")
    assert "new_password" in weak.data
    ok = client.post(url, {"current_password": PASSWORD, "new_password": "Otra-Clave-456"}, format="json")
    assert ok.status_code == 204
    student.refresh_from_db()
    assert student.check_password("Otra-Clave-456")
    assert AuditLog.objects.filter(changes={"password": "changed"}).exists()


def test_admin_resets_password_without_current_and_revokes_sessions(admin, student):
    refresh = RefreshToken.for_user(student)
    response = api(admin).post(f"{URL}{student.pk}/set_password/", {"new_password": "Otra-Clave-456"}, format="json")
    assert response.status_code == 204
    assert BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists()


def test_password_change_keeps_current_session_cookie(student):
    keep, other = RefreshToken.for_user(student), RefreshToken.for_user(student)
    client = api(student)
    client.cookies["refresh_token"] = str(keep)
    client.post(f"{URL}{student.pk}/set_password/", {"current_password": PASSWORD, "new_password": "Otra-Clave-456"}, format="json")
    assert not BlacklistedToken.objects.filter(token__jti=keep["jti"]).exists()
    assert BlacklistedToken.objects.filter(token__jti=other["jti"]).exists()


def test_password_change_with_invalid_refresh_cookie_revokes_everything(student):
    token = RefreshToken.for_user(student)
    client = api(student)
    client.cookies["refresh_token"] = "no-es-jwt"
    client.post(f"{URL}{student.pk}/set_password/", {"current_password": PASSWORD, "new_password": "Otra-Clave-456"}, format="json")
    assert BlacklistedToken.objects.filter(token__jti=token["jti"]).exists()
    assert OutstandingToken.objects.filter(user=student).count() == BlacklistedToken.objects.filter(token__user=student).count()


def test_set_password_denied_for_other_non_admin(student, teacher):
    response = api(teacher).post(f"{URL}{student.pk}/set_password/", {"new_password": "Otra-Clave-456"}, format="json")
    assert response.status_code == 403


# ------------------------------------------------------------------ reset_mfa
def test_reset_mfa_by_software_engineer_is_audited(superuser, student):
    MFADevice.objects.create(user=student, secret_encrypted="x", confirmed=True)
    response = api(superuser).post(f"{URL}{student.pk}/reset_mfa/")
    assert response.status_code == 204
    assert not MFADevice.objects.filter(user=student).exists()
    assert AuditLog.objects.filter(changes={"mfa": "reset_by_admin"}).exists()


# ------------------------------------------------------------ registro público
REGISTER = "/api/v1/auth/register/"


def reg(**extra):
    base = {
        "username": "publico", "email": " Publico@Example.com ", "first_name": "Pu", "last_name": "Blico",
        "type": "student", "course": "  Ingeniería   de  Sistemas ", "password": PASSWORD,
    }
    base.update(extra)
    return base


def test_public_registration_creates_normal_user(db):
    response = api().post(REGISTER, reg(), format="json")
    assert response.status_code == 201, response.content
    user = User.objects.get(username="publico")
    assert user.role == "usuario" and user.email == "publico@example.com"
    assert user.course == "Ingeniería de Sistemas"
    assert "password" not in response.data


def test_public_registration_cannot_self_assign_admin_role(db):
    api().post(REGISTER, reg(role="admin", is_superuser=True), format="json")
    user = User.objects.get(username="publico")
    assert user.role == "usuario" and not user.is_superuser


def test_public_registration_requirements(db):
    client = api()
    # FR-001: curso y área son opcionales.
    assert client.post(REGISTER, reg(course=""), format="json").status_code == 201
    assert client.post(REGISTER, reg(type="teacher", username="d0", email="d0@x.co", area=""), format="json").status_code == 201
    ok = client.post(REGISTER, reg(type="teacher", username="d", email="d@x.co", area=" Ciencias ", course=""), format="json")
    assert ok.status_code == 201 and User.objects.get(username="d").area == "Ciencias"
    ok = client.post(REGISTER, reg(type="personal_administrator", username="p", email="p@x.co", course=""), format="json")
    assert ok.status_code == 201


def test_public_registration_rejects_duplicates_and_weak_input(db):
    client = api()
    assert client.post(REGISTER, reg(), format="json").status_code == 201
    assert "email" in client.post(REGISTER, reg(username="otro", email="PUBLICO@example.com"), format="json").data
    assert client.post(REGISTER, reg(username="o2", email="o2@x.co", password="corta"), format="json").status_code == 400
    assert client.post(REGISTER, reg(username="o3", email="o3@x.co", first_name="<b>x</b>"), format="json").status_code == 400


def test_public_registration_is_throttled(db):
    codes = [
        api().post(REGISTER, reg(username=f"u{i}", email=f"u{i}@x.co", course="C"), format="json").status_code
        for i in range(12)
    ]
    assert codes.count(201) == 10 and 429 in codes


# ------------------------------------------------------------ MFA login serializer
def test_login_without_mfa_returns_tokens(student):
    response = api().post("/api/v1/auth/token/", {"username": "est1", "password": PASSWORD}, format="json")
    assert "access" in response.data and "mfa_required" not in response.data


# ------------------------------------------------------------ seed_demo_users
def test_seed_command_errors_and_updates(tmp_path, settings, db):
    settings.BASE_DIR = tmp_path
    with pytest.raises(CommandError, match="No se encontró"):
        seed.load_credentials()

    creds = tmp_path / "credenciales.txt"
    names = list(seed.DEMO_USERS)
    good = "\n".join(f"{name}:pass-{name}" for name in names)
    creds.write_text("# comentario\n\n" + good, encoding="utf-8")
    assert seed.load_credentials()["admin.demo"] == "pass-admin.demo"

    for bad in ("linea sin separador", "ingeniero.demo:", "ingeniero.demo:x\ningeniero.demo:y"):
        creds.write_text(bad, encoding="utf-8")
        with pytest.raises(CommandError, match="Formato inválido"):
            seed.load_credentials()

    creds.write_text("ingeniero.demo:x", encoding="utf-8")
    with pytest.raises(CommandError, match="exactamente"):
        seed.load_credentials()

    creds.write_text(good, encoding="utf-8")
    call_command("seed_demo_users")
    docente = User.objects.get(username="docente.demo")
    User.objects.filter(pk=docente.pk).update(area="Otra", role=Role.ADMIN)
    call_command("seed_demo_users")
    docente.refresh_from_db()
    assert docente.area == "Ciencias" and docente.role == Role.USER
    assert docente.check_password("pass-docente.demo")


def test_public_registration_rejects_blank_username(db):
    from rest_framework import serializers as drf
    from users.serializers import PublicRegistrationSerializer

    assert api().post(REGISTER, reg(username="   ", email="blank@x.co"), format="json").status_code == 400
    with pytest.raises(drf.ValidationError):
        PublicRegistrationSerializer().validate_username("   ")
