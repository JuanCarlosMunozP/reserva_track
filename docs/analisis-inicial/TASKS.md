# Tareas de construcción y pruebas de ReservaTrack

> **Documento de análisis inicial (ingeniería inversa, 2026-11-11/13).** La especificación vigente es [specs/003-reservatrack-platform/spec.md](../../specs/003-reservatrack-platform/spec.md); ante cualquier diferencia prevalece la spec 003 y su plan/tareas. Se conserva como referencia histórica.

**Complementa a:** [SPEC.md](SPEC.md) (v1.1) y [SSD.md](SSD.md)
**Fecha:** 13 de noviembre de 2026
**Convención:** `[x]` hecho y verificado · `[ ]` pendiente o fuera de alcance (decisión funcional abierta).
Cada tarea indica el requisito que implementa (`SPEC §n`, `SSD-nn`) y la prueba que la fija. Las rutas de prueba son relativas a `backend/` (pytest, en el contenedor `web`) o `frontend/` (Vitest).
Reporte de ejecución: [REPORTE_PRUEBAS_QA.txt](../REPORTE_PRUEBAS_QA.txt).

## Resumen

| Fase | Tareas | Estado |
| --- | --- | --- |
| F0 Infraestructura y configuración | 8 | Hecha |
| F1 Backend: dominio y API | 10 | Hecha |
| F2 Backend: seguridad, MFA y tiempo real | 8 | Hecha |
| F3 Frontend | 9 | Hecha |
| F4 Correcciones detectadas por SSD | 4 | Hechas |
| F5 Pruebas QA unitarias (backend y frontend) | 10 | Hechas |
| F6 Defectos hallados por QA, corregidos para cumplir spec/SSD | 6 | Hechos |
| F7 Pendientes abiertos | 9 | Abiertos |

---

## F0 · Infraestructura y configuración

- [x] **T-001** Proyecto Django con settings separados `base` / `dev` / `prod`; zona horaria `America/Bogota`. *(SPEC §7)* — `config/settings/*` · `qa/test_config.py::test_base_*`, `test_dev_*`
- [x] **T-002** Endurecimiento de producción: rechaza clave débil/por defecto, `ALLOWED_HOSTS` con comodín y orígenes/URL no HTTPS; HSTS, CSP, cookies `Secure`, redirección HTTPS. *(SPEC §7)* — `config/settings/prod.py` · `qa/test_config.py::test_prod_*`
- [x] **T-003** Configuración por variables de entorno (BD, Redis, JWT, correo, S3, Sentry); S3 solo con credenciales; Sentry solo con DSN. *(SPEC §7 Configuración)* — `qa/test_config.py::test_base_uses_s3_*`, `test_base_initializes_sentry_*`
- [x] **T-004** Docker Compose: PostgreSQL 16, Redis 7, Django, worker y beat de Celery, Flower, Nginx/frontend, Mailpit; override de producción que publica Django solo en `127.0.0.1:8020`. *(SPEC §7 Despliegue)* — `docker-compose*.yml`, `DEPLOYMENT.md`
- [x] **T-005** Celery con broker/resultados en Redis. — `config/celery.py` · `qa/test_config.py::test_asgi_wsgi_and_celery_*`
- [x] **T-006** ASGI con enrutado HTTP + WebSocket y validación de origen; WSGI. *(SSD-12)* — `config/asgi.py`, `config/wsgi.py` · `qa/test_realtime.py::test_full_asgi_application_*`
- [x] **T-007** URLConf raíz con API versionada `/api/v1/`, OpenAPI, Swagger y ReDoc, `/health/` y redirección de `/admin` al frontend; `django-admin/` conservado. *(SPEC §5)* — `config/urls.py` · `qa/test_config.py::test_admin_*`, `test_openapi_*`, `test_redoc_is_served`
- [x] **T-008** `manage.py` y comandos de arranque. — `manage.py` · `qa/test_config.py::test_manage_*`

## F1 · Backend: dominio y API

