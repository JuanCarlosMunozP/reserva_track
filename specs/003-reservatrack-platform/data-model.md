# Data Model: Plataforma ReservaTrack

Los nombres de campo y valores de enumeración corresponden a los modelos Django existentes (verificados contra el código el 2026-11-15).

## User (`users.User`, extiende `AbstractUser`)

| Campo | Notas |
|---|---|
| username, email | únicos sin distinguir mayúsculas (FR-003) |
| first_name, last_name | obligatorios en el registro |
| role | `admin` · `usuario`; el superusuario es la marca `is_superuser` (FR-017). El registro público fija siempre `usuario` (FR-002) |
| type | `student` · `teacher` · `personal_administrator`; obligatorio al crear, inmutable (FR-023) |
| course, area | opcionales (FR-001) |
| is_active | desactivar bloquea el acceso |

Reglas: un usuario no cambia su propio rol, estado ni privilegios (FR-021); un superusuario no se elimina a sí mismo (FR-022). Eliminar borra sus reservas y responsabilidades (FR-024).

## MFADevice (`users.MFADevice`) — 1:1 con User

Secreto TOTP cifrado (Fernet), `confirmed`, último paso TOTP aceptado, contador de fallos, `locked_until`. Estados: sin configurar → pendiente de confirmar → activo → desactivado.

## MFARecoveryCode (`users.MFARecoveryCode`) — N:1 con MFADevice

FK al `MFADevice`, HMAC-SHA256 del código (8 códigos de 10 caracteres), `used_at`. Unicidad `(device, code_hash)`. Regenerar invalida todos los anteriores (FR-015); cada código se consume una vez (FR-012).

## Catálogo (`branches`)

```text
Department 1──* City            unique(department, name)
Branch (sede)  1──* Location    unique(branch, area, detail)
Area           1──* Location
```

- `Department.name`, `Branch.name`, `Area.name` únicos (FR-026).
- Eliminar con dependientes → conflicto 409 (FR-027) (`PROTECT` / comprobación previa).

## Space (`spaces.Space`)

| Campo | Notas |
|---|---|
| name, description | buscables (FR-029) |
| category | `laboratory` · `classroom` · `gym` (deportivo) · `study_room` (sala) · `auditory` (auditorio) · `other` |
| capacity | entero ≥ 1 |
| location (texto, máx. 200), place (FK Location, opcional, PROTECT) | al menos uno; si falta el texto se completa con `str(place)` (US5-2) |
| is_active | inactivo no admite nuevas reservas, conserva las existentes (FR-032) |

## SpaceResponsibility (`spaces.SpaceResponsibility`)

`user` + `space`, `is_active`; `unique_space_responsible(user, space)`. Solo usuarios activos de rol `user` (FR-033).

## Reservation (`reservations.Reservation`)

| Campo | Notas |
|---|---|
| code | único, legible, con año (formato `RT-<año>-<id con 4 dígitos>`, p. ej. `RT-2026-0001`), asignado por el sistema (FR-038) |
| user | solicitante, asignado por el sistema |
| space, date, start_time, end_time | `start_time < end_time` (FR-037) |
| subject, group, attendees | según categoría: aula: motivo · laboratorio: asignatura+grupo · auditorio: asignatura+grupo+asistentes ≤ capacidad |
| reason | obligatorio; en laboratorio/auditorio se completa con asignatura/grupo si falta (US1-7) |
| status | `pending` · `approved` · `rejected` · `canceled` (FR-040) |
| request_date, response_date, reviewed_by | revisión registra revisor y fecha (FR-043) |

Índices: `(code)`, `(space, date, status)`.

### Transiciones de estado

```text
pending ──approve──▶ approved
pending ──reject───▶ rejected
(canceled: existe como estado; la acción de cancelar está fuera de alcance)
approved / rejected / canceled ──revisar──▶ 409 (sin cambios)
Edición por el solicitante: solo en `pending` (el administrador puede editar en cualquier estado).
```

Bloquean horario: `pending`, `approved`. No bloquean: `rejected`, `canceled`.

## AuditLog (`audit.AuditLog`)

actor (nulo permitido), action (create/update/delete), model_label, object_id, object_repr, changes (JSON: `{campo: {from, to}}` para rol y estado; `{"password": "changed"}` y `{"mfa": ...}` para contraseña y MFA), ip_address, created_at. Las contraseñas nunca se registran (ni su hash): se audita el hecho del cambio, no el valor. Obligatorio para eventos MFA, rol, estado, contraseña y eliminación de usuarios (FR-048).

## Aviso (no persistente)

Mensaje efímero por WebSocket, sin tabla. Carga: código, espacio, fecha, horario, estado, destinatarios (grupos por usuario). Ver [contracts/realtime.md](contracts/realtime.md).

## Relaciones

```text
User 1──* Reservation *──1 Space
User 1──* SpaceResponsibility *──1 Space
User 1──0..1 MFADevice ; User 1──* MFARecoveryCode
Space *──0..1 Location *──1 Branch, *──1 Area ; Branch *──1 City *──1 Department
Reservation *──0..1 User (reviewed_by)
```
