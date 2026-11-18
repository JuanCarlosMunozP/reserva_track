from django.conf import settings
from django.db.models import Q
from rest_framework import serializers
from common.security import SanitizedSerializerMixin

from .models import Reservation, ReservationStatus


class ReservationSerializer(SanitizedSerializerMixin, serializers.ModelSerializer):
    applicant_name = serializers.CharField(source="user.get_full_name", read_only=True)
    applicant_type = serializers.CharField(source="user.type", read_only=True)
    applicant_course = serializers.CharField(source="user.course", read_only=True)
    applicant_area = serializers.CharField(source="user.area", read_only=True)
    space_name = serializers.CharField(source="space.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Reservation
        fields = (
            "id", "code", "user", "applicant_name", "applicant_type", "applicant_course", "applicant_area", "space", "space_name", "date",
            "start_time", "end_time", "status", "status_label", "request_date",
            "response_date", "reviewed_by", "reason", "subject", "group", "attendees",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "code", "user", "status", "request_date", "response_date", "reviewed_by", "created_at", "updated_at")

        extra_kwargs = {"reason": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        date = attrs.get("date", getattr(self.instance, "date", None))
        space = attrs.get("space", getattr(self.instance, "space", None))
        if space and not space.is_active:
            raise serializers.ValidationError({"space": "No se pueden reservar espacios inactivos."})
        subject = attrs.get("subject", getattr(self.instance, "subject", "")).strip()
        group = attrs.get("group", getattr(self.instance, "group", "")).strip()
        attendees = attrs.get("attendees", getattr(self.instance, "attendees", None))
        reason = attrs.get("reason", getattr(self.instance, "reason", "")).strip()
        if space and space.category in ("laboratory", "auditory"):
            if not subject:
                raise serializers.ValidationError({"subject": "Indica la asignatura para esta reserva."})
            if not group:
                raise serializers.ValidationError({"group": "Indica el grupo académico para esta reserva."})
        if space and space.category == "auditory":
            if attendees is None or attendees < 1:
                raise serializers.ValidationError({"attendees": "Indica cuántas personas asistirán."})
            if attendees > space.capacity:
                raise serializers.ValidationError({"attendees": f"El auditorio tiene capacidad para {space.capacity} personas."})
        if space and space.category not in ("laboratory", "auditory") and not reason:
            raise serializers.ValidationError({"reason": "Indica el motivo de la reserva."})
        if space and space.category in ("laboratory", "auditory") and not reason:
            reason = f"{subject} · {group}"
            if space.category == "auditory":
                reason = f"{reason} · {attendees} asistentes"
            attrs["reason"] = reason[:250]
        if start and end and end <= start:
            raise serializers.ValidationError({"end_time": "La hora final debe ser posterior a la inicial."})
        if start and end and (start < settings.RESERVATION_OPEN_TIME or end > settings.RESERVATION_CLOSE_TIME):
            raise serializers.ValidationError({
                "start_time": f"Las reservas solo se permiten entre {settings.RESERVATION_OPEN_TIME:%H:%M} y {settings.RESERVATION_CLOSE_TIME:%H:%M}."
            })
        if space and date and start and end:
            conflicts = Reservation.objects.filter(
                space=space,
                date=date,
                status__in=(ReservationStatus.PENDING, ReservationStatus.APPROVED),
            ).filter(Q(start_time__lt=end) & Q(end_time__gt=start))
            if self.instance:
                conflicts = conflicts.exclude(pk=self.instance.pk)
            if conflicts.exists():
                raise serializers.ValidationError("El espacio ya tiene una reserva en ese horario.")
        return attrs
