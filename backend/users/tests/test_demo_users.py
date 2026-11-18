from io import StringIO

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from users.management.commands.seed_demo_users import DEMO_USERS, load_credentials
from users.models import User


@pytest.mark.django_db
def test_seed_demo_users_creates_expected_roles_and_passwords():
    credentials = load_credentials()
    output = StringIO()

    call_command("seed_demo_users", stdout=output)
    call_command("seed_demo_users", stdout=output)

    assert User.objects.count() == len(DEMO_USERS)
    assert set(User.objects.values_list("username", flat=True)) == set(DEMO_USERS)
    for username, attributes in DEMO_USERS.items():
        user = User.objects.get(username=username)
        assert user.check_password(credentials[username])
        assert user.role == attributes["role"]
        assert user.type == attributes["type"]
        assert user.is_superuser is attributes["is_superuser"]

        response = APIClient().post(
            "/api/v1/auth/token/cookie/",
            {"username": username, "password": credentials[username]},
            format="json",
        )
        assert response.status_code == 200
        assert response.cookies["access_token"].value

    assert output.getvalue().count("Cuenta demo creada:") == len(DEMO_USERS)
    assert output.getvalue().count("Cuenta demo actualizada:") == len(DEMO_USERS)
