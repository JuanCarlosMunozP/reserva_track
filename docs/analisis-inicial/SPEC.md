# Especificación de ReservaTrack

> **Documento de análisis inicial (ingeniería inversa, 2026-11-11/13).** La especificación vigente es [specs/003-reservatrack-platform/spec.md](../../specs/003-reservatrack-platform/spec.md); ante cualquier diferencia prevalece la spec 003 y su plan/tareas. Se conserva como referencia histórica.

**Tipo:** especificación funcional y técnica obtenida por ingeniería inversa  
**Versión del documento:** 1.1  
**Fecha:** 11 de noviembre de 2026  
**Cambios en 1.1:** refleja las correcciones de notificaciones, tipo de usuario, revocación de sesiones y borrado de catálogos; detalle de flujos en [SSD.md](SSD.md).  
**Base de análisis:** código fuente de `backend/`, `frontend/` y configuración de despliegue.  
**Criterio:** describe el comportamiento implementado y señala aparte las limitaciones detectadas. No constituye una propuesta de funcionalidades futuras.

## 1. Propósito y alcance

ReservaTrack es una aplicación web para consultar espacios institucionales, solicitar su uso y gestionar las solicitudes. Incluye administración de usuarios y responsables, catálogos de ubicación, autenticación multifactor y notificaciones por WebSocket.

La solución comprende:

- Interfaz web de una sola página desarrollada con React, TypeScript y Vite.
- API REST versionada en `/api/v1/`, implementada con Django REST Framework.
- Persistencia relacional en PostgreSQL.
- Redis para la capa de canales y el broker/resultados de Celery.
- Nginx como servidor del frontend y proxy de API, media y WebSocket en Docker.
- OpenAPI, Swagger UI y ReDoc para describir/explorar la API.

## 2. Actores y permisos

Los permisos de la API combinan el rol institucional, el tipo de usuario y, para ciertas acciones, la asignación del espacio. La autorización del servidor es la regla efectiva; la matriz de React controla visibilidad y navegación.

| Actor | Facultades observadas |
| --- | --- |
| Superusuario | Acceso completo a los recursos protegidos. Puede crear o modificar usuarios y asignar/quitar rol administrador. |
| Administrador (`admin`) | Consultar y modificar usuarios; administrar sedes y catálogos; crear, modificar y eliminar espacios; consultar y revisar reservas; administrar responsables. |
| Usuario estudiante (`usuario` + `student`) | Consultar espacios y sus propias reservas; crear solicitudes. |
| Usuario docente (`usuario` + `teacher`) | Consultar sus propias reservas y las de espacios asignados; crear reservas; revisar solicitudes de espacios asignados. |
| Personal administrativo (`usuario` + `personal_administrator`) | Consultar reservas; crear solicitudes; consultar responsabilidades y asignar responsables en espacios que tiene asignados; editar esos espacios. |
| Visitante | Registro público y lectura de espacios/sedes/catálogos que exponen endpoints de lectura pública. |

Las rutas de usuarios requieren rol administrador o superusuario en el frontend. Las rutas de responsabilidades también se muestran al personal administrativo. Esta protección de interfaz no reemplaza los permisos de API.

## 3. Capacidades funcionales

### 3.1 Acceso y cuenta

- Iniciar sesión con usuario y contraseña.
- Para el cliente web, recibir JWT en cookies `httpOnly`; existe también un endpoint JWT que devuelve tokens en el cuerpo para clientes externos.
- Cuando MFA está habilitado, la contraseña inicia un desafío temporal y el acceso requiere TOTP o código de recuperación.
- Registrar una cuenta pública con nombre de usuario, correo, nombres, apellidos, tipo y contraseña; curso y área son datos opcionales.
- Consultar el perfil autenticado mediante `users/me/`.
- Cerrar sesión invalidando el refresh token y eliminando las cookies web.
- Al cambiar la contraseña de un usuario se invalidan sus demás sesiones (refresh tokens en lista negra); quien cambia la propia conserva la sesión actual. Un access token ya emitido vale hasta su expiración.
- Gestionar MFA: estado, enrolamiento con QR/secreto, confirmación, códigos de recuperación, regeneración y desactivación.

### 3.2 Espacios y ubicaciones