- [x] **T-010** Modelo `User` (rol, tipo, curso, área) con username/email únicos y `UserManager` propio (valores por defecto de rol/tipo, normalización de email, helpers `active()`, `by_role()`…). *(SPEC §4)* — `users/models.py`, `users/managers.py` · `qa/test_users.py::test_custom_manager_*`, `test_manager_helpers_*`
- [x] **T-011** CRUD de usuarios con alcance por rol; listado restringido para personal administrativo; `GET /users/me/`. *(SPEC §2, §5 · SSD-16)* — `users/views.py` · `qa/test_users.py`, `qa/test_users_edges.py::test_queryset_*`
- [x] **T-012** Validadores de usuario: normalización, duplicados sin distinguir mayúsculas, valores vacíos, tipo obligatorio al crear, rol `admin` solo asignable por superusuario. *(SSD-16)* — `users/serializers.py` · `qa/test_users_edges.py`, `common/tests/test_ssd_behaviors.py::test_create_user_requires_type`
- [x] **T-013** Cambio de contraseña (propio con contraseña actual; administrador sin ella) con revocación de sesiones. *(SPEC §3.1 · SSD-16)* — `qa/test_users.py::test_set_password_*`, `common/tests/test_ssd_behaviors.py::test_password_change_revokes_*`
- [x] **T-014** Registro público con límite de frecuencia dedicado. *(SSD-01)* — `users/api_views.py` · `qa/test_users.py::test_public_registration_*`
- [x] **T-015** Espacios: CRUD, categorías, capacidad ≥ 1, ubicación libre o normalizada, filtros y búsqueda, lectura pública. *(SPEC §3.2 · SSD-05, SSD-15)* — `spaces/` · `qa/test_spaces_branches_audit.py`
- [x] **T-016** Responsabilidades: unicidad usuario/espacio, usuario activo de rol `usuario`, restricción de ámbito para personal administrativo. *(SSD-08)* — `qa/test_spaces_branches_audit.py::test_responsibility_*`
- [x] **T-017** Catálogos geográficos (departamento → ciudad → sede, área, ubicación) con lectura pública, escritura de administrador y 409 al borrar con dependencias. *(SSD-13)* — `branches/` · `qa/test_spaces_branches_audit.py::test_catalog_*`, `qa/test_migration_and_csrf.py` (migración `0002`)
- [x] **T-018** Reservas: reglas por tipo de espacio, espacio activo, fin > inicio, bloqueo de cruces (pendiente/aprobado) con `SELECT … FOR UPDATE`, código `RT-AAAA-NNNN`, estado inicial `pending`. *(SPEC §3.3 · SSD-06)* — `reservations/` · `qa/test_reservations.py`
- [x] **T-019** Aprobar / rechazar con transición bloqueada y 409 si no está pendiente; alcance de revisión por rol y responsabilidad. *(SSD-07)* — `qa/test_reservations.py::test_approve_*`, `test_reject_*`

## F2 · Backend: seguridad, MFA y tiempo real

- [x] **T-020** JWT en cookies `httpOnly` con CSRF obligatorio, refresh con lista negra, logout; endpoints JWT clásicos para clientes externos. *(SPEC §3.1 · SSD-02, SSD-04)* — `common/views.py`, `common/authentication.py` · `qa/test_auth_cookies.py`, `qa/test_migration_and_csrf.py::test_enforce_csrf_*`
- [x] **T-021** Bloqueo por intentos (axes) y limitación de frecuencia (login, anónimo, usuario, MFA, registro). *(SSD-02)* — `qa/test_auth_cookies.py::test_*throttl*`
- [x] **T-022** Middleware de seguridad: guardia de peticiones, detección de inyección, cabeceras seguras; sanitización de serializers y paginación (20 por página). *(SPEC §7)* — `common/middleware.py`, `common/security.py` · `qa/test_middleware_security.py`, `common/tests/test_security.py`
- [x] **T-023** Matriz de permisos `role_can` / `HasRolePermission` (vista y objeto). *(SPEC §2)* — `common/permissions.py` · `qa/test_permissions.py`
- [x] **T-024** MFA TOTP: secreto cifrado (Fernet), un dispositivo por usuario, paso TOTP no reutilizable, bloqueo por intentos, códigos de recuperación HMAC de un solo uso, desafío firmado de login. *(SPEC §3.1, §7 · SSD-03, SSD-09, SSD-10)* — `users/mfa.py`, `users/mfa_views.py` · `users/tests/test_mfa.py`, `qa/test_mfa_extra.py`
- [x] **T-025** Restablecer MFA de otro usuario (solo superusuario) con auditoría. *(SSD-11)* — `qa/test_users.py::test_reset_mfa_*`
- [x] **T-026** Auditoría (actor, acción, modelo, cambios JSON, IP) para MFA, cambios de rol/estado y contraseñas. *(SPEC §4)* — `audit/` · `qa/test_spaces_branches_audit.py::test_audit_*`
- [x] **T-027** WebSocket `/ws/notifications/`: autenticación por cookie o `Bearer`, grupos `notifications` y `user.<id>`, cierre 4401 (no autenticado) y 1013 (Redis caído), solo lectura. *(SPEC §6 · SSD-12)* — `realtime/` · `qa/test_realtime.py`

## F3 · Frontend

