# ReservaTrack Constitution

## Core Principles

### I. Autorización siempre en el servidor
Toda decisión de acceso MUST tomarse en el servidor, por rol, tipo de usuario y responsabilidad
activa. La interfaz solo refleja permisos para la presentación y NO MUST ser la única barrera:
invocar directamente una operación oculta MUST devolver 403 desde la API.
Razón: un control solo visual se salta con una petición manual.

### II. Cero solapes de reservas
Dos reservas pendientes o aprobadas del mismo espacio y fecha NO MUST cruzarse, tampoco con
solicitudes simultáneas. La creación y la modificación MUST bloquear la fila del espacio dentro de
una transacción y validar el cruce antes de guardar. Las franjas contiguas se permiten; las
rechazadas y canceladas no bloquean el horario.
Razón: un doble reservado es el fallo más visible para el usuario y no se corrige después.

### III. Auditoría en la misma transacción
Los cambios sensibles (rol, estado, contraseña, baja de usuarios, eventos de MFA) MUST registrar
autor, acción, objeto, valor anterior, valor nuevo, IP de origen y fecha en la misma transacción
que el cambio. Nunca se guarda la contraseña ni su hash; solo el hecho del cambio.
Razón: sin atomicidad puede existir un cambio sin rastro, o un rastro de un cambio que no ocurrió.

### IV. No borrar datos con historial
Un usuario o un espacio que tiene reservas MUST desactivarse en lugar de borrarse, conservando sus
reservas y la auditoría. Solo se borra lo que no tiene historial. Un espacio inactivo MUST rechazar
nuevas reservas y conservar las existentes.
Razón: borrar en cascada destruye el historial que respalda auditorías y reclamos.

### V. Seguridad por defecto
La sesión MUST ir en cookies httpOnly con protección CSRF. El segundo factor TOTP MUST usar códigos
de recuperación de un solo uso y secretos cifrados. MUST existir bloqueo por intentos fallidos y
límites de frecuencia en acceso, registro y MFA. La producción MUST exigir una `SECRET_KEY` de al
menos 50 caracteres y rechazar orígenes que no sean HTTPS ni admitan hosts comodín.
Razón: la configuración insegura debe fallar al arrancar, no pasar a producción.

### VI. Los avisos nunca rompen la operación
Las notificaciones en tiempo real MUST emitirse después de confirmar la transacción. Cualquier fallo
del envío MUST registrarse y NO MUST afectar a la operación que lo originó. Cada aviso MUST llegar
solo a sus destinatarios.
Razón: la reserva es la fuente de verdad; el aviso es un efecto secundario.

### VII. Pruebas obligatorias (NON-NEGOTIABLE)
Toda regla del spec MUST tener una prueba automatizada. El backend MUST mantener 100 % de cobertura
y el frontend 100 % de líneas. Una tarea NO MUST marcarse completa sin evidencia (prueba o escenario
ejecutado), y una prueba manual no ejecutada MUST declararse como tal.
Razón: sin evidencia, "hecho" es una opinión.

### VIII. Sin demostración ni secretos reales en producción
Los datos de demostración MUST estar limitados al desarrollo; en producción los errores de la API
se muestran en lugar de sustituirse por datos de ejemplo. Los archivos con credenciales reales NO
MUST versionarse ni publicarse. Los textos de error NO MUST exponer detalles internos.
Razón: datos inventados ocultan fallos reales y los secretos filtrados no se pueden retirar.

## Restricciones adicionales

- Pila: Django 5 y DRF con PostgreSQL, Redis, Celery y Channels; React y Vite con TypeScript.
  Cambiarla exige una enmienda de esta constitución.
- La API MUST estar versionada (`/api/v1/`) y documentada con OpenAPI.
- Los valores operativos (horario permitido, límites de frecuencia, duración de sesión, bloqueos)
  MUST ser configurables por variables de entorno.
- El horario permitido de reservas MUST validarse en el servidor.

## Flujo de desarrollo y puertas de calidad

- Todo cambio de comportamiento MUST partir del spec en `specs/<feature>/`, y plan y tasks MUST
  mantenerse alineados con él.
- Antes de dar un cambio por terminado: la suite completa del backend y del frontend pasa, `tsc -b`
  no da errores y la cobertura cumple el principio VII.
- Las decisiones funcionales pendientes MUST consultarse al responsable del producto y NO MUST
  inferirse; hasta entonces quedan documentadas como pendientes.
- Los informes de pruebas MUST reflejar cifras verificadas con una corrida real.

## Governance

Esta constitución prevalece sobre otras prácticas del proyecto. Las enmiendas MUST documentarse con
su motivo y fecha, y actualizar los specs, planes y tareas afectados. El versionado es semántico:
MAJOR para eliminar o redefinir un principio de forma incompatible, MINOR para añadir un principio
o ampliar una guía de forma material, PATCH para aclaraciones. Toda revisión de cambios y toda
ejecución de `/speckit-plan` y `/speckit-analyze` MUST verificar el cumplimiento de estos principios,
y cualquier excepción MUST justificarse por escrito.

**Version**: 1.0.0 | **Ratified**: 2026-11-16 | **Last Amended**: 2026-11-16