- Consultar, buscar y filtrar espacios por categoría y estado.
- Crear, editar y eliminar espacios según permisos.
- Cada espacio registra nombre, descripción, categoría, capacidad, ubicación, estado activo y responsables vigentes.
- La ubicación puede ser texto libre o una referencia normalizada a `Location`.
- Categorías disponibles: laboratorio, aula, deportivo, sala, auditorio y otro.
- Catálogo geográfico: departamento → ciudad → sede; la ubicación puntual relaciona sede, área y detalle.
- Asignar a un usuario activo de rol usuario la responsabilidad sobre un espacio. La combinación usuario/espacio es única; la relación puede desactivarse.

### 3.3 Reservas

- Crear solicitudes por tipo: aulas piden motivo; laboratorios piden asignatura y grupo; auditorios piden asignatura, grupo y asistentes.
- Solo se aceptan espacios activos al crear o modificar una reserva.
- El servidor asigna solicitante, código `RT-AAAA-NNNN` y estado inicial `pending`.
- Consultar solicitudes: administradores ven todas; docentes ven las de espacios que tienen asignados; otros usuarios ven sus propias solicitudes.
- Aprobar o rechazar una solicitud pendiente. Se registra revisor y fecha de respuesta.
- Estados: `pending`, `approved`, `rejected`, `canceled`.
- Solo solicitudes pendientes pueden aprobarse o rechazarse; otro intento de revisión devuelve HTTP 409.
- Al crear una solicitud se notifica por WebSocket a administradores y responsables activos del espacio; al revisarla, solo al solicitante.
- No se permiten horas finales iguales o anteriores al inicio. No se admiten cruces horarios en el mismo espacio y fecha cuando la otra solicitud está pendiente o aprobada.

### 3.4 Paneles y navegación web

Rutas principales: `/registro`, `/` (dashboard), `/espacios`, `/disponibilidad`, `/reservas`, `/usuarios`, `/responsables` y `/seguridad`. La interfaz no presenta login propio; `/` siempre muestra el dashboard. Las páginas `/historial` y `/reportes` redirigen al panel.

El módulo embebible para Timonel está en `/timonel/reservas`; se muestra sin la navegación principal y limita su selector a aulas, laboratorios y auditorios activos. `TIMONEL_ALLOWED_ORIGINS` configura los orígenes que pueden incrustar el frontend. La autenticación institucional SSO no está integrada y el backend conserva sus permisos para mutaciones.

La interfaz ofrece panel, consulta de disponibilidad, gestión de espacios y reservas, usuarios, responsables y seguridad/MFA. Algunas vistas pueden mostrar datos demo desde `localStorage` si las llamadas a la API fallan.

## 4. Reglas de negocio y datos

| Entidad | Atributos y relaciones relevantes |
| --- | --- |
| Usuario | Username y email únicos; nombre, apellido, rol, tipo, curso, área, estado y marcas de creación/actualización. Tipos: estudiante, docente, personal administrativo. El tipo es obligatorio al crear por `POST /users/` y no se puede modificar por la API. |
| Espacio | Nombre, descripción, categoría, capacidad positiva, ubicación, estado y fechas. Puede apuntar a una ubicación del catálogo. |
| Responsabilidad | Usuario, espacio, fecha de asignación y estado activo. Restricción única por usuario y espacio. |
| Reserva | Código único, solicitante, espacio, fecha, intervalo horario, estado, motivo, asignatura, grupo, asistentes opcionales, revisor y marcas de solicitud/respuesta. Asignatura/grupo se requieren para laboratorio y auditorio; asistentes se requieren para auditorio y no pueden superar su capacidad. |
| Sede/catálogo | Departamento, ciudad, sede, área y ubicación puntual; restricciones únicas evitan duplicados dentro del ámbito correspondiente. |
| MFA | Un dispositivo por usuario; secreto cifrado, estado confirmado, contador de intentos/bloqueo y códigos de recuperación almacenados como hashes de un solo uso. |
| Auditoría | Actor opcional, acción, modelo/objeto, cambios JSON, IP y fecha. Se registran, entre otros, eventos de MFA. |

Las claves foráneas de catálogos usan protección contra eliminación cuando hay dependencias; las relaciones de espacios/reservas con usuario o espacio se eliminan en cascada según los modelos.

