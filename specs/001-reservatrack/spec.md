# ReservaTrack — Especificación funcional

## Features principales

### 1. Registro y acceso de cuentas

- Un visitante puede registrarse con nombre de usuario, correo electrónico, nombres, apellidos, tipo de usuario (estudiante, docente o personal administrativo) y contraseña. Curso y área son datos opcionales.
- Toda cuenta registrada públicamente queda con el rol de usuario común; **el registro público nunca puede crear administradores**.
- **El nombre de usuario y el correo electrónico son únicos, sin distinguir mayúsculas de minúsculas.**
- **La contraseña debe cumplir las reglas mínimas de seguridad de la institución** (longitud mínima y rechazo de contraseñas comunes).
- Un usuario puede iniciar sesión con nombre de usuario y contraseña, consultar su propio perfil y cerrar sesión.
- **Tras varios intentos fallidos de acceso, el sistema bloquea temporalmente el ingreso** y limita la frecuencia de intentos de registro y de acceso. Los umbrales exactos: **Por definir**.
- **Al cerrar sesión, la sesión deja de ser renovable.**
- **Cuando se cambia la contraseña de una cuenta, se cierran sus demás sesiones activas; quien cambia la propia contraseña conserva la sesión en la que está.**
- Cuando la sesión expira, el sistema la renueva sin pedir credenciales mientras la sesión siga vigente; si ya no es válida, pide iniciar sesión de nuevo.

### 2. Autenticación multifactor (MFA)

- Un usuario autenticado puede ver si su MFA está activo y cuántos códigos de recuperación le quedan.
- Un usuario puede activar MFA: el sistema muestra un código QR y una clave manual para su aplicación autenticadora, y la activación solo se completa al ingresar un código válido de esa aplicación.
- Al activar MFA, el sistema entrega un conjunto de códigos de recuperación, **mostrados una sola vez**.
- Con MFA activo, iniciar sesión exige primero la contraseña y después un código de la aplicación autenticadora o un código de recuperación.
- **Cada código de recuperación solo puede usarse una vez, y un mismo código de la aplicación no se acepta dos veces.**
- **El paso intermedio del acceso con MFA es temporal y se invalida si la contraseña cambia.**
- **Tras varios intentos fallidos del segundo factor, la cuenta queda bloqueada durante un tiempo, y mientras dure el bloqueo ni siquiera un código correcto es aceptado.** Cantidad de intentos y duración: **Por definir**.
- Un usuario puede regenerar sus códigos de recuperación indicando un código vigente de la aplicación (**un código de recuperación no sirve para generar otros**); los códigos anteriores dejan de valer.
- Un usuario puede desactivar su MFA indicando su contraseña y un código vigente.
- El ingeniero de software (superusuario) puede restablecer el MFA de otro usuario que perdió su dispositivo y sus códigos.
- **Toda activación, desactivación, regeneración de códigos, uso de un código de recuperación y restablecimiento por un tercero queda registrada en la auditoría.**

### 3. Gestión de usuarios y roles

- El sistema distingue tres perfiles de acceso: **superusuario (ingeniero de software), administrador y usuario común**; los usuarios comunes tienen además un tipo (estudiante, docente o personal administrativo).
- Un administrador o superusuario puede listar, consultar y editar usuarios; puede activarlos y desactivarlos.
- Solo el superusuario puede crear usuarios desde la administración, eliminarlos y restablecer su MFA.
- **Solo el superusuario puede asignar o retirar el rol de administrador.**
- El personal administrativo puede listar únicamente usuarios activos de rol usuario, para asignarlos como responsables.
- Un usuario puede ver y editar sus datos personales y cambiar su propia contraseña indicando la contraseña actual.
- **Un usuario no puede modificar su propio rol, estado ni privilegios.**
- **Un superusuario no puede eliminar su propia cuenta.**
- Un administrador puede restablecer la contraseña de otro usuario sin conocer la actual.
- **El tipo de usuario es obligatorio al crear la cuenta; una vez creada, no puede modificarse mediante el sistema.**
- **Al eliminar un usuario se eliminan también sus reservas y responsabilidades.** Si esta política es la deseada o debe sustituirse por desactivación: **Por definir**.
- **Los cambios de rol, de estado y de contraseña quedan registrados en la auditoría con el valor anterior y el nuevo.**

### 4. Catálogo de ubicaciones

