# Despliegue de ReservaTrack

## Desarrollo local

Desde `backend/`, copia `docker-compose-override.yml.example` a
`docker-compose.override.yml` si necesitas acceder desde el host a Django,
PostgreSQL, Redis o Flower. Ese override publica los puertos de desarrollo;
el Compose base mantiene esos servicios únicamente en la red interna.

```powershell
Copy-Item docker-compose-override.yml.example docker-compose.override.yml
docker compose up --build
```

El frontend local se sirve por HTTPS en `https://localhost`; el certificado es
autofirmado. El backend directo queda en `http://localhost:8020` cuando se usa
el override.

Para incrustar el frontend en Timonel, define `TIMONEL_ALLOWED_ORIGINS` en
`backend/.env` con el origen HTTPS exacto del portal (por ejemplo,
`https://timonel.institucion.edu.co`). El Nginx del frontend añade ese origen a
`frame-ancestors`; si se deja vacío, solo permite ser incrustado por el mismo
origen. Para que las cookies de sesión viajen en un iframe de otro sitio,
configura `AUTH_COOKIE_SAMESITE=None` y sirve ReservaTrack exclusivamente por
HTTPS. Algunos navegadores bloquean cookies de terceros incluso con esa
configuración; en ese caso Timonel y ReservaTrack deben publicarse bajo el mismo
sitio o integrarse mediante el SSO institucional.

En producción, donde TLS y el proxy se administran fuera de este Compose,
configura allí la misma política `Content-Security-Policy` con
`frame-ancestors 'self' https://<origen-de-timonel>`.

El iframe abre la ruta `/timonel/reservas` sin la cabecera de navegación de
ReservaTrack. La aplicación ya no muestra su propia pantalla de login y el
inicio `/` abre siempre el dashboard. La integración de identidad de Timonel
queda pendiente: mientras no se conecte, las operaciones que requieren usuario
autenticado seguirán protegidas por el backend.

En Timonel, el módulo puede apuntar a esta URL:

```html
<iframe
  src="https://reservas.institucion.edu.co/timonel/reservas"
  title="Reserva de aulas y espacios académicos"
  width="100%"
  height="900"
></iframe>
```

## Producción

El despliegue productivo usa imágenes de dependencias `prod`, configuración
`config.settings.prod`, sin volúmenes de código del host y sin publicar puertos
de PostgreSQL, Redis o Flower. Django se publica solo en `127.0.0.1:8020` para
que un proxy del host se conecte sin exponer la API en la red pública. Se requiere Docker Compose v2.24 o
posterior por la etiqueta `!reset` que retira los volúmenes heredados del
Compose local. El proxy/TLS público debe dirigir tráfico HTTP y WebSocket a
`http://127.0.0.1:8020`.

1. Configura `backend/.env` con valores productivos. En particular, define una
   `DJANGO_SECRET_KEY` de al menos 50 caracteres, `DJANGO_ALLOWED_HOSTS` sin
   comodines, y URLs HTTPS para frontend, CORS y CSRF.
2. Construye y arranca PostgreSQL y Redis:

   ```powershell
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build db redis
   ```

3. Aplica migraciones una sola vez antes de actualizar la aplicación:

   ```powershell
   docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile migrate run --rm migrate
   ```

4. Arranca la API y los procesos de Celery:

   ```powershell
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```

La API usa Daphne/ASGI para HTTP y WebSocket. Worker y beat cargan la
configuración de producción y no ejecutan migraciones. Flower y Mailpit están
desactivados salvo que se habilite el perfil `debug`; el frontend HTTPS local
está desactivado salvo el perfil `local`.

## Operaciones frecuentes

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

`down` conserva el volumen de PostgreSQL. No añadas `-v` salvo que quieras
eliminar también los datos persistidos.

## Variables de entorno de seguridad

| Variable | Defecto | Efecto |
|---|---|---|
| `MFA_ENCRYPTION_KEY` | derivada de `SECRET_KEY` | Clave Fernet que cifra los secretos TOTP. Fíjala en producción para poder rotar `SECRET_KEY` sin des-enrolar usuarios. |
| `AXES_FAILURE_LIMIT` | 5 | Intentos fallidos de acceso antes del bloqueo (por usuario + IP). |
| `AXES_COOLOFF_TIME_HOURS` | 1 | Duración del bloqueo de acceso. |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | 60 | Vida del token de acceso. |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | 7 | Vida de la sesión renovable. |
| `THROTTLE_RATE_ANON` / `_USER` / `_LOGIN` / `_REGISTER` / `_MFA` | 60/min · 600/min · 10/min · 10/hour · 10/min | Límites de frecuencia. |
| `CHANNELS_REDIS_URL` | `redis://localhost:6379/3` | Capa de canales de las notificaciones en tiempo real. |
| `SEED_DEMO_USERS` | `false` (`true` solo en `docker-compose.yml` local) | Crea las cuentas de demostración; `docker-compose.prod.yml` lo fuerza a `false`. |

El bloqueo del segundo factor (5 fallos, 15 min) y la vigencia del paso intermedio del acceso MFA (5 min) están fijados en `backend/users/mfa.py`. La contraseña exige mínimo 10 caracteres y no ser común (`AUTH_PASSWORD_VALIDATORS`).
