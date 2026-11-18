"""Helpers para publicar eventos hacia el canal `/ws/notifications/`.

Se llaman desde tareas Celery / señales del backend. Si el channel layer no
está configurado (p. ej. un comando de management puntual) la publicación es
un no-op silencioso — nunca debe tumbar la lógica de negocio.
"""
from __future__ import annotations

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .consumers import NOTIFICATIONS_GROUP

logger = logging.getLogger(__name__)


def user_group(user_id: int) -> str:
    """Grupo privado de un usuario: solo sus conexiones lo reciben."""
    return f"user.{user_id}"


def broadcast_to_users(user_ids, payload: dict[str, Any]) -> None:
    """Envía `payload` solo a las conexiones de los usuarios indicados."""
    layer = get_channel_layer()
    if layer is None:
        return
    for user_id in set(user_ids):
        try:
            async_to_sync(layer.group_send)(
                user_group(user_id),
                {"type": "notification.message", "payload": payload},
            )
        except Exception:
            logger.exception("No se pudo publicar la notificación al usuario %s.", user_id)


def broadcast_notification(payload: dict[str, Any]) -> None:
    """Envía `payload` (ya serializable a JSON) a todos los clientes conectados."""
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(
            NOTIFICATIONS_GROUP,
            {"type": "notification.message", "payload": payload},
        )
    except Exception:
        logger.exception(
            "No se pudo publicar la notificación (channel layer/Redis). "
            "La operación de negocio continúa."
        )