## 5. API observada

Prefijo REST: `/api/v1/`. Las colecciones usan paginación por defecto de 20 registros y admiten filtrado/búsqueda/ordenamiento cuando está configurado.

| Recurso | Operaciones y reglas destacadas |
| --- | --- |
| `/spaces/` | CRUD; lectura pública; filtros `category`, `is_active`; búsqueda por nombre, descripción y ubicación. |
| `/reservations/` | CRUD sujeto a permisos; filtros por espacio, fecha y estado; búsqueda por código, motivo, usuario y espacio. Acciones `POST /{id}/approve/` y `POST /{id}/reject/`. |
| `/users/` | Perfil `GET /me/`; ver y editar: administrador o el propio usuario; crear, eliminar y restablecer MFA: solo superusuario; asignar o retirar el rol administrador: solo superusuario. |
| `/responsibilities/` | CRUD sujeto a rol, tipo y ámbito de asignación. |
| `/branches/`, `/departments/`, `/cities/`, `/areas/`, `/locations/` | Catálogos; lectura pública y escritura protegida. Ciudades filtrables por departamento; ubicaciones por sede y área. Eliminar un elemento con dependencias devuelve 409. |
| `/auth/register/` | `POST` público con límite de frecuencia dedicado. |
| `/auth/token/` | Login JWT para clientes que reciben tokens en el cuerpo. |
| `/auth/token/refresh/`, `/auth/token/verify/`, `/auth/token/blacklist/` | Renovación, verificación y blacklist JWT para clientes que usan tokens en el cuerpo. |
| `/auth/token/cookie/`, `/auth/token/cookie/refresh/`, `/auth/token/cookie/logout/` | Login, renovación y cierre de sesión del navegador con cookies y protección CSRF. |
| `/auth/mfa/*` | Verificación de segundo factor y administración del MFA autenticado. |
| `/health/` | Estado de PostgreSQL y Redis; devuelve `ok` o `degraded` y estado HTTP 200 o 503. |
| `/api/schema/`, `/api/docs/`, `/api/redoc/` | Esquema OpenAPI, Swagger UI y ReDoc. |

## 6. Interfaces y comunicación

- REST intercambia JSON; autenticación normal del navegador usa cookies JWT y `X-CSRFToken` para operaciones mutables.
- WebSocket: `/ws/notifications/`, autenticado a través de cookies. Cada conexión se une al grupo global `notifications` y a un grupo privado `user.<id>`. La conexión se comparte en el frontend y se reconecta con espera exponencial y jitter; un cierre por autenticación inválida (4401) no se reintenta.
- El consumidor es de solo lectura para el cliente: los mensajes entrantes se ignoran. Eventos de reservas: `reservation_created` y `reservation_reviewed`, con `reservation_id`, `code`, `space_name`, `date`, `start_time`, `end_time` y `status`; se publican al confirmarse la transacción (`reservations/notifications.py`). Las pruebas de `realtime/tests/test_notifications.py` están comentadas.
- El frontend conserva datos de demostración en `localStorage` bajo claves `reservatrack.demo.*`; la semilla incluye registros ficticios.

## 7. Requisitos no funcionales y operación

### Seguridad observada

- Contraseñas validadas por Django; longitud mínima configurada de 10 caracteres para validadores generales. Algunos serializadores establecen además mínimos propios.
- MFA TOTP; secreto cifrado en reposo, códigos de recuperación representados por HMAC y prevención de reutilización del paso TOTP.
- Cookies JWT `httpOnly`; en producción `Secure`, HTTPS obligatorio, HSTS, CSRF, CSP, límites de frecuencia, bloqueo por intentos y cabeceras de seguridad.
- Producción rechaza clave secreta insegura/corta, hosts comodín y orígenes/URL públicos que no sean HTTPS.
- Los serializers aplican normalización/sanitización de texto en los recursos que heredan `SanitizedSerializerMixin`.

### Despliegue observado

Docker Compose define PostgreSQL 16, Redis 7, Django, worker y beat de Celery, Flower, frontend/Nginx y Mailpit. Los servicios internos no publican puertos en la configuración base; producción publica Django únicamente en `127.0.0.1:8020` para el proxy del host. La zona horaria de Django y Celery es `America/Bogota`. Nginx enruta `/api/`, `/media/` y `/ws/` hacia Django en el entorno local. El README del frontend describe HTTPS local con certificado autofirmado.