- Un administrador puede crear, consultar, editar y eliminar departamentos, ciudades, sedes, áreas y ubicaciones puntuales (sede + área + detalle).
- Cada ciudad pertenece a un departamento y cada sede puede asociarse a una ciudad.
- **Los nombres de departamento, área y sede son únicos; no puede haber dos ciudades con el mismo nombre en un mismo departamento, ni dos ubicaciones iguales (misma sede, área y detalle).**
- **Un elemento del catálogo que tiene dependencias (por ejemplo, una ciudad con sedes, o una ubicación usada por un espacio) no puede eliminarse; el sistema informa del conflicto y lo conserva.**
- La consulta del catálogo es pública; **solo administradores y superusuarios pueden modificarlo**. El personal administrativo no tiene permiso de escritura.
- Las ciudades pueden filtrarse por departamento y las ubicaciones por sede y área.

### 5. Gestión de espacios

- Cualquier visitante puede consultar espacios, buscarlos por nombre, descripción o ubicación y filtrarlos por categoría y estado.
- Cada espacio registra nombre, descripción, categoría (laboratorio, aula, deportivo, sala, auditorio u otro), capacidad, ubicación, estado activo/inactivo y sus responsables vigentes.
- La ubicación de un espacio puede escribirse como texto o elegirse del catálogo; si se elige del catálogo y no se escribe texto, el sistema completa la ubicación a partir de la elegida.
- **La capacidad debe ser al menos 1 y cada espacio debe tener una ubicación (texto o catálogo).**
- Solo un administrador puede crear y eliminar espacios.
- Un administrador puede editar cualquier espacio; el personal administrativo solo puede editar los espacios en los que es responsable activo.
- **Un espacio desactivado no admite nuevas reservas, pero conserva las existentes.**
- **Eliminar un espacio elimina también sus reservas y responsabilidades.** Si esta política es la deseada o debe sustituirse por una restricción (por ejemplo, impedir el borrado con reservas vigentes): **Por definir**.
- **Cambiar la capacidad de un espacio no revalida las reservas de auditorio ya existentes.** El tratamiento deseado: **Por definir**.

### 6. Responsables de espacios

- Un administrador o un miembro del personal administrativo puede asignar a un usuario como responsable de un espacio, y puede desactivar o reactivar esa responsabilidad.
- **Solo pueden ser responsables usuarios activos de rol usuario; un administrador no puede ser responsable.**
- **Un usuario solo puede tener una responsabilidad por espacio.**
- **El personal administrativo solo puede asignar responsables en los espacios donde él mismo es responsable activo;** el administrador no tiene esa restricción.
- Los usuarios con permiso pueden consultar las responsabilidades vigentes de cada espacio.
- **Los docentes responsables de un espacio pueden revisar las solicitudes de ese espacio** (ver módulo 9).

### 7. Consulta de disponibilidad

- Un visitante o usuario puede consultar los espacios y sus franjas de ocupación para una fecha.
- Cada usuario ve las reservas según su alcance: **el administrador ve todas; el docente ve las propias y las de sus espacios; los demás usuarios ven solo las propias.**
- **La disponibilidad mostrada a un usuario sin alcance total es parcial; el conflicto real siempre se detecta al solicitar la reserva (módulo 8).**
- Las reservas pueden filtrarse por espacio, fecha y estado, y buscarse por código, motivo, solicitante o espacio.

### 8. Solicitud de reservas

- Un estudiante, docente, personal administrativo o administrador autenticado puede solicitar un espacio indicando espacio, fecha, hora de inicio y hora de fin.
- Los datos adicionales dependen de la categoría del espacio: **un aula pide motivo; un laboratorio pide asignatura y grupo; un auditorio pide asignatura, grupo y número de asistentes.**
- **El número de asistentes de un auditorio no puede superar su capacidad.**
- **Solo se pueden solicitar espacios activos.**
- **La hora de fin debe ser posterior a la de inicio.**
- **No se admite ninguna solicitud que se cruce en horario con otra pendiente o aprobada del mismo espacio y fecha; las rechazadas y canceladas no bloquean el horario.** Esta regla se mantiene aun si dos personas solicitan al mismo tiempo.
- El sistema asigna automáticamente el solicitante, un código único legible (con el año) y el estado inicial «pendiente»; el usuario no puede elegirlos.
- Cuando el motivo de un laboratorio o auditorio queda vacío, el sistema lo completa con la asignatura y el grupo.
- Un usuario puede modificar una solicitud; **toda modificación vuelve a validar activos, horarios y cruces.**
- Los estados posibles son pendiente, aprobada, rechazada y cancelada. **Cómo se llega al estado cancelada, quién puede cancelar y hasta cuándo: Por definir.**
- **Horario laboral permitido, duración máxima y anticipación mínima o máxima de una reserva: Por definir.**
- El módulo embebido para Timonel ofrece solo este formulario de solicitud, limitado a aulas, laboratorios y auditorios activos y sin acciones de revisión.

### 9. Revisión de solicitudes

