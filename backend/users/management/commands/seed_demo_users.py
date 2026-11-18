from pathlib import Path

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError

from users.models import User


DEMO_USERS = {
    "ingeniero.demo": {
        "email": "ingeniero.demo@reservatrack.test",
        "first_name": "Ingeniero",
        "last_name": "Demo",
        "role": User.Role.ADMIN,
        "type": User.Type.PERSONAL_ADMINISTRATOR,
        "is_staff": True,
        "is_superuser": True,
    },
    "admin.demo": {
        "email": "admin.demo@reservatrack.test",
        "first_name": "Carlos",
        "last_name": "Martínez",
        "role": User.Role.ADMIN,
        "type": User.Type.PERSONAL_ADMINISTRATOR,
        "is_staff": False,
        "is_superuser": False,
    },
    "estudiante.demo": {
        "email": "estudiante.demo@reservatrack.test",
        "first_name": "Estudiante",
        "last_name": "Demo",
        "role": User.Role.USER,
        "type": User.Type.STUDENT,
        "course": "Ingeniería de Sistemas",
        "is_staff": False,
        "is_superuser": False,
    },
    "docente.demo": {
        "email": "docente.demo@reservatrack.test",
        "first_name": "Docente",
        "last_name": "Demo",
        "role": User.Role.USER,
        "type": User.Type.TEACHER,
        "area": "Ciencias",
        "is_staff": False,
        "is_superuser": False,
    },
}


def load_credentials() -> dict[str, str]:
    path = Path(settings.BASE_DIR) / "credenciales.txt"
    if not path.is_file():
        raise CommandError(f"No se encontró el archivo de credenciales de demostración: {path}")

    credentials = {}
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        username, separator, password = line.partition(":")
        username = username.strip()
        password = password.strip()
        if not separator or not username or not password or username in credentials:
            raise CommandError(f"Formato inválido o usuario duplicado en credenciales.txt:{line_number}")
        credentials[username] = password

    if credentials.keys() != DEMO_USERS.keys():
        raise CommandError("credenciales.txt debe incluir exactamente las cuatro cuentas demo definidas.")
    return credentials


class Command(BaseCommand):
    help = "Crea o actualiza las cuentas de demostración para el entorno local."

    def handle(self, *args, **options):
        credentials = load_credentials()
        for username, attributes in DEMO_USERS.items():
            password = credentials[username]
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    **attributes,
                    "password": make_password(password),
                },
            )

            changed_fields = []
            if not created:
                for field, value in attributes.items():
                    if getattr(user, field) != value:
                        setattr(user, field, value)
                        changed_fields.append(field)
                user.set_password(password)
                changed_fields.append("password")
                if changed_fields:
                    user.save(update_fields=changed_fields)

            state = "creada" if created else "actualizada"
            self.stdout.write(f"Cuenta demo {state}: {username}")
