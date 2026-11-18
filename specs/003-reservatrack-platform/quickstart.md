# Quickstart: validación de ReservaTrack

Guía para comprobar de extremo a extremo que la plataforma funciona. Contratos en [contracts/](contracts/), entidades en [data-model.md](data-model.md).

## Prerrequisitos

- Docker y Docker Compose (PostgreSQL, Redis, backend, frontend), o bien Python 3.12 + Node con PostgreSQL y Redis locales.
- Variables de entorno de `backend/` (ver `backend/DEPLOYMENT.md`), incluida `MFA_ENCRYPTION_KEY` (clave Fernet).

## Arranque

```bash
cd backend && docker compose up -d --build        # API, Daphne, Postgres, Redis
docker compose exec backend python manage.py migrate
cd ../frontend && npm install && npm run dev      # SPA en Vite
```

Comprobar: `GET /api/v1/health/` responde correcto; `/api/docs/` carga Swagger.

## Pruebas automatizadas

```bash
cd backend && pytest                 # incluye backend/qa/ y tests por app
cd frontend && npm test -- --run && npm run lint && npm run build
```

## Escenarios de validación manual

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | Registrar usuario, iniciar sesión, ver perfil, cerrar sesión (US3) | rol `user`; tras logout el refresh falla |
| 2 | Solicitar un aula libre (US1) | código con año, estado `pending` |
| 3 | Segunda solicitud solapada en mismo espacio y fecha | 400 con conflicto; contigua (fin = inicio) se acepta |
| 4 | Auditorio capacidad 100 con 150 asistentes | rechazada |
| 5 | Dos solicitudes simultáneas de la misma franja (dos clientes en paralelo) | exactamente una se registra |
| 6 | Docente responsable aprueba; segunda revisión | estado + revisor + fecha; segunda → 409 |
| 7 | Con dos navegadores: crear solicitud y aprobarla | admin/responsable recibe aviso (no el solicitante); solicitante recibe el de revisión, < 5 s, sin recargar |
| 8 | Activar MFA, cerrar sesión, entrar con código; reutilizar código de recuperación | segundo uso rechazado |
| 9 | Admin (no superusuario) intenta asignar rol admin | 403 |
| 10 | Cambio de rol como superusuario | fila en `AuditLog` con valor anterior y nuevo |
| 11 | Usuario común abre `/usuarios` | redirigido al panel; la llamada directa a la API da 403 |
| 12 | Abrir módulo embebido | solo formulario; solo aulas, laboratorios, auditorios activos |

## Verificación de rendimiento (opcional)

Medir la consulta de espacios y disponibilidad de una fecha con datos de carga: p95 < 3 s (SC-007).

## Línea base (2026-11-16)

Cifras de la última corrida registrada en [docs/REPORTE_PRUEBAS_QA.txt](../../docs/REPORTE_PRUEBAS_QA.txt):

- Backend: `docker compose run --rm --no-deps web pytest` → 387 pruebas correctas. Requiere los servicios `db` y `redis` del compose; fuera de Docker el host `db` no resuelve.
- Frontend: `npx vitest run --maxWorkers=3` → 279 correctas (dos ejecuciones simultáneas dan falsos timeouts de workers); `npm run build` correcto.
- Limitaciones conocidas: ver §8 del reporte.
