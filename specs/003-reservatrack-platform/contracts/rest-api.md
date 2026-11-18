# Contract: REST API `/api/v1/`

Fuente de verdad viva: OpenAPI en `/api/schema/` (Swagger `/api/docs/`, ReDoc `/api/redoc/`). Este documento fija el contrato de comportamiento. Errores: 400 validación, **incluido el cruce de horario** ("El espacio ya tiene una reserva en ese horario.") · 401 sin sesión · 403 sin permiso · 404 inexistente/sin acceso · 409 conflicto (ya revisada, dependencias del catálogo, autoeliminación) · 429 límite de frecuencia.

## Autenticación

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `POST auth/register/` | público, throttle `register` | Crea usuario con rol `user` (FR-001/002) |
| `POST auth/token/cookie/` | público, throttle `login` | Contraseña → cookies de sesión, o paso MFA pendiente |
| `POST auth/token/cookie/refresh/` | cookie de refresh | Renueva la sesión (FR-007) |
| `POST auth/token/cookie/logout/` | sesión | Cierra e invalida el refresh (FR-005) |
| `POST auth/token/`, `refresh/`, `verify/`, `blacklist/` | público | Variante por cuerpo para clientes sin navegador |

## MFA (`auth/mfa/`)

| Ruta | Descripción |
|---|---|
| `GET status/` | MFA activo y códigos de recuperación restantes (FR-009) |
| `POST setup/` | Devuelve QR (SVG) y clave manual (FR-010) |
| `POST confirm/` | Código válido → activa y devuelve códigos de recuperación una sola vez |
| `POST verify/`, `verify/cookie/` | Segundo paso del acceso: código de app o de recuperación (FR-011) |
| `POST recovery-codes/` | Regenerar; exige código vigente de la app, no de recuperación (FR-015) |
| `POST disable/` | Exige contraseña y código vigente (FR-015) |

## Recursos (router)

| Recurso | Lectura | Escritura |
|---|---|---|
| `spaces/` | público; búsqueda (nombre, descripción, ubicación), filtros `category`, `is_active` | crear/eliminar: admin; editar: admin o personal administrativo responsable activo (FR-031) |
| *(sin endpoint propio)* disponibilidad | la SPA la calcula con `GET reservations/?date=` y `GET spaces/`; las franjas visibles dependen del alcance del usuario (FR-034), por lo que es parcial y el conflicto real se valida al solicitar. Un visitante sin sesión ve espacios pero no franjas | — |
| `responsibilities/` | admin y personal administrativo | asignar (`POST`) y activar/desactivar (`PATCH is_active`); personal administrativo solo en sus espacios; `DELETE` solo admin (FR-033) |
| `reservations/` | según alcance; filtros `space`, `date`, `status`; búsqueda por código, motivo, solicitante, espacio (FR-035) | `POST` solicitar; `PATCH/PUT` modificar (revalida): el solicitante solo mientras esté `pending`; el administrador siempre; los demás 403/404 |
| `reservations/{id}/approve/`, `reject/` | — | admin o docente responsable activo; ya revisada → 409 (FR-042/044) |
| `users/` | admin y superusuario (personal administrativo: solo activos de rol `user`, FR-020) | crear/eliminar/rol/restablecer MFA: solo superusuario (FR-019); editar/activar/restablecer contraseña: admin y superusuario |
| `departments/ cities/ branches/ areas/ locations/` | público; `cities?department=`, `locations?branch=&area=` | solo admin/superusuario; eliminar con dependencias → 409 |

Cuerpo de solicitud de reserva: `space, date, start_time, end_time` y por categoría `reason` · `subject, group` · `subject, group, attendees`. `code`, `user`, `status` no se aceptan del cliente (FR-038).

## Sistema

| Ruta | Descripción |
|---|---|
| `GET health/` | Estado de componentes esenciales (FR-050) |
| `GET /api/schema/`, `/api/docs/`, `/api/redoc/` | Documentación de la API |

## Módulo embebido (Timonel)

Ruta de la SPA que renderiza únicamente el formulario de solicitud, con espacios limitados a categorías aula, laboratorio y auditorio **activos**; sin acciones de revisión (FR-041). Requiere sesión previa en ReservaTrack; sin SSO.