- [x] **T-030** SPA React 19 + TypeScript + Vite con rutas: `/registro`, `/`, `/espacios`, `/disponibilidad`, `/reservas`, `/usuarios`, `/responsables`, `/seguridad`, `/timonel/reservas`; `/historial` y `/reportes` redirigen. *(SPEC §3.4)* — `src/App.tsx` · `src/test/app.test.tsx`
- [x] **T-031** Cliente HTTP (axios) con cabecera CSRF y reintento único tras 401 con renovación compartida. *(SSD-04)* — `src/lib/api.ts` · `src/test/lib.api.test.ts`
- [x] **T-032** Contextos de autenticación, tema y notificaciones. — `src/context/` · `src/test/context.test.tsx`
- [x] **T-033** Matriz de permisos de visibilidad (la autoridad es el servidor). *(SPEC §2)* — `src/lib/permissions.ts` · `src/test/lib.basic.test.ts`
- [x] **T-034** Servicios de dominio y autenticación con fallback demo (`localStorage`). *(SPEC §8.1)* — `src/services/` · `src/test/services.*.test.ts`
- [x] **T-035** Páginas: panel, espacios, disponibilidad, reservas (incluido modo Timonel), usuarios, responsables, registro. — `src/pages/` · `src/test/pages.simple.test.tsx`, `pages.spaces.test.tsx`, `pages.reservations.test.tsx`
- [x] **T-036** Página de seguridad / MFA (QR, confirmación, códigos de recuperación, desactivación). *(SSD-09, SSD-10)* — `src/test/pages.security.test.tsx`, `pages.security.load.test.tsx`
- [x] **T-037** Cliente WebSocket único con reconexión exponencial + jitter y sin reintento ante 4401; avisos `reservation_created` / `reservation_reviewed`. *(SPEC §6 · SSD-12)* — `src/lib/websocket.ts` · `src/test/lib.websocket.test.ts`
- [x] **T-038** Componentes de interfaz y de dominio reutilizables. — `src/components/` · `src/test/components.test.tsx`

## F4 · Correcciones detectadas al documentar los SSD

- [x] **T-040** Borrar catálogo con dependencias: de 500 a 409 (`ProtectedDeleteMixin`). *(SSD-13)* — `common/tests/test_ssd_behaviors.py::test_delete_department_with_cities_returns_409`
- [x] **T-041** `POST /users/` exige `type`. *(SSD-16)* — `test_create_user_requires_type`, `test_user_created_with_type_can_reserve`
- [x] **T-042** Cambio/restablecimiento de contraseña revoca sesiones (conserva la actual si es el propio usuario). *(SSD-16)* — `test_password_change_revokes_other_sessions_and_keeps_current`, `test_admin_password_reset_revokes_all_sessions_of_target`
- [x] **T-043** Notificaciones de reservas publicadas al confirmarse la transacción (`on_commit`). *(SSD-06, SSD-07, SSD-12)* — `reservations/notifications.py` · `test_create_notifies_admins_and_space_responsibles_not_requester`, `test_review_notifies_only_the_requester`

## F5 · Pruebas QA unitarias

- [x] **T-050** Entorno de pruebas backend: pytest + pytest-django + pytest-cov en Docker, hash MD5 y caché limpia, fixtures `make_user`, `api`, `make_space`, roles. — `qa/conftest.py`
- [x] **T-051** Pruebas de cookies, CSRF, JWT, health y throttling. — `qa/test_auth_cookies.py`
- [x] **T-052** Pruebas de middleware, sanitización y paginación. — `qa/test_middleware_security.py`
- [x] **T-053** Pruebas de permisos. — `qa/test_permissions.py`
- [x] **T-054** Pruebas de usuarios, manager, seed y casos límite de validadores/ViewSet. — `qa/test_users.py`, `qa/test_users_edges.py`
- [x] **T-055** Pruebas de MFA (cifrado, bloqueo, recuperación, vistas). — `qa/test_mfa_extra.py`
- [x] **T-056** Pruebas de espacios, catálogos, responsabilidades y auditoría. — `qa/test_spaces_branches_audit.py`
- [x] **T-057** Pruebas de reservas y notificaciones. — `qa/test_reservations.py`
- [x] **T-058** Pruebas de WebSocket, configuración/ASGI/settings, migración de datos y callback CSRF. — `qa/test_realtime.py`, `qa/test_config.py`, `qa/test_migration_and_csrf.py`
- [x] **T-059** Entorno y pruebas del frontend: Vitest + jsdom + Testing Library + cobertura v8; 14 archivos en `src/test/`; `tsc -b` excluye `src/test`. — `vite.config.ts`, `src/test/setup.ts`, `tsconfig.app.json`

## F6 · Defectos hallados por QA y corregidos para cumplir spec/SSD

