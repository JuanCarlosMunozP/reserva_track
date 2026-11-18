from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

class ReservationStatus(models.TextChoices):
    PENDING = "pending", _("Pendiente")
    APPROVED = "approved", _("Aprobada")
    REJECTED = "rejected", _("Rechazada")
    CANCELED = "canceled", _("Cancelada")

class Reservation(models.Model):
    code = models.CharField(_("Code"), max_length=20, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reservations")
    space = models.ForeignKey("spaces.Space", on_delete=models.CASCADE, related_name="reservations")
    date = models.DateField(_("Date"))
    start_time = models.TimeField(_("Start Time"))
    end_time = models.TimeField(_("End Time"))
    subject = models.CharField(_("Subject"), max_length=160, blank=True)
    group = models.CharField(_("Group"), max_length=100, blank=True)
    attendees = models.PositiveIntegerField(_("Attendees"), null=True, blank=True)
    status = models.CharField(_("Status"), choices=ReservationStatus.choices, max_length=12, default=ReservationStatus.PENDING)
    request_date = models.DateTimeField(_("Request Date"), default=timezone.now)
    response_date = models.DateTimeField(_("Response Date"), blank=True, null=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="reviewed_reservations", blank=True, null=True)
    reason = models.CharField(_("Reason"), max_length=250)
    created_at = models.DateTimeField(_("Created"),auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated"),auto_now=True)

    class Meta:
            verbose_name = _("Reservation")
            verbose_name_plural = _("Reservations")
            ordering = ["-date", "start_time"]
            indexes = [
                models.Index(fields=["code"], name="reserva_code_idx"),
                models.Index(fields=["space", "date", "status"], name="reserva_space_date_idx"),
            ]

    def clean(self):
        if self.start_time >= self.end_time:
            raise ValidationError({"end_time": _("La hora final debe ser posterior a la inicial.")})
    
    def __str__(self) -> str:
        return self.code
    
    
