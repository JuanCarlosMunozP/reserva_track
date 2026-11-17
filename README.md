# ReservaTrack

Aplicación web para consultar espacios institucionales (aulas, laboratorios, auditorios), solicitar su uso sin cruces de horario, revisar solicitudes con avisos en tiempo real y administrar usuarios, catálogos y responsables. Desarrollada con Spec-Driven Development (SDD) y GitHub Spec Kit.

## Stack

| Capa | Tecnología |
| --- | --- |
| Backend | Python 3.12, Django 5.2, Django REST Framework, Channels (WebSocket), Celery |
| Frontend | React 19, TypeScript, Vite, Tailwind 4 |
| Datos | PostgreSQL 16, Redis 7 |
| Infraestructura | Docker Compose, Nginx (HTTPS autofirmado) |

## Requisitos de instalación

- Docker y Docker Compose (camino recomendado).
- Alternativa sin Docker: Python 3.12, Node 22, PostgreSQL y Redis locales.

## Configuración

Las variables de entorno están documentadas en [backend/.env.example](backend/.env.example).

```powershell
cd backend
Copy-Item .env.example .env
```

Edite `backend/.env` y fije como mínimo `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD` y `MFA_ENCRYPTION_KEY` (genérela con `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`). `.env` está en `.gitignore`: nunca se versiona.

| Variable | Uso |
| --- | --- |
| `DJANGO_SECRET_KEY` | Clave de Django |
| `MFA_ENCRYPTION_KEY` | Clave Fernet que cifra los secretos TOTP |
| `POSTGRES_*` | Conexión a la base de datos |
| `REDIS_URL`, `CELERY_*`, `CHANNELS_REDIS_URL` | Redis, Celery y WebSocket |
| `CORS_ALLOWED_ORIGINS`, `FRONTEND_BASE_URL` | Orígenes permitidos |
| `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE` | Cookies httpOnly de sesión |

## Ejecución

```powershell
cd backend
docker compose up --build
```

- Aplicación: <https://localhost> (certificado autofirmado: acepte la advertencia del navegador).
- Documentación de la API (Swagger): `/api/docs/`. Estado del sistema: `/api/v1/health/`.
- Para acceder desde el host a Django, PostgreSQL o Redis, copie `docker-compose-override.yml.example` a `docker-compose.override.yml` (ver [backend/DEPLOYMENT.md](backend/DEPLOYMENT.md)).

### Cuentas de demostración

En el Compose local (`SEED_DEMO_USERS=true`) se crean al arrancar cuatro cuentas: `ingeniero.demo`, `admin.demo`, `estudiante.demo` y `docente.demo`. El comando `seed_demo_users` lee sus contraseñas del archivo local `backend/credenciales.txt` (formato `usuario:contraseña`, una por línea). Solo para entorno local; no se usan en producción.

## Flujo principal para la demostración

1. Registrarse o entrar como `estudiante.demo`.
2. Elegir un espacio activo y solicitar una franja (07:00–21:00). Se genera un código `RT-AAAA-NNNN` en estado *pendiente*.
3. Intentar una segunda solicitud que se cruce: el sistema la rechaza. Una contigua se acepta.
4. En otro navegador, entrar como `admin.demo` o como el docente responsable: llega un aviso en tiempo real sin recargar.
5. Aprobar o rechazar la solicitud: el solicitante recibe el aviso de revisión. Una segunda revisión devuelve 409.
6. Extras: cancelar una solicitud antes de su inicio, activar MFA con una app autenticadora, gestionar usuarios y roles (solo el superusuario asigna rol administrador).

La lista completa de escenarios de validación está en [specs/003-reservatrack-platform/quickstart.md](specs/003-reservatrack-platform/quickstart.md).

## Pruebas

```powershell
# Backend (con los servicios db y redis levantados)
cd backend
docker compose run --rm --no-deps web pytest

# Frontend
cd frontend
npx vitest run --maxWorkers=3
npm run build
```

Resultados registrados (2026-11-16): 387 pruebas de backend y 279 de frontend, todas correctas, más un recorrido de extremo a extremo de 28 comprobaciones contra el sistema real. Detalle, casos y **limitaciones conocidas** en [docs/REPORTE_PRUEBAS_QA.txt](docs/REPORTE_PRUEBAS_QA.txt).

## Artefactos SDD

La especificación vigente es la **003**. Los demás documentos son de apoyo o históricos.

| Artefacto | Ubicación |
| --- | --- |
| Constitución | [.specify/memory/constitution.md](.specify/memory/constitution.md) |
| Especificación (con Non-Goals) | [specs/003-reservatrack-platform/spec.md](specs/003-reservatrack-platform/spec.md) |
| Plan técnico y decisiones | [specs/003-reservatrack-platform/plan.md](specs/003-reservatrack-platform/plan.md) |
| Tareas | [specs/003-reservatrack-platform/tasks.md](specs/003-reservatrack-platform/tasks.md) |
| Investigación, modelo de datos, contratos | `specs/003-reservatrack-platform/` (`research.md`, `data-model.md`, `contracts/`) |
| Descripción de origen (histórica) | [specs/001-reservatrack/spec.md](specs/001-reservatrack/spec.md) |
| Análisis inicial por ingeniería inversa (histórico) | [docs/analisis-inicial/](docs/analisis-inicial/) |

## Decisiones de diseño

- **Autorización en el servidor:** la interfaz solo refleja permisos; la API devuelve 403 aunque se invoque una operación oculta.
- **Cero solapes:** la creación y edición de reservas bloquean la fila del espacio dentro de una transacción.
- **Desactivar en vez de borrar:** usuarios y espacios con reservas se desactivan; las reservas se conservan.
- **Cancelación:** el solicitante o un administrador, antes del inicio de la reserva.
- **Horario permitido:** 07:00–21:00 (`RESERVATION_OPEN_TIME` / `RESERVATION_CLOSE_TIME`).
- **Sesión:** JWT en cookies httpOnly con CSRF; MFA por TOTP con códigos de recuperación de un solo uso.
- **Auditoría transaccional** de cambios sensibles (rol, estado, contraseña, baja, MFA).
- **Avisos en tiempo real** por WebSocket (Channels + Redis), sin correo.

## Fuera de alcance (Non-Goals)

Duración máxima y anticipación, reservas recurrentes o de varios espacios, listas de espera, reportes e historial funcional, correo y notificaciones móviles, app nativa, SSO, sincronización con calendarios, aprobación multinivel, recuperación de contraseña por correo, otros segundos factores, varios idiomas y pagos. Lista completa en la spec 003.

## Limitaciones y pendientes

- Sin prueba manual ni E2E automatizada con clics en navegador (la UI se valida con Vitest).
- Sin medición de rendimiento con datos de volumen (SC-007, p95 < 3 s).
- Reducir la capacidad de un espacio no revalida reservas existentes.
- La disponibilidad para usuarios sin alcance total es parcial; el conflicto real se detecta al solicitar.
- El módulo embebido requiere sesión previa (sin SSO).
- Quién consulta la auditoría y su retención no están definidos.

Lista completa en la sección 8 del [reporte de pruebas](docs/REPORTE_PRUEBAS_QA.txt).

## Estructura

```
backend/    API Django, Channels, Celery, pruebas (qa/ y por app)
frontend/   SPA React + Vite
specs/      Especificaciones SDD (001 origen, 003 vigente)
.specify/   Constitución, plantillas y scripts de Spec Kit
docs/       Reporte de pruebas y análisis inicial
```

## Equipo

| Integrante | Aporte |
| --- | --- |
| _completar_ | _completar_ |