| Tarea | Defecto | Requisito | Corrección | Prueba (antes `xfail`, ahora normal) |
| --- | --- | --- | --- | --- |
| [x] **T-060** | JWT válido de usuario eliminado/inactivo lanzaba `AuthenticationFailed` y rompía el handshake | SSD-12: sin autenticar → cierre 4401 | `realtime/middleware.py` captura `AuthenticationFailed` y trata al usuario como anónimo | `qa/test_realtime.py::test_token_for_deleted_user_*`, `test_token_for_inactive_user_*` |
| [x] **T-061** | `UserManager` propio no estaba enlazado: superusuarios sin rol/tipo | SPEC §2 (superusuario con acceso completo) y §4 | `objects = UserManager()` en `users/models.py` + migración `0003_user_manager` | `qa/test_users.py::test_custom_manager_is_wired_*`, `test_superuser_gets_admin_role_by_default` |
| [x] **T-062** | `/api/redoc/` respondía 500 (`url_name` inválido) | SPEC §5 (`/api/redoc/`) | `url_name="schema"` en `config/urls.py` | `qa/test_config.py::test_redoc_is_served` |
| [x] **T-063** | `/media/` en DEBUG fallaba (`document=` en lugar de `document_root=`) | SPEC §7 (Nginx/Django sirven `/media/`) | `document_root=settings.MEDIA_ROOT` | `qa/test_config.py::test_media_files_are_served_in_debug` |
| [x] **T-064** | `/admin` con host local y frontend sin puerto: 500 (usaba `request` como `netloc`) | SPEC §3.4 (redirección al frontend) | `netloc = request_host` | `qa/test_config.py::test_admin_redirect_loopback_frontend_without_port` |
| [x] **T-065** | Regex `^admin(/.)?$` devolvía 404 en `/admin/` | idem | `^admin(/.*)?$` | `qa/test_config.py::test_admin_trailing_slash_redirects` |

Frontend: la verificación contra SPEC §3.4 y SSD-12 no encontró desviaciones; no requirió cambios de código.

## F7 · Pendientes abiertos (requieren decisión funcional; no se implementan por inferencia)

Provienen de [SPEC.md §8](SPEC.md) y de la sección "Pendiente" de [SSD.md](SSD.md).

- [ ] **T-070** Eliminar el fallback demo mezclado con la API o separarlo claramente. *(SPEC §8.1)*
- [ ] **T-071** Decidir si `/historial` y `/reportes` serán funcionalidades reales. *(SPEC §8.2)*
- [x] **T-072** Cancelación de reservas: `POST /reservations/{id}/cancel/` (solicitante o administrador, antes del inicio) y botón en la interfaz. *(SPEC §8.3; specs/003 FR-040)*
- [x] **T-073** Horario permitido 07:00–21:00 (configurable con `RESERVATION_OPEN_TIME`/`RESERVATION_CLOSE_TIME`); sin límite de duración ni anticipación. *(SPEC §8.4; FR-040a)*
- [ ] **T-074** Instrumentar auditoría uniforme del CRUD general. *(SPEC §8.5)*
- [ ] **T-075** Notificar edición, cancelación y cambios de estado de espacios; añadir correo; probar avisos con WebSocket real y dos navegadores. *(SPEC §8.6, SSD Pendiente)*
- [x] **T-076** Usuarios y espacios con reservas se desactivan en lugar de borrarse. *(SPEC §8.7; FR-017a, FR-032)*
- [ ] **T-077** Confirmar `AUTH_COOKIE_SAMESITE` por despliegue si Timonel está en otro dominio. *(SSD-14)*
- [ ] **T-078** Documentar con SSD propio la edición, desactivación y baja de responsabilidades. *(SSD Pendiente)*

---

## F8 · Decisiones del spec 003 y recorrido real (2026-11-16)

- [x] **T-080** Curso y área opcionales en el registro; módulo Timonel solo con formulario; edición de reservas; gestión de usuarios en la interfaz (activar, contraseña, rol, crear, eliminar). — `specs/003-reservatrack-platform/tasks.md`
- [x] **T-081** Pruebas nuevas: backend 387 (100 % de cobertura) y frontend 279 (100 % de líneas); `tsc -b` sin errores.
- [x] **T-082** Recorrido de extremo a extremo contra el sistema real (28/28), detallado en `REPORTE_PRUEBAS_QA.txt` §7. Pendiente: prueba manual con clics en el navegador.

---

## Cómo verificar

```bash
# Backend (contenedor web)
docker exec reserva_track-web-1 sh -c "cd /app && python -m pytest -q -p no:cacheprovider --cov=. --cov-report=term-missing"

# Frontend (PowerShell, desde frontend/, unidad D: en mayúscula)
npx vitest run --coverage
npx tsc -b
```
