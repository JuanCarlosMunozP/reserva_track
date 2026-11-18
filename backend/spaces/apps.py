from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class SpacesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'spaces'
    verbose_name = _("Spaces")
