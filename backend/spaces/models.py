from django.db import models

from django.utils.translation import gettext_lazy as _
from users.models import User

class SpaceCategory(models.TextChoices):
    LABORATORY = "laboratory", _("Laboratorio")
    CLASSROOM = "classroom", _("Aula")
    GYM = "gym", _("Deportivo")
    STUDY_ROOM = "study_room", _("Sala")
    AUDITORY = "auditory", _("Auditorio")
    OTHER = "other", _("Otro")

class Space(models.Model):
    name = models.CharField(_("name"),max_length=100,)
    description = models.CharField(_("description"), max_length=500, blank=True)
    category = models.CharField(
        _("category"),
        max_length=200,
        choices=SpaceCategory.choices,
        default=SpaceCategory.OTHER,
    )
    capacity = models.PositiveIntegerField(("Capacidad"))
    # Referencia normalizada al catálogo de ubicaciones (sede/área/detalle).
    place = models.ForeignKey(
        "branches.Location",
        on_delete=models.PROTECT,
        related_name="spaces",
        null=True,
        blank=True,
    )
    # Texto libre de compatibilidad con el frontend actual; si hay `place` y
    # viene vacío, el serializer lo rellena con la ubicación normalizada.
    location = models.CharField(_("Location"), max_length=200, blank=True)
    is_active = models.BooleanField(_("Active"),default=True,)
    created_at = models.DateTimeField(_("Created"),auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated"),auto_now=True)

    class Meta:
        verbose_name = _("Space")
        verbose_name_plural = _("Spaces")
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"],name="space_name_idx"),
            models.Index(fields=["is_active"],name="space_is_active_idx"),
            models.Index(fields=["category"],name="space_category_idx"),
        ]

    def __str__(self) -> str:
        return self.name



class SpaceResponsibility(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="space_responsibilities")
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name="responsibilities")
    assignment_date = models.DateTimeField(_("Assignment date"), auto_now_add=True)
    is_active = models.BooleanField(_("is_active"), default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("user", "space"), name="unique_space_responsible"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} → {self.space_id}"
