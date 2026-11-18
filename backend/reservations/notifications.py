"""Avisos en tiempo real del ciclo de vida de una reserva.

Los eventos viajan solo a las personas implicadas (grupo privado por usuario),
no al grupo global. Se publican al confirmarse la transacción.
"""
from django.db import transaction
from django.db.models import Q

from realtime.events import broadcast_to_users
from spaces.models import SpaceResponsibility
from users.models import User


def _payload(event_type: str, reservation) -> dict:
    return {
        "type": event_type,
        "reservation_id": reservation.pk,
        "code": reservation.code,
        "space_name": reservation.space.name,
        "date": reservation.date.isoformat(),
        "start_time": reservation.start_time.strftime("%H:%M"),
        "end_time": reservation.end_time.strftime("%H:%M"),
        "status": reservation.status,
    }


def notify_created(reservation) -> None:
    """Avisa a administradores y responsables activos del espacio."""
    admins = User.objects.filter(is_active=True).filter(
        Q(is_superuser=True) | Q(role=User.Role.ADMIN)
    ).values_list("pk", flat=True)
    responsibles = SpaceResponsibility.objects.filter(
        space=reservation.space_id, is_active=True, user__is_active=True
    ).values_list("user_id", flat=True)
    recipients = (set(admins) | set(responsibles)) - {reservation.user_id}
    payload = _payload("reservation_created", reservation)
    transaction.on_commit(lambda: broadcast_to_users(recipients, payload))


def notify_reviewed(reservation) -> None:
    """Avisa al solicitante del resultado de la revisión."""
    payload = _payload("reservation_reviewed", reservation)
    transaction.on_commit(
        lambda: broadcast_to_users({reservation.user_id}, payload)
    )
