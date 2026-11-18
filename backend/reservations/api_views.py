import uuid
from datetime import datetime

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from common.permissions import HasRolePermission
from spaces.models import Space
from users.models import User

from .api_serializers import ReservationSerializer
from .models import Reservation, ReservationStatus
from .notifications import notify_created, notify_reviewed


class ReservationViewSet(viewsets.ModelViewSet):
    serializer_class = ReservationSerializer
    permission_classes = (permissions.IsAuthenticated, HasRolePermission)
    permission_resource = "reservations"
    filterset_fields = ("space", "date", "status")
    search_fields = ("code", "reason", "user__first_name", "user__last_name", "space__name")
    ordering_fields = ("date", "start_time", "request_date")

    def get_queryset(self):
        queryset = Reservation.objects.select_related("user", "space", "reviewed_by")
        user = self.request.user
        if not isinstance(user, User):
            return queryset.none()
        if user.is_superuser or user.role == User.Role.ADMIN:
            return queryset
        if user.type == User.Type.TEACHER:
            return queryset.filter(
                Q(user=user)
                | Q(
                    space__responsibilities__user=user,
                    space__responsibilities__is_active=True,
                )
            ).distinct()
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        values = serializer.validated_data
        with transaction.atomic():
            # Serializa solicitudes del mismo espacio para impedir que dos
            # peticiones simultáneas ocupen el mismo intervalo.
            space = Space.objects.select_for_update().get(pk=values["space"].pk)
            if not space.is_active:
                raise ValidationError({"space": "No se pueden reservar espacios inactivos."})
            self._assert_no_conflict(
                space=space, date=values["date"],
                start=values["start_time"], end=values["end_time"],
            )
            reservation = serializer.save(
                user=self.request.user,
                code=f"RT-{timezone.now():%Y}-P{uuid.uuid4().hex[:11]}",
            )
            reservation.code = f"RT-{timezone.now():%Y}-{reservation.pk:04d}"
            reservation.save(update_fields=("code",))
            notify_created(reservation)

    def perform_update(self, serializer):
        values = serializer.validated_data
        instance = serializer.instance
        space_id = values.get("space", instance.space).pk
        with transaction.atomic():
            space = Space.objects.select_for_update().get(pk=space_id)
            if not space.is_active:
                raise ValidationError({"space": "No se pueden reservar espacios inactivos."})
            self._assert_no_conflict(
                space=space,
                date=values.get("date", instance.date),
                start=values.get("start_time", instance.start_time),
                end=values.get("end_time", instance.end_time),
                exclude_id=instance.pk,
            )
            serializer.save()

    @staticmethod
    def _assert_no_conflict(*, space, date, start, end, exclude_id=None):
        conflicts = Reservation.objects.filter(
            space=space,
            date=date,
            status__in=(ReservationStatus.PENDING, ReservationStatus.APPROVED),
        ).filter(Q(start_time__lt=end) & Q(end_time__gt=start))
        if exclude_id is not None:
            conflicts = conflicts.exclude(pk=exclude_id)
        if conflicts.exists():
            raise ValidationError("El espacio ya tiene una reserva en ese horario.")

    @action(detail=True, methods=("post",), permission_classes=(permissions.IsAuthenticated, HasRolePermission))
    def approve(self, request, pk=None):
        return self._review(request, self.get_object(), ReservationStatus.APPROVED)

    @action(detail=True, methods=("post",), permission_classes=(permissions.IsAuthenticated, HasRolePermission))
    def reject(self, request, pk=None):
        return self._review(request, self.get_object(), ReservationStatus.REJECTED)

    @action(detail=True, methods=("post",), permission_classes=(permissions.IsAuthenticated,))
    def cancel(self, request, pk=None):
        """FR-035: cancela el solicitante o un administrador, antes de que inicie."""
        reservation = self.get_object()
        user = request.user
        if not (user.is_superuser or user.role == User.Role.ADMIN or reservation.user_id == user.pk):
            return Response({"detail": "Solo el solicitante o un administrador puede cancelar."}, status=status.HTTP_403_FORBIDDEN)
        with transaction.atomic():
            reservation = Reservation.objects.select_for_update().get(pk=reservation.pk)
            if reservation.status not in (ReservationStatus.PENDING, ReservationStatus.APPROVED):
                return Response({"detail": "Solo se cancelan solicitudes pendientes o aprobadas."}, status=status.HTTP_409_CONFLICT)
            start = timezone.make_aware(datetime.combine(reservation.date, reservation.start_time))
            if start <= timezone.now():
                return Response({"detail": "No se puede cancelar una reserva que ya inició."}, status=status.HTTP_409_CONFLICT)
            reservation.status = ReservationStatus.CANCELED
            reservation.save(update_fields=("status", "updated_at"))
        return Response(self.get_serializer(reservation).data)

    def _review(self, request, reservation, decision):
        with transaction.atomic():
            reservation = Reservation.objects.select_for_update().get(pk=reservation.pk)
            if reservation.status != ReservationStatus.PENDING:
                return Response({"detail": "Solo se pueden revisar solicitudes pendientes."}, status=status.HTTP_409_CONFLICT)
            reservation.status = decision
            reservation.reviewed_by = request.user
            reservation.response_date = timezone.now()
            reservation.save(update_fields=("status", "reviewed_by", "response_date", "updated_at"))
            notify_reviewed(reservation)
        return Response(self.get_serializer(reservation).data)
