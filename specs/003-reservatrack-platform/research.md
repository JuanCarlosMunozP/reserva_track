# Research: Plataforma ReservaTrack

No quedaban `NEEDS CLARIFICATION` en el contexto técnico; las decisiones siguientes recogen lo implementado y fijan los umbrales que el spec delegaba a la planificación.

## 1. Prevención de doble reserva bajo concurrencia (FR-037, SC-001)

- **Decision**: dentro de `transaction.atomic()`, bloquear la fila del espacio con `select_for_update()` y luego consultar cruces (`start < fin_existente AND end > inicio_existente`, mismo espacio y fecha, estados pendiente/aprobada, excluyendo la propia al modificar). Franjas contiguas no cruzan.
- **Rationale**: serializa las solicitudes por espacio sin bloquear toda la tabla; funciona en cualquier base relacional.
- **Decisión (T060, 2026-11-15)**: se mantiene `select_for_update`; una restricción de exclusión (`btree_gist` + `ExclusionConstraint` con `condition` sobre estado pendiente/aprobada) queda diferida: añadiría una extensión de PostgreSQL y una migración sobre datos existentes que podrían ya tener solapes, y la prueba de concurrencia de `backend/qa/test_spec003_gaps.py` demuestra que el bloqueo actual cumple SC-001. Reabrir si se agrega otra vía de escritura de reservas fuera de `ReservationViewSet`.
- **Alternatives**: restricción de exclusión (`ExclusionConstraint` con rangos) en PostgreSQL — más fuerte como última defensa, pero no soporta filtrar por estado sin índice parcial y acopla a PostgreSQL; se deja como mejora opcional. Bloqueos optimistas con reintento — más complejo para el mismo resultado.

## 2. Sesiones: JWT en cookies httpOnly + CSRF (FR-005, FR-007, FR-008)

- **Decision**: simplejwt con access 60 min y refresh 7 días en cookies httpOnly para la SPA; flujo «clásico» por cuerpo para clientes sin navegador. Logout con lista negra del refresh. Cambio de contraseña invalida las demás sesiones (lista negra de tokens pendientes de la cuenta) conservando la actual si la cambió su dueño.
- **Rationale**: evita exponer tokens a JavaScript (XSS); la renovación silenciosa cumple FR-007.
- **Alternatives**: sesiones de Django con cookie — más simples, pero no sirven a clientes no web; tokens en `localStorage` — rechazado por XSS.

## 3. Bloqueo de intentos y límites de frecuencia (FR-006)

- **Decision**: django-axes (5 intentos, 1 h, por usuario + IP) y throttles de DRF por scope (`login`, `register`, `mfa`, `anon`, `user`).
- **Rationale**: estándar de la industria, configurable por entorno.
- **Alternatives**: contador propio en Redis — reinventa lo que axes ya resuelve.

## 4. MFA TOTP (FR-009 a FR-016, SC-008)

- **Decision**: `pyotp` (TOTP), secreto cifrado en reposo con Fernet (`MFA_ENCRYPTION_KEY`), QR en SVG (sin Pillow), códigos de recuperación de un solo uso almacenados con hash, rechazo de reutilización del último paso TOTP aceptado, bloqueo de 15 min tras fallos consecutivos (incluso con código correcto). Token intermedio de acceso de vida corta, ligado al estado de la contraseña para invalidarse si esta cambia.
- **Rationale**: cumple la ausencia de reutilización y el bloqueo efectivo; el cifrado protege ante filtración de la base.
- **Alternatives**: SMS/correo — fuera de alcance del spec.

## 5. Notificaciones en tiempo real (FR-045 a FR-047, SC-003)

- **Decision**: Django Channels con capa Redis; un consumer `ws/notifications/` autenticado por cookie; grupos por usuario. El servidor emite con `transaction.on_commit` tras confirmar la operación; cualquier excepción del envío se registra y se traga. El consumer ignora mensajes entrantes. El cliente reconecta con espera exponencial y no reintenta sin sesión válida.
- **Rationale**: emitir tras commit evita avisos de operaciones revertidas; aislar el fallo cumple FR-047.
- **Alternatives**: SSE o polling — menos inmediato o más carga; mensajería externa — fuera de alcance.

## 6. Autorización y alcance de datos (FR-017 a FR-021, FR-031, FR-033, FR-034, FR-044, FR-049)

- **Decision**: clases de permiso centralizadas en `common/permissions.py` y `users/permissions.py`, más filtrado de `get_queryset` por alcance (administrador: todo; docente: propias y de sus espacios con responsabilidad activa; resto: propias). La interfaz solo oculta; el servidor decide.
- **Rationale**: una sola fuente de verdad en servidor; la SPA no es frontera de seguridad.
- **Alternatives**: permisos por objeto con django-guardian — sobredimensionado para tres roles.

## 7. Auditoría (FR-048, SC-005)

- **Decision**: modelo `AuditLog` (autor opcional, acción, objeto, valores anterior/nuevo, IP, fecha) escrito desde servicios/vistas en la misma transacción del cambio, para MFA, rol, estado, contraseña y eliminación de usuarios. Sin API de consulta en esta iteración (spec).
- **Rationale**: atomicidad entre cambio y registro.
- **Alternatives**: señales `post_save` genéricas — registrarían todo el CRUD, fuera de alcance, y perderían el autor.

## 8. Contrato, observabilidad y despliegue (FR-050)

- **Decision**: OpenAPI con drf-spectacular (`/api/schema/`, Swagger `/api/docs/`, ReDoc `/api/redoc/`), `GET /api/v1/health/` para componentes esenciales, Sentry opcional, CSP con django-csp, Docker Compose con Nginx.
- **Rationale**: documentación generada del código, sin divergencia.

## 9. Eliminación en cascada (FR-024, FR-032)

- **Decision**: mantener `on_delete=CASCADE` de reservas y responsabilidades hacia usuario y espacio (política vigente del spec); `reviewed_by` usa `SET_NULL`. Registrar en la auditoría la eliminación de usuarios.
- **Alternatives**: desactivación lógica — anotada en el spec como iteración futura.
