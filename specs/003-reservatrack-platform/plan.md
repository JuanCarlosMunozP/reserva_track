# Implementation Plan: Plataforma ReservaTrack de reserva de espacios

**Branch**: `003-reservatrack-platform` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-reservatrack-platform/spec.md`

## Summary

Plataforma web para consultar espacios institucionales, solicitar su uso sin cruces de horario, revisar solicitudes con avisos en tiempo real, y administrar usuarios, catálogos, responsables, MFA y auditoría. El código ya existe en `backend/` y `frontend/` (ver `SPEC.md` y `SSD.md`). Este plan fija el diseño objetivo y lo contrasta con lo implementado: API REST versionada (Django REST Framework) con JWT en cookies httpOnly, TOTP con códigos de recuperación, exclusión de cruces mediante bloqueo de fila del espacio dentro de una transacción, y notificaciones por WebSocket (Channels + Redis) emitidas tras confirmar la transacción. La SPA React consume la API.

## Technical Context

**Language/Version**: Python 3.12 (backend, contenedor `python:3.12`) · TypeScript ~7.0 (frontend)

**Primary Dependencies**: Django 5.2, DRF 3.18, simplejwt 5.5, django-axes 8.3, django-filter, drf-spectacular, django-csp, pyotp + qrcode + cryptography (Fernet), Celery 5.6, Channels 4.2 + channels-redis, Daphne/Gunicorn · React 19, Vite 8, react-router 7, axios, Tailwind 4, Recharts

**Storage**: PostgreSQL (psycopg 3); Redis (capa de canales y broker/resultados de Celery)

**Testing**: pytest + pytest-django + factory-boy + moto (backend, además de `backend/qa/`) · Vitest + Testing Library + jsdom (frontend)

**Target Platform**: Linux con Docker Compose; Nginx sirve el frontend y hace proxy de API, media y WebSocket

**Project Type**: web-application (SPA + API + WebSocket)

**Performance Goals**: consulta de espacios y disponibilidad < 3 s en el 95 % de los casos (SC-007); avisos < 5 s en el 95 % (SC-003)

**Constraints**: 0 solapes pendientes/aprobadas bajo concurrencia (SC-001); autorización siempre en servidor (FR-049); fallo de avisos no debe afectar la operación (FR-047); cuerpo de petición ≤ 1 MB

**Scale/Scope**: uso institucional (cientos a pocos miles de usuarios, decenas a cientos de espacios); 9 entidades de dominio, ~50 requisitos funcionales

Valores fijados para los supuestos del spec (todos configurables por variable de entorno): bloqueo de acceso tras 5 intentos durante 1 h (axes); bloqueo del segundo factor tras fallos consecutivos durante 15 min; access token 60 min, refresh 7 días; límites de frecuencia: acceso 10/min, registro 10/h, MFA 10/min, anónimo 60/min, autenticado 600/min. No quedan `NEEDS CLARIFICATION`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

La constitución v1.0.0 (2026-11-16) define 8 principios. Evaluación contra el diseño:

| Principio | Cumplimiento |
|---|---|
| I. Autorización en el servidor | Cumple: `HasRolePermission` y permisos por objeto; pruebas de 403 directo. |
| II. Cero solapes | Cumple: bloqueo de fila del espacio en transacción; prueba de concurrencia (SC-001). |
| III. Auditoría transaccional | Cumple: `log_audit_event` dentro de `transaction.atomic()`. |
| IV. No borrar con historial | Cumple desde 2026-11-15: usuarios y espacios con reservas se desactivan. |
| V. Seguridad por defecto | Cumple: cookies httpOnly + CSRF, MFA, axes, throttles, `prod.py` valida clave y HTTPS. |
| VI. Avisos que no rompen | Cumple: `transaction.on_commit` y captura de excepciones (FR-047). |
| VII. Pruebas obligatorias | Cumple: backend 100 %, frontend 100 % de líneas. La prueba manual con clics en el navegador sigue sin hacerse y se declara así. |
| VIII. Sin demostración ni secretos | Parcial: demo limitada a desarrollo; `backend/credenciales.txt` existe y debe revisarse (T063). |

Sin violaciones que bloqueen. Re-evaluación tras el diseño de Fase 1: sin cambios.

## Project Structure

### Documentation (this feature)

```text
specs/003-reservatrack-platform/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md
│   └── realtime.md
└── tasks.md             # lo genera /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── config/            # settings (base/dev/prod), urls, asgi, celery
├── common/            # autenticación por cookies, permisos, paginación, seguridad, health
├── users/             # User, MFADevice, MFARecoveryCode, mfa.py, vistas de usuario y MFA
├── branches/          # Department, City, Branch, Area, Location
├── spaces/            # Space, SpaceResponsibility
├── reservations/      # Reservation, validación de cruces, revisión, notifications.py
├── realtime/          # NotificationConsumer, middleware de auth WS, events
├── audit/             # AuditLog
├── qa/                # pruebas transversales (cookies, MFA, middleware)
└── docker/, requirements/

frontend/
├── src/
│   ├── pages/         # availability, dashboard, registration, reservations, security, spaces, users
│   ├── components/    # domain, layout, ui
│   ├── context/       # Auth, Notification, Theme
│   ├── services/      # auth.service.ts, reservaTrack.service.ts
│   ├── lib/           # api.ts (axios), permissions.ts, websocket.ts, featureFlags.ts
│   └── test/
└── nginx.conf, Dockerfile
```

**Structure Decision**: aplicación web con `backend/` y `frontend/` independientes, ya presentes en el repositorio. Una app Django por dominio; la lógica de permisos compartida vive en `common/permissions.py` y la espejo de visibilidad de interfaz en `frontend/src/lib/permissions.ts` (solo presentación).

## Complexity Tracking

Sin violaciones que justificar.

## Decisiones del usuario aplicadas (2026-11-15)

- Desactivar en vez de borrar con reservas: `UserViewSet.perform_destroy`, `SpaceViewSet.perform_destroy` (FR-017a, FR-032).
- Cancelación: acción `POST /reservations/{id}/cancel/` (solicitante o admin, antes del inicio, 409 si ya inició o está cerrada) (FR-040).
- Horario: `RESERVATION_OPEN_TIME` / `RESERVATION_CLOSE_TIME` (07:00/21:00), validado en `ReservationSerializer` (FR-040a).
