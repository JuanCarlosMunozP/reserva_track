# Contract: Notificaciones en tiempo real

**Endpoint**: `ws(s)://<host>/ws/notifications/` (Nginx hace proxy; Daphne sirve ASGI).

## Conexión

- Autenticación por la misma sesión (cookie) que la API. Sin sesión válida la conexión se rechaza y el cliente **no** reintenta indefinidamente (FR-047).
- Cada usuario se une a su grupo personal; no se unen grupos por petición del cliente.
- Todo mensaje enviado por el cliente se ignora.

## Eventos servidor → cliente

| Evento | Cuándo | Destinatarios |
|---|---|---|
| `reservation.created` | tras confirmarse la creación | administradores y responsables activos del espacio; **no** el solicitante |
| `reservation.reviewed` | tras aprobar o rechazar | solo el solicitante |

Carga mínima: `code`, `space` (nombre), `date`, `start_time`, `end_time`, `status` (FR-046).

## Garantías

- Se emite con `transaction.on_commit`; una operación revertida no genera aviso.
- Un fallo del canal o de Redis se registra y no afecta la respuesta de la API (FR-047).
- Objetivo: 95 % de entregas a destinatarios conectados en < 5 s (SC-003).

## Cliente

`frontend/src/lib/websocket.ts` reconecta con espera exponencial acotada y se detiene si la sesión no es válida; `NotificationContext` presenta los avisos sin recargar la página.
