---

description: "Task list for Plataforma ReservaTrack"
---

# Tasks: Plataforma ReservaTrack de reserva de espacios

**Input**: `/specs/003-reservatrack-platform/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan.md, spec.md

**Tests**: no se pidió TDD. Solo se incluyen tareas de verificación ligadas a criterios medibles del spec (SC-001, SC-005, SC-008) y las pruebas existentes se mantienen verdes.

**Organization**: por historia de usuario. El código ya existe en `backend/` y `frontend/`: cada tarea es «verificar y, si falta o difiere del spec, implementar/corregir». Registrar cada discrepancia hallada en el commit o en la propia tarea.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1…US8 según spec.md

## Path Conventions

Aplicación web: `backend/<app>/` (Django) y `frontend/src/` (React), según plan.md.

---

## Phase 1: Setup

- [X] T001 Confirmar que el entorno levanta con `backend/docker-compose.yml` (PostgreSQL, Redis, backend) y documentar variables obligatorias (`MFA_ENCRYPTION_KEY`, `CHANNELS_REDIS_URL`, `AXES_FAILURE_LIMIT`, `AXES_COOLOFF_TIME_HOURS`, `JWT_*`, `THROTTLE_RATE_*`) en `backend/DEPLOYMENT.md`
- [X] T002 [P] Ejecutar `pytest` en `backend/` y `npm test -- --run && npm run lint && npm run build` en `frontend/`; anotar fallos preexistentes como línea base en `specs/003-reservatrack-platform/quickstart.md` (sección «Línea base»)
- [X] T003 [P] Verificar que `backend/config/settings/base.py` fija los valores del plan: axes 5 intentos / 1 h, JWT access 60 min / refresh 7 días, throttles `login 10/min`, `register 10/hour`, `mfa 10/min`, `anon 60/min`, `user 600/min`, `DATA_UPLOAD_MAX_MEMORY_SIZE` 1 MB

---

## Phase 2: Foundational (bloquea todas las historias)

- [X] T004 Verificar que `User` en `backend/users/models.py` tiene `role` (superuser/admin/user), `type` (estudiante/docente/personal administrativo), `course` y `area` opcionales, `is_active`, y unicidad de usuario y correo sin distinguir mayúsculas (FR-003, FR-017); corregir con migración en `backend/users/migrations/` si falta
- [X] T005 [P] Verificar y completar `backend/common/permissions.py` y `backend/users/permissions.py`: una clase de permiso por regla del contrato `contracts/rest-api.md` (admin, superusuario, personal administrativo responsable activo, docente responsable activo), decididas siempre en servidor (FR-049)
- [X] T006 [P] Verificar `backend/common/authentication.py` y `backend/common/views.py`: autenticación JWT por cookie httpOnly con CSRF, login, refresh y logout con lista negra del refresh (FR-005, FR-007)
- [X] T007 [P] Verificar `backend/audit/models.py` y `backend/audit/utils.py`: `AuditLog` con autor nulo permitido, acción, objeto, valor anterior, valor nuevo, IP de origen y fecha, y una función única de registro reutilizable (FR-048)
- [X] T008 [P] Verificar `backend/common/views.py` `HealthView` en `GET /api/v1/health/` comprobando base de datos y Redis, y `/api/schema/`, `/api/docs/`, `/api/redoc/` en `backend/config/urls.py` (FR-050)
- [X] T009 [P] Verificar `backend/common/middleware.py`, `backend/common/security.py` y django-csp en `backend/config/settings/base.py` (cabeceras de seguridad, CSP)
- [X] T010 Verificar `backend/realtime/middleware.py` y `backend/realtime/routing.py`: la conexión `ws/notifications/` exige sesión válida por cookie y rechaza sin ella (FR-047)
- [X] T011 [P] Verificar `frontend/src/lib/api.ts` (axios con credenciales y CSRF, renovación silenciosa en 401, redirección a login si no es renovable) y `frontend/src/context/AuthContext.tsx` (FR-007)

**Checkpoint**: base de autenticación, permisos, auditoría y tiempo real lista.

---

## Phase 3: User Story 1 - Solicitar un espacio sin cruces de horario (P1) 🎯 MVP

**Goal**: solicitud válida con código único con año y estado «pendiente»; cruces rechazados incluso bajo concurrencia.

**Independent Test**: con usuario y espacio activo, crear solicitud válida (código, `pending`) y comprobar que una segunda solapada recibe 409 y una contigua se acepta.

- [X] T012 [US1] Verificar en `backend/reservations/models.py` los campos de `data-model.md` (`code` único máx. 20, `status` pending/approved/rejected/canceled, `reason` máx. 250, `subject` máx. 160, `group` máx. 100, `attendees` entero positivo opcional) y el índice `(space, date, status)`
- [X] T013 [US1] Verificar en `backend/reservations/api_serializers.py` la validación por categoría: aula exige motivo; laboratorio exige asignatura y grupo; auditorio exige asignatura, grupo y asistentes ≤ capacidad; en laboratorio/auditorio sin motivo, este se completa con asignatura y grupo; rechazar espacio inactivo y `end_time <= start_time` (FR-036, FR-037)
- [X] T014 [US1] Verificar en `backend/reservations/api_serializers.py` que `code`, `user` y `status` son de solo lectura y que el código se genera único y legible con el año (FR-038); corregir si el cliente puede fijarlos
- [X] T015 [US1] Verificar `backend/reservations/api_views.py` `perform_create` y `perform_update`: `transaction.atomic()` + `select_for_update()` sobre el espacio + `_assert_no_conflict` con estados pending/approved, franjas contiguas permitidas y exclusión de la propia reserva al modificar (FR-037, FR-039)
- [X] T016 [US1] Añadir prueba de concurrencia en `backend/reservations/tests.py` (`@pytest.mark.django_db(transaction=True)`, dos hilos con la misma franja): exactamente una solicitud se crea (SC-001)
- [X] T017 [P] [US1] Añadir pruebas de aceptación en `backend/reservations/tests.py` para los escenarios 1–5 y 7 de US1 (cruce, rechazada/cancelada no bloquean, capacidad, espacio inactivo, motivo autocompletado)
- [X] T018 [P] [US1] Verificar el formulario de solicitud en `frontend/src/pages/reservations/` y `frontend/src/components/domain/` (campos según categoría, mensaje claro de conflicto y de validación) y su servicio en `frontend/src/services/reservaTrack.service.ts`
- [X] T019 [US1] Ejecutar escenarios 2–5 de `quickstart.md`

**Checkpoint**: US1 funcional y demostrable (MVP junto con US3).

---

## Phase 4: User Story 3 - Registro, acceso y sesiones seguras (P1)

**Goal**: registro público sin administradores, login, perfil, logout, renovación y cierre de otras sesiones al cambiar contraseña.

**Independent Test**: registrar, iniciar sesión, ver perfil, cerrar sesión y comprobar que el refresh ya no sirve.

- [X] T020 [US3] Verificar `backend/users/api_views.py` `PublicRegistrationView`: throttle `register`, rol forzado a `user`, `type` obligatorio (estudiante/docente/personal administrativo), usuario y correo únicos sin distinguir mayúsculas (FR-001–FR-003, FR-023)
- [X] T021 [P] [US3] Verificar validadores de contraseña (longitud mínima y contraseñas comunes) en `AUTH_PASSWORD_VALIDATORS` de `backend/config/settings/base.py` (FR-004)
- [X] T022 [US3] Verificar en `backend/users/views.py` el cambio de contraseña: exige la actual, pone en lista negra los demás refresh de la cuenta y conserva la sesión actual cuando la cambia su dueño (FR-008, FR-021)
- [X] T023 [US3] Verificar bloqueo por django-axes (`AXES_LOCKOUT_PARAMETERS`) y throttle `login` en `backend/common/views.py` (`ThrottleTokenObtainPairView`, `CookieTokenObtainPairView`) (FR-006)
- [X] T024 [P] [US3] Añadir/ajustar pruebas en `backend/users/tests/` y `backend/qa/test_auth_cookies.py` para US3-1…5
- [X] T025 [P] [US3] Verificar `frontend/src/pages/registration/` (registro con selector de tipo) y flujo de login en `frontend/src/services/auth.service.ts`

**Checkpoint**: acceso completo; US1 puede probarse con usuarios reales.

---

## Phase 5: User Story 2 - Revisar solicitudes y notificar en tiempo real (P1)

**Goal**: aprobar/rechazar con revisor autorizado y avisos sin recargar.

**Independent Test**: aprobar una pendiente con revisor autorizado; verificar estado, `reviewed_by`, `response_date` y aviso solo al solicitante.

- [X] T026 [US2] Verificar `backend/reservations/api_views.py` `approve`/`reject`/`_review`: solo admin o docente responsable activo; `select_for_update`; ya revisada → 409; registra `reviewed_by` y `response_date`; no revalida cruces (FR-042–FR-044)
- [X] T027 [US2] Verificar `backend/reservations/notifications.py` y `backend/realtime/events.py`: aviso `reservation.created` a admins y responsables activos (no al solicitante) y `reservation.reviewed` solo al solicitante, con código, espacio, fecha, horario y estado, enviados con `transaction.on_commit` (FR-045, FR-046)
- [X] T028 [US2] Verificar que cualquier excepción del envío se registra y no rompe la operación (FR-047); añadir prueba en `backend/reservations/tests.py` simulando fallo de la capa de canales
- [X] T029 [P] [US2] Verificar `backend/realtime/consumers.py`: grupo por usuario, mensajes entrantes ignorados, sin sesión rechazado; pruebas en `backend/realtime/tests/`
- [X] T030 [P] [US2] Verificar `frontend/src/lib/websocket.ts` (reconexión con espera creciente, sin reintento indefinido sin sesión) y `frontend/src/context/NotificationContext.tsx`
- [X] T031 [P] [US2] Verificar acciones aprobar/rechazar visibles solo a revisores en `frontend/src/pages/reservations/`
- [X] T032 [US2] Ejecutar escenarios 6 y 7 de `quickstart.md` (dos navegadores, < 5 s, SC-003)

**Checkpoint**: ciclo completo de reserva.

---

## Phase 6: User Story 4 - Consultar espacios y disponibilidad (P2)

**Goal**: búsqueda pública de espacios y franjas ocupadas con alcance por rol.

**Independent Test**: consultar espacios sin sesión y disponibilidad con admin, docente y estudiante.

- [X] T033 [US4] Verificar `backend/spaces/api_views.py` listado público con búsqueda (nombre, descripción, ubicación) y filtros `category` y estado (FR-029)
- [X] T034 [US4] Verificar `get_queryset` de `backend/reservations/api_views.py` y la vista de disponibilidad: admin todo; docente propias y de espacios con responsabilidad activa; resto propias; filtros `space`, `date`, `status`; búsqueda por código, motivo, solicitante, espacio (FR-034, FR-035)
- [X] T035 [P] [US4] Verificar `frontend/src/pages/availability/` y `frontend/src/pages/spaces/` (filtros, franjas de la fecha elegida)
- [X] T036 [P] [US4] Añadir pruebas de alcance en `backend/reservations/tests.py` y `backend/spaces/tests.py` (US4-1…3, el conflicto se detecta aunque la franja esté oculta)
- [X] T037 [US4] Medir consulta de espacios y disponibilidad con datos de carga: p95 < 3 s (SC-007); añadir índices si es necesario

---

## Phase 7: User Story 5 - Administrar espacios, ubicaciones y responsables (P2)

**Goal**: CRUD de espacios y catálogo; responsables con reglas de rol.

**Independent Test**: crear ubicación y espacio, asignar responsable y comprobar unicidad y dependencias.

- [X] T038 [P] [US5] Verificar `backend/branches/models.py`: nombres únicos de departamento, área y sede; `unique_city_per_department`; `unique_location (branch, area, detail)` (FR-026)
- [X] T039 [US5] Verificar `backend/branches/api_views.py`: lectura pública, escritura solo admin/superusuario, filtros `cities?department` y `locations?branch&area`, eliminar con dependencias → 409 (FR-027, FR-028)
- [X] T040 [US5] Verificar `backend/spaces/models.py` y `backend/spaces/api_serializers.py`: capacidad ≥ 1, ubicación texto o catálogo (al menos una) y autocompletado del texto desde el catálogo (FR-030)
- [X] T041 [US5] Verificar `backend/spaces/api_views.py`: crear/eliminar solo admin; editar admin o personal administrativo responsable activo; espacio inactivo conserva reservas (FR-031, FR-032)
- [X] T042 [US5] Verificar `SpaceResponsibilityViewSet` en `backend/spaces/views.py`: solo usuarios activos de rol `user`, una responsabilidad por usuario y espacio, activar/desactivar/reactivar, personal administrativo solo en sus espacios (FR-033)
- [X] T043 [P] [US5] Añadir pruebas de US5-1…5 en `backend/branches/tests.py` y `backend/spaces/tests.py`
- [X] T044 [P] [US5] Verificar pantallas de espacios y responsables en `frontend/src/pages/spaces/` y gestión de catálogo en `frontend/src/components/domain/`

---

## Phase 8: User Story 6 - Autenticación multifactor (P2)

**Goal**: activar, usar, regenerar y desactivar MFA; códigos de un solo uso.

**Independent Test**: activar MFA, cerrar sesión, entrar con segundo factor y comprobar que un código de recuperación no se reutiliza.

- [X] T045 [US6] Verificar `backend/users/mfa.py`: secreto TOTP cifrado con Fernet, rechazo de reutilización del paso TOTP, códigos de recuperación hasheados y de un solo uso, bloqueo 15 min que rechaza incluso un código correcto (FR-012, FR-014, SC-008)
- [X] T046 [US6] Verificar `backend/users/mfa_views.py`: `status` (activo y códigos restantes), `setup` (QR SVG + clave manual), `confirm` (entrega códigos una sola vez), `verify` y `verify/cookie`, `recovery-codes` (exige código de app, no de recuperación), `disable` (contraseña + código vigente) (FR-009–FR-011, FR-015)
- [X] T047 [US6] Verificar que el token intermedio del acceso MFA es de vida corta y se invalida si cambia la contraseña (FR-013) en `backend/common/views.py`
- [X] T048 [US6] Verificar restablecimiento de MFA por el superusuario en `backend/users/views.py`, auditado (FR-016, FR-048)
- [X] T049 [P] [US6] Completar pruebas en `backend/users/tests/` y `backend/qa/test_mfa_extra.py` para US6-1…5 y SC-008
- [X] T050 [P] [US6] Verificar `frontend/src/pages/security/` (flujo QR, clave manual, códigos de recuperación mostrados una vez, segundo paso de login)

---

## Phase 9: User Story 7 - Gestión de usuarios, roles y auditoría (P3)

**Goal**: administración de usuarios con restricciones y auditoría completa.

**Independent Test**: cambiar un rol como superusuario y verificar `AuditLog` con valores anterior y nuevo; un administrador no puede.

- [X] T051 [US7] Verificar `backend/users/views.py` `UserViewSet`: listar/consultar/editar/activar/desactivar y restablecer contraseña para admin y superusuario; crear, eliminar, asignar rol admin y restablecer MFA solo superusuario; personal administrativo solo lista activos de rol `user`; `type` inmutable (FR-018–FR-020, FR-023)
- [X] T052 [US7] Verificar que un usuario no puede modificar su propio rol, estado ni privilegios y que un superusuario no puede eliminarse (FR-021, FR-022)
- [X] T053 [US7] Verificar que cambios de rol, estado, contraseña, eliminación de usuarios y eventos MFA escriben `AuditLog` con autor, acción, objeto, anterior, nuevo, IP y fecha, en la misma transacción del cambio (FR-048, SC-005)
- [X] T054 [P] [US7] Añadir pruebas de US7-1…4 y de completitud de auditoría en `backend/users/tests/` y `backend/audit/`
- [X] T055 [P] [US7] Verificar `frontend/src/pages/users/` (listado, edición, activación, restablecer contraseña; acciones de superusuario solo a superusuario)

---

## Phase 10: User Story 8 - Navegación según permisos y módulo embebido (P3)

**Goal**: interfaz acorde al rol y formulario embebido para Timonel.

**Independent Test**: entrar con distintos roles; verificar secciones, redirección al panel y módulo embebido sin acciones de revisión.

- [X] T056 [US8] Verificar `frontend/src/lib/permissions.ts` y `frontend/src/components/layout/`: secciones visibles por rol (panel, espacios, disponibilidad, reservas, seguridad; usuarios y responsables según rol) y redirección al panel en secciones no permitidas (FR-049)
- [X] T057 [US8] Verificar la ruta del módulo embebido en `frontend/src/App.tsx`: solo formulario de solicitud, espacios limitados a aula, laboratorio y auditorio activos, sin acciones de revisión (FR-041)
- [X] T058 [P] [US8] Añadir pruebas en `frontend/src/test/pages.simple.test.tsx` y `frontend/src/test/components.test.tsx` para redirección y módulo embebido
- [X] T059 [US8] Verificar que invocar directamente una operación oculta devuelve 403 en la API (US8-2) con una prueba en `backend/common/tests/`

---

## Phase 11: Polish & Cross-Cutting

- [X] T060 [P] Evaluar `ExclusionConstraint` de PostgreSQL como defensa adicional contra solapes en `backend/reservations/models.py` (mejora opcional de `research.md` §1; decidir y documentar)
- [X] T061 [P] Actualizar `docs/analisis-inicial/SPEC.md`, `docs/analisis-inicial/SSD.md` y `backend/DEPLOYMENT.md` con las discrepancias corregidas
- [X] T062 Completar la verificación de `data-model.md`: sustituir las marcas «(verificar)» por los nombres reales de campos y enums
- [X] T063 Revisar `backend/credenciales.txt`, `credenciales.txt` y `docs/REPORTE_PRUEBAS_QA.txt`: confirmar que no contienen secretos reales ni se versionan
- [X] T064 Ejecutar los 12 escenarios de `quickstart.md` y la suite completa (backend y frontend)

---

## Phase 12: Decisiones del usuario (P1C, P2C, P3B)

- [X] T065 Desactivar en lugar de borrar usuarios y espacios con reservas en `backend/users/views.py` y `backend/spaces/api_views.py` (FR-017a, FR-032)
- [X] T066 Acción `cancel` en `backend/reservations/api_views.py` (solicitante o admin, solo antes del inicio) (FR-040)
- [X] T067 Horario permitido configurable en `backend/config/settings/base.py` y validación en `backend/reservations/api_serializers.py` (FR-040a)
- [X] T068 Pruebas en `backend/qa/test_spec003_decisions.py` (11) y botón «Cancelar» con 3 pruebas en `frontend/src/test/pages.reservations.test.tsx`

---

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** → historias.
- **US1 (P1)** y **US3 (P1)**: US1 necesita usuarios autenticados; pueden desarrollarse en paralelo, validar US1 con US3 lista.
- **US2 (P1)**: depende de US1 (necesita solicitudes) y de T010/T027.
- **US4, US5, US6 (P2)**: independientes entre sí tras Foundational; US4 usa datos de US1/US5 para probar.
- **US7, US8 (P3)**: tras Foundational; US7 comparte `UserViewSet` con US3/US6 (secuenciar sobre `backend/users/views.py`).
- **Polish (11)**: tras las historias deseadas.

## Parallel Opportunities

- Setup: T002, T003.
- Foundational: T005–T009, T011 en paralelo.
- US1: T017 y T018 en paralelo tras T015.
- US2: T029, T030, T031 en paralelo.
- Cada historia: las verificaciones de frontend `[P]` corren en paralelo con las de backend.

## Implementation Strategy

### MVP
1. Setup + Foundational. 2. US3 + US1. 3. **Validar** escenarios 1–5 de `quickstart.md`. 4. US2 para cerrar el ciclo.

### Incremental
US4 → US5 → US6 → US7 → US8 → Polish; validar cada checkpoint con su prueba independiente.

## Notes

- Las tareas «Verificar» terminan en conformidad confirmada o en corrección; no marcar completa sin evidencia (prueba o escenario del quickstart).
- No modificar `.specify/memory/constitution.md` aquí; ejecutar `/speckit-constitution` aparte.

## Hallazgos de la ejecución (2026-11-15)

**Estado final**: 68/68 tareas cerradas. Backend 386 pruebas y frontend 271 correctas; `npm run build` correcto. Los escenarios de `quickstart.md` (T019, T032, T064) se ejecutaron como pruebas automatizadas (HTTP, WebSocket con Redis real y navegación simulada con Testing Library), **no** a mano en dos navegadores.

**Corregido en el código**
- FR-039: el solicitante modifica su solicitud mientras esté `pending`; el administrador siempre (regla de «solo pendiente» añadida por criterio propio).
- FR-033: el personal administrativo activa/desactiva responsables de sus espacios.
- FR-003/FR-004: el registro público ahora compara usuario sin distinguir mayúsculas y aplica los validadores de contraseña (mínimo 10, no común); el formulario pide 10.
- FR-048: cambio y registro de auditoría en la misma transacción.
- `GET /health/` ya no filtra el texto de las excepciones.
- Frontend: los listados leían solo la primera página (20 elementos); ahora siguen todas las páginas (`fetchAll`). Con más de 20 espacios los restantes no se podían reservar y con más de 20 reservas se truncaban la lista y la disponibilidad.
- Frontend: los datos de demostración sustituían silenciosamente a la API ante errores 401/403/404/5xx, red caída o listas vacías; ahora solo en desarrollo (`DEMO_FALLBACK_ENABLED = import.meta.env.DEV`). En producción los errores se muestran.
- Título y descripción de OpenAPI («Biometric API» → «ReservaTrack API»).

**Pruebas añadidas**: `backend/qa/test_spec003_gaps.py` (FR-039, FR-033, concurrencia SC-001), `test_spec003_users.py` (registro, roles, auditoría, 403 directos, health), `test_spec003_realtime.py` (WebSocket: 4401, cookie y bearer, destinatarios, mensajes entrantes ignorados, fallo del canal), `test_spec003_us4_us5.py` (franjas contiguas, conflicto oculto, búsqueda, desactivar espacio, rendimiento SC-007), `test_spec003_latency.py` (SC-003 con Redis real: 0,41 s). Los tests de `realtime/tests/test_notifications.py` están todos comentados desde antes.

**Brechas cerradas después (2026-11-15)**
- FR-001: curso y área son opcionales en el registro (backend y formulario).
- FR-041: el módulo embebido de Timonel muestra solo el formulario, sin listado.
- FR-018 (parcial): la pantalla de usuarios permite activar y desactivar.
- Clave de caché del frontend renombrada a `reservatrack_user`.
- FR-018/FR-019: la pantalla de usuarios permite restablecer contraseñas (admin y superusuario) y, solo al superusuario, crear usuarios, cambiar el rol (administrador/usuario) y eliminar (desactiva si tiene reservas).
- FR-039: el solicitante edita su solicitud pendiente y el administrador las pendientes o aprobadas, desde la pantalla de reservas.

**Brechas que siguen abiertas**
- Disponibilidad parcial: un visitante sin sesión no ve franjas ocupadas y un estudiante solo ve las propias (aceptado por el spec).
- Las pruebas de `realtime/tests/test_notifications.py` siguen comentadas (cubiertas por `qa/test_spec003_realtime.py`).
- (Cerrada 2026-11-16) Los nombres `biometric_*` solo eran valores por defecto en `backend/docker-compose.yml` y `settings/base.py`; ReservaTrack usa `reserva_db`/`reserva_user` desde `backend/.env`. Se cambiaron los valores por defecto a `reserva_*` y el remitente de correo a `Reserva API <noreply@reservatrack.local>`. No hubo migración de datos; el contenedor `db` del otro proyecto (`software_biomedicos`, volumen `backend_postgres_data`) no se tocó y conserva `biometric_db`.
