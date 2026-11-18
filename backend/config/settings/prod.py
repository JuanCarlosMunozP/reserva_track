"""
Settings de producción.

Endurece la seguridad y desactiva DEBUG. Las variables sensibles deben venir
exclusivamente de variables de entorno.
"""
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False

# Validacion secret
# La longitud mínima (50, recomendación de Django: ver check security.W009)
# importa en la práctica: SIMPLE_JWT usa SECRET_KEY como clave de firma HS256
# por defecto, y PyJWT emite InsecureKeyLengthWarning con claves debajo de 32
# bytes. `SECRET_KEY` viene de `from .base import *` de arriba.
if (  # noqa: F405
    not SECRET_KEY  # noqa: F405
    or SECRET_KEY == "insecure-default-change-me"  # noqa: F405
    or len(SECRET_KEY) < 50  # noqa: F405
):
    raise ImproperlyConfigured

# Seguridad
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
AUTH_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365  # 1 año (requisito para HSTS preload)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Anti-phishing: en producción todo origen/URL pública debe ser HTTPS y no se
# acepta host comodín (permitiría Host-header poisoning en enlaces/redirects).
def _require_https(name, values):
    bad = [v for v in values if not str(v).startswith("https://")]
    if bad:
        raise ImproperlyConfigured(f"{name} debe usar https:// en producción: {bad}")


if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:  # noqa: F405
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS no puede estar vacío ni ser '*' en producción.")
_require_https("CORS_ALLOWED_ORIGINS", CORS_ALLOWED_ORIGINS)  # noqa: F405
_require_https("FRONTEND_BASE_URL", [FRONTEND_BASE_URL])  # noqa: F405
_require_https("CSRF_TRUSTED_ORIGINS", CSRF_TRUSTED_ORIGINS)  # noqa: F405

CONTENT_SECURITY_POLICY = {
    "DIRECTIVES": {
        **CONTENT_SECURITY_POLICY["DIRECTIVES"],  # noqa: F405
        "upgrade-insecure-requests": True,
    }
}
