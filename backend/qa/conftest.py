"""Fixtures compartidas de la batería QA del backend."""
import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from spaces.models import Space, SpaceResponsibility
from users.models import User

PASSWORD = "Clave-Segura-123"


@pytest.fixture(autouse=True)
def _qa_env(settings):
    # Hash rápido: el PBKDF2 por defecto domina el tiempo de las pruebas.
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    # Los throttles (login, anon, user, mfa) viven en la caché local.
    cache.clear()
    yield
    cache.clear()


def make_user(username="user1", *, role=User.Role.USER, type=User.Type.STUDENT, **extra):
    extra.setdefault("first_name", username.capitalize())
    extra.setdefault("last_name", "Prueba")
    extra.setdefault("email", f"{username}@example.com")
    return User.objects.create_user(
        username=username, password=PASSWORD, role=role, type=type, **extra
    )


def api(user=None, **kwargs):
    client = APIClient(**kwargs)
    client.raise_request_exception = False
    if user is not None:
        client.force_authenticate(user)
    return client


def make_space(name="Aula 1", category="classroom", capacity=30, **extra):
    extra.setdefault("location", "Bloque A")
    return Space.objects.create(name=name, category=category, capacity=capacity, **extra)


def assign(user, space, is_active=True):
    return SpaceResponsibility.objects.create(user=user, space=space, is_active=is_active)


@pytest.fixture
def superuser(db):
    return User.objects.create_superuser(
        username="root", email="root@example.com", password=PASSWORD,
        first_name="Root", last_name="Ing",
    )


@pytest.fixture
def admin(db):
    return make_user("admin1", role=User.Role.ADMIN, type=User.Type.PERSONAL_ADMINISTRATOR)


@pytest.fixture
def student(db):
    return make_user("est1", type=User.Type.STUDENT, course="Sistemas")


@pytest.fixture
def teacher(db):
    return make_user("doc1", type=User.Type.TEACHER, area="Ciencias")


@pytest.fixture
def staff(db):
    """Personal administrativo (rol usuario)."""
    return make_user("adm1", type=User.Type.PERSONAL_ADMINISTRATOR, area="Administrativa")