- Un administrador, o el docente responsable activo del espacio, puede aprobar o rechazar una solicitud pendiente.
- **Solo las solicitudes pendientes pueden revisarse; un segundo intento de revisión sobre la misma solicitud se informa como conflicto y no cambia nada.**
- **Cada revisión registra quién la hizo y cuándo.**
- **Aprobar no vuelve a validar los cruces, porque la solicitud pendiente ya reserva el horario desde que se creó.**
- Un usuario sin permiso de revisión, o sin acceso a la solicitud, no puede aprobarla ni rechazarla.
- Si el sistema debe pedir un motivo al rechazar: **Por definir**.

### 10. Notificaciones en tiempo real

- Un usuario con sesión iniciada recibe avisos sin recargar la página.
- **Al crearse una solicitud, se avisa a los administradores y a los responsables activos del espacio; el solicitante no recibe aviso de su propia solicitud.**
- **Al revisarse una solicitud, se avisa únicamente a su solicitante.**
- Cada aviso incluye al menos el código de la reserva, el espacio, la fecha, el horario y el estado.
- **Los avisos se emiten solo cuando la operación se confirmó con éxito.**
- **Si el servicio de avisos falla, la operación de negocio igualmente se completa; el fallo se registra.**
- **Un usuario sin sesión válida no recibe avisos y el sistema no lo reintenta de forma indefinida.** Si el servicio está temporalmente caído, el cliente reintenta con espera creciente.
- El canal es solo de recepción: lo que el usuario envíe a través de él se ignora.
- Avisos por edición de una reserva, por cancelación, por cambios de estado de un espacio y envío de correos electrónicos: **Por definir**.

### 11. Auditoría y trazabilidad

- El sistema registra quién (si se conoce), qué acción, sobre qué objeto, qué cambió, desde qué dirección y cuándo.
- **Se audita como mínimo: eventos de MFA, cambios de rol y de estado de un usuario, cambios de contraseña y eliminación de usuarios.**
- Quién puede consultar la auditoría, con qué filtros y por cuánto tiempo se conserva: **Por definir**.
- Si la auditoría debe extenderse a todo el CRUD de espacios, reservas y catálogos: **Por definir**.

### 12. Control de acceso y navegación

- **La autorización la decide siempre el sistema, no la interfaz: ocultar una opción en pantalla nunca sustituye la verificación de permisos.**
- La interfaz muestra a cada usuario solo las secciones que le corresponden: panel, espacios, disponibilidad, reservas, seguridad; usuarios (administradores y superusuarios) y responsables (administradores y personal administrativo).
- Un usuario que entra a una sección no permitida es llevado al panel.
- El sistema ofrece una consulta de estado que indica si sus componentes esenciales funcionan.
- El sistema ofrece documentación consultable de su interfaz de programación para uso de clientes autorizados.

> **Nota de vigencia:** este documento es la descripción de origen. La especificación vigente es [`specs/003-reservatrack-platform/spec.md`](../003-reservatrack-platform/spec.md), que incorpora las decisiones del 2026-11-15: cancelación de reservas, horario permitido 07:00-21:00 y desactivar en vez de borrar. Esos puntos ya no son Non-Goals.

## Lo que NO se va a construir en esta iteración (Non-Goals)

- Duración máxima, anticipación mínima o máxima y cualquier otra política de uso de los espacios (salvo el horario permitido 07:00-21:00, incorporado en la spec 003).
- Reservas recurrentes, listas de espera, reservas de varios espacios a la vez o reserva de equipos.
- Historial y reportes funcionales (estadísticas, exportaciones); sus secciones solo redirigen al panel.
- Notificaciones por correo electrónico, mensajería, notificaciones móviles o avisos por edición, cancelación o cambio de estado de un espacio.
- Aplicación móvil nativa.
- Inicio de sesión único (SSO) con sistemas institucionales, incluido Timonel; el módulo embebido depende de que el usuario ya tenga sesión en ReservaTrack.
- Calendario con sincronización a sistemas externos (Google Calendar, Outlook, iCal).
- Aprobación en varios niveles, delegación de revisión o motivos obligatorios de rechazo.
- Políticas de retención o depuración de datos y de auditoría.
- Auditoría uniforme de todas las operaciones de alta, edición y baja.
- Recuperación de contraseña por correo («olvidé mi contraseña») y verificación del correo al registrarse.
- Métodos de segundo factor distintos de la aplicación autenticadora (SMS, correo, llaves físicas).
- Operación sin conexión o modo de datos de demostración como funcionalidad oficial del producto.
- Soporte de varios idiomas y accesibilidad certificada.
- Pagos, cobros o tarifas por uso de espacios.