### Configuración

La configuración se suministra principalmente por variables de entorno: clave Django, hosts/orígenes, PostgreSQL, Redis, cookies, JWT, correo, almacenamiento S3 y Sentry. Los valores de desarrollo no deben considerarse configuración de producción.

## 8. Límites y discrepancias detectadas

Estos puntos describen el estado del repositorio y requieren decisión funcional/técnica antes de considerarlos requisitos resueltos:

1. **Fallback demo mezclado con API:** `reservaTrack.service.ts` recurre a `localStorage` ante ciertos errores HTTP o de red. La interfaz puede mostrar o guardar datos locales cuando el backend rechaza una operación, y el modo demo contiene un solicitante fijo. Esto puede ocultar indisponibilidad y divergencias entre clientes.
2. **Vistas de historial y reportes:** las rutas existen, pero redirigen al panel; no se observa una funcionalidad activa de historial/reportes en la navegación actual.
3. **Cancelación:** el estado `canceled` está definido y aparece en datos demo, pero no se observa una acción API dedicada que aplique cancelación.
4. **Validación de disponibilidad:** se bloquean cruces entre estados pendiente/aprobado, incluso al serializar altas concurrentes del mismo espacio. No se observan restricciones de horario laboral, duración máxima o anticipación en la API.
5. **Auditoría:** existe el modelo y hay uso en operaciones MFA; no se aprecia instrumentación uniforme de CRUD general en los viewsets analizados.
6. **Notificaciones:** cubren creación y revisión de reservas. No hay avisos por edición de una reserva, cambio de estado de un espacio ni cancelación, ni notificación por correo. Las pruebas del consumidor WebSocket siguen comentadas y los avisos solo se probaron con un channel layer simulado.
7. **Eliminación en cascada:** borrar un espacio o un usuario elimina también sus reservas (incluidas las aprobadas). Desactivar un espacio bloquea nuevas reservas pero no cancela las existentes.
8. **Permisos:** las matrices de frontend y backend son similares, pero la interfaz no es la fuente de autoridad. Las operaciones deben verificarse siempre contra la autorización del servidor.

## 9. Supuestos y elementos fuera de alcance

- La especificación refleja el código encontrado, no una validación con usuarios institucionales ni una aprobación de reglas operativas.
- No se infieren políticas de aprobación, calendarios, horarios institucionales, cancelación, retención de datos o niveles de servicio que no estén implementados explícitamente.
- El prototipo visual no se toma como prueba suficiente de una función implementada.
- No se incluyen valores de secretos, contraseñas, tokens ni contenidos de archivos de credenciales.

## 10. Referencias de implementación

- Backend: `backend/config/urls.py`, `backend/config/settings/`, y aplicaciones `users`, `spaces`, `reservations`, `branches`, `audit`, `realtime` y `common`.
- Frontend: `frontend/src/App.tsx`, `frontend/src/pages/`, `frontend/src/services/`, `frontend/src/lib/` y `frontend/src/types/`.
- Infraestructura: `backend/docker-compose.yml`, `backend/docker-compose.prod.yml`, `backend/DEPLOYMENT.md`, `frontend/Dockerfile`, `frontend/nginx.conf` y `frontend/README.md`.

## 11. Cambios de la verificación contra `specs/003-reservatrack-platform` (15 nov 2026)

- Los usuarios que no son administradores, ni el superusuario, pueden modificar su propia solicitud mientras esté pendiente; solo el administrador la modifica en cualquier estado.
- El personal administrativo puede desactivar y reactivar responsables de los espacios donde es responsable activo.
- El registro público aplica la unicidad de usuario sin distinguir mayúsculas y los validadores de contraseña (mínimo 10 caracteres, no común).
- `GET /api/v1/health/` ya no devuelve el texto de las excepciones: informa `error` y registra el detalle.
- Los cambios de usuario y su registro de auditoría se confirman en la misma transacción.
- Discrepancia abierta: esta especificación dice que curso y área son opcionales, pero el registro exige curso a estudiantes y área a docentes.
