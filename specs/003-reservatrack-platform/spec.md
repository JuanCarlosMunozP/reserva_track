# Feature Specification: Plataforma ReservaTrack de reserva de espacios

**Feature Branch**: `003-reservatrack-platform`

**Created**: 2026-11-15

**Status**: Implementado (vigente)

**Input**: User description: "usa como descripción el archivo specs/001-reservatrack/spec.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Solicitar un espacio sin cruces de horario (Priority: P1)

Un estudiante, docente, personal administrativo o administrador con sesión iniciada elige un espacio activo, indica fecha, hora de inicio y hora de fin, completa los datos que exige la categoría del espacio (aula: motivo; laboratorio: asignatura y grupo; auditorio: asignatura, grupo y asistentes) y envía la solicitud. El sistema le asigna un código único legible y el estado «pendiente».

**Why this priority**: es el propósito central del producto; sin solicitudes válidas y sin doble reserva no existe valor.

**Independent Test**: con un usuario y un espacio activo ya existentes, crear una solicitud válida y comprobar código, estado «pendiente» y que una segunda solicitud cruzada es rechazada.

**Acceptance Scenarios**:

1. **Given** un aula activa libre, **When** el usuario solicita una franja válida con motivo, **Then** se crea la solicitud con código único (que incluye el año), estado «pendiente» y el usuario como solicitante.
2. **Given** una solicitud pendiente o aprobada en una franja, **When** otro usuario solicita una franja que se solapa en el mismo espacio y fecha, **Then** el sistema la rechaza informando el conflicto.
3. **Given** una solicitud rechazada o cancelada, **When** se solicita esa misma franja, **Then** se acepta, porque esos estados no bloquean el horario.
4. **Given** un auditorio de capacidad 100, **When** se piden 150 asistentes, **Then** la solicitud se rechaza.
5. **Given** un espacio inactivo o una hora de fin no posterior a la de inicio, **When** se envía la solicitud, **Then** se rechaza con un mensaje claro.
6. **Given** dos usuarios que solicitan la misma franja al mismo tiempo, **When** ambos envían, **Then** solo uno se registra y el otro recibe el conflicto.
7. **Given** un laboratorio o auditorio sin motivo, **When** se envía con asignatura y grupo, **Then** el motivo se completa con esos datos.

---

### User Story 2 - Revisar solicitudes y notificar en tiempo real (Priority: P1)

Un administrador o el docente responsable activo del espacio aprueba o rechaza solicitudes pendientes. Al crearse una solicitud se avisa a administradores y responsables del espacio; al revisarse, se avisa al solicitante, sin recargar la página.

**Why this priority**: cierra el ciclo de la reserva y es lo que hace que el resultado llegue a quien lo espera.

**Independent Test**: con una solicitud pendiente, aprobarla con un revisor autorizado y verificar estado, registro de revisor y fecha, y aviso recibido solo por el solicitante.

**Acceptance Scenarios**:

1. **Given** una solicitud pendiente, **When** un revisor autorizado la aprueba o rechaza, **Then** cambia de estado y queda registrado quién y cuándo.
2. **Given** una solicitud ya revisada, **When** se intenta revisar de nuevo, **Then** se informa conflicto y nada cambia.
3. **Given** un usuario sin permiso de revisión o sin acceso a la solicitud, **When** intenta revisarla, **Then** se le niega.
4. **Given** una solicitud nueva, **When** se confirma su creación, **Then** administradores y responsables activos del espacio reciben un aviso con código, espacio, fecha, horario y estado, y el solicitante no.
5. **Given** que el servicio de avisos falla, **When** se crea o revisa una solicitud, **Then** la operación se completa igualmente y el fallo queda registrado.

---

### User Story 3 - Registro, acceso y sesiones seguras (Priority: P1)

Un visitante se registra (con tipo de usuario estudiante, docente o personal administrativo), inicia sesión, consulta su perfil y cierra sesión. La sesión se renueva sin pedir credenciales mientras siga vigente.

**Why this priority**: todo el resto exige identidad; el registro público nunca puede producir administradores.

**Independent Test**: registrar una cuenta, iniciar sesión, ver el perfil, cerrar sesión y comprobar que la sesión ya no se renueva.

**Acceptance Scenarios**:

1. **Given** datos válidos, **When** un visitante se registra, **Then** la cuenta queda con rol de usuario común.
2. **Given** un usuario o correo ya existente (sin distinguir mayúsculas), **When** se intenta registrar, **Then** se rechaza.
3. **Given** una contraseña corta o común, **When** se registra, **Then** se rechaza.
4. **Given** varios intentos fallidos de acceso, **When** se intenta otro, **Then** el ingreso queda bloqueado temporalmente.
5. **Given** un cambio de contraseña, **When** se completa, **Then** se cierran las demás sesiones de esa cuenta, conservando la actual si la cambió su dueño.

---

### User Story 4 - Consultar espacios y disponibilidad (Priority: P2)

Cualquier visitante consulta y busca espacios (por nombre, descripción, ubicación; filtros por categoría y estado) y ve las franjas ocupadas de una fecha. Cada usuario ve las reservas según su alcance: el administrador todas; el docente las propias y las de sus espacios; los demás solo las propias.

**Why this priority**: orienta la elección de franja antes de solicitar, pero el sistema funciona sin él porque el conflicto real se valida al solicitar.

**Independent Test**: consultar espacios sin sesión y la disponibilidad de una fecha con usuarios de distinto alcance.

**Acceptance Scenarios**:

1. **Given** espacios de varias categorías, **When** un visitante filtra por categoría y estado, **Then** ve solo los coincidentes.
2. **Given** reservas de varios usuarios, **When** un estudiante consulta, **Then** ve solo las propias; el administrador ve todas.
3. **Given** una vista parcial de disponibilidad, **When** el usuario solicita una franja ocupada oculta para él, **Then** el conflicto igual se detecta.

---

### User Story 5 - Administrar espacios, ubicaciones y responsables (Priority: P2)

Los administradores crean, editan y eliminan espacios (nombre, descripción, categoría, capacidad ≥ 1, ubicación, estado) y mantienen el catálogo de departamentos, ciudades, sedes, áreas y ubicaciones. Administradores y personal administrativo asignan responsables a espacios.

**Why this priority**: provee los datos sobre los que se reserva; puede cargarse inicialmente de forma mínima.

**Independent Test**: crear una ubicación y un espacio con ella, asignar un responsable y comprobar las restricciones de unicidad y dependencias.

**Acceptance Scenarios**:

1. **Given** una ciudad con sedes, **When** se intenta eliminarla, **Then** se informa conflicto y se conserva.
2. **Given** un espacio sin texto de ubicación pero con ubicación del catálogo, **When** se guarda, **Then** la ubicación se completa desde el catálogo.
3. **Given** un administrador como candidato, **When** se intenta asignarlo responsable, **Then** se rechaza; solo usuarios activos de rol usuario pueden serlo, una vez por espacio.
4. **Given** personal administrativo responsable de un espacio, **When** asigna responsables en otro espacio donde no lo es, **Then** se le niega.
5. **Given** un espacio desactivado, **When** se solicita, **Then** se rechaza, y sus reservas existentes se conservan.

---

### User Story 6 - Autenticación multifactor (Priority: P2)

Un usuario activa MFA con una aplicación autenticadora (QR o clave manual), confirma con un código válido y recibe códigos de recuperación mostrados una sola vez. Con MFA activo, el acceso exige contraseña y después un código de la aplicación o de recuperación. También puede regenerar códigos y desactivar MFA.

**Why this priority**: refuerza la seguridad, pero el producto es operable sin ella.

**Independent Test**: activar MFA, cerrar sesión, iniciar sesión con segundo factor y comprobar que un código de recuperación no se reutiliza.

**Acceptance Scenarios**:

1. **Given** MFA sin confirmar, **When** se ingresa un código válido, **Then** se activa y se entregan los códigos de recuperación una sola vez.
2. **Given** un código de recuperación ya usado o un código de aplicación ya aceptado, **When** se reutiliza, **Then** se rechaza.
3. **Given** varios fallos del segundo factor, **When** se ingresa un código correcto durante el bloqueo, **Then** igualmente se rechaza.
4. **Given** una regeneración de códigos, **When** se usa un código de recuperación como autorización, **Then** se rechaza; solo sirve un código vigente de la aplicación.
5. **Given** que el usuario perdió dispositivo y códigos, **When** el superusuario restablece su MFA, **Then** queda sin MFA y el hecho se audita.

---

### User Story 7 - Gestión de usuarios, roles y auditoría (Priority: P3)

El superusuario crea y elimina usuarios y asigna el rol de administrador; administradores y superusuarios listan, editan, activan y desactivan usuarios y restablecen contraseñas. Los cambios sensibles quedan en una auditoría.

**Why this priority**: operación interna que sostiene el producto, con menor frecuencia de uso.

**Independent Test**: cambiar el rol de un usuario como superusuario y verificar el registro de auditoría con valor anterior y nuevo; probar que un administrador no puede hacerlo.

**Acceptance Scenarios**:

1. **Given** un administrador que no es superusuario, **When** intenta asignar el rol de administrador, **Then** se le niega.
2. **Given** un usuario común, **When** intenta cambiar su propio rol, estado o privilegios, **Then** se rechaza.
3. **Given** un superusuario, **When** intenta eliminar su propia cuenta, **Then** se rechaza.
4. **Given** un cambio de rol, estado o contraseña, **When** se confirma, **Then** la auditoría registra autor (si se conoce), acción, objeto, valores anterior y nuevo, dirección de origen y fecha.

---

### User Story 8 - Navegación según permisos y módulo embebido (Priority: P3)

La interfaz muestra a cada usuario solo las secciones que le corresponden (panel, espacios, disponibilidad, reservas, seguridad; usuarios y responsables según rol) y lleva al panel si entra a una sección no permitida. Un módulo embebido para Timonel ofrece solo el formulario de solicitud para aulas, laboratorios y auditorios activos.

**Why this priority**: mejora la experiencia, pero la autorización real nunca depende de la interfaz.

**Independent Test**: entrar con distintos roles y verificar secciones visibles, redirección y que el módulo embebido no muestra acciones de revisión.

**Acceptance Scenarios**:

1. **Given** un usuario común, **When** abre la sección de usuarios, **Then** es llevado al panel.
2. **Given** una opción oculta en pantalla, **When** se invoca directamente la operación sin permiso, **Then** el sistema la niega igualmente.
3. **Given** el módulo embebido con sesión vigente, **When** se abre, **Then** solo ofrece el formulario de solicitud y excluye espacios de otras categorías o inactivos.

---

### Edge Cases

- Dos solicitudes simultáneas de la misma franja: solo una se registra.
- Una solicitud modificada vuelve a validar espacios activos, horarios y cruces, excluyéndose a sí misma del cruce.
- Franjas contiguas (una termina cuando otra empieza) no cuentan como cruce.
- Aprobar no revalida cruces: la pendiente ya reservaba el horario.
- Reducir la capacidad de un auditorio no revalida reservas existentes.
- Sesión expirada y no renovable: se pide iniciar sesión de nuevo.
- Cambio de contraseña durante un acceso MFA a medias: el paso intermedio se invalida.
- Servicio de avisos caído: la operación continúa y el cliente reintenta con espera creciente; sin sesión válida no se reintenta indefinidamente.
- Eliminar un usuario o espacio elimina también sus reservas y responsabilidades.
- Lo que el cliente envíe por el canal de avisos se ignora.

## Requirements *(mandatory)*

### Functional Requirements

**Cuentas y sesiones**

- **FR-001**: Un visitante MUST poder registrarse con usuario, correo, nombres, apellidos, tipo (estudiante, docente o personal administrativo) y contraseña; curso y área son opcionales.
- **FR-002**: El registro público MUST crear siempre cuentas con rol de usuario común, nunca administradores.
- **FR-003**: Usuario y correo MUST ser únicos sin distinguir mayúsculas.
- **FR-004**: La contraseña MUST cumplir longitud mínima y no ser una contraseña común.
- **FR-005**: Un usuario MUST poder iniciar sesión, consultar su perfil y cerrar sesión; al cerrar sesión esta MUST dejar de ser renovable.
- **FR-006**: El sistema MUST bloquear temporalmente el ingreso tras varios intentos fallidos y limitar la frecuencia de registro y acceso.
- **FR-007**: El sistema MUST renovar la sesión sin pedir credenciales mientras siga vigente, y pedir inicio de sesión cuando ya no lo sea.
- **FR-008**: Al cambiar la contraseña de una cuenta, el sistema MUST cerrar sus demás sesiones; quien cambia la propia conserva la actual.

**MFA**

- **FR-009**: Un usuario autenticado MUST poder ver si su MFA está activo y cuántos códigos de recuperación le quedan.
- **FR-010**: La activación de MFA MUST mostrar QR y clave manual y completarse solo con un código válido; MUST entregar códigos de recuperación una sola vez.
- **FR-011**: Con MFA activo, el acceso MUST exigir contraseña y luego un código de la aplicación o de recuperación.
- **FR-012**: Cada código de recuperación MUST usarse una sola vez y un código de aplicación no MUST aceptarse dos veces.
- **FR-013**: El paso intermedio del acceso MFA MUST ser temporal e invalidarse si cambia la contraseña.
- **FR-014**: Tras varios fallos del segundo factor, la cuenta MUST bloquearse por un tiempo, rechazando incluso un código correcto durante el bloqueo.
- **FR-015**: Regenerar códigos MUST requerir un código vigente de la aplicación (no uno de recuperación) e invalidar los anteriores; desactivar MFA MUST requerir contraseña y un código vigente.
- **FR-016**: El superusuario MUST poder restablecer el MFA de otro usuario.

**Usuarios y roles**

- **FR-017a**: Eliminar un usuario que tiene reservas MUST sustituirse por su desactivación, conservando sus reservas y la auditoría; solo se borra un usuario sin reservas.
- **FR-017**: El sistema MUST distinguir superusuario, administrador y usuario común (este con tipo estudiante, docente o personal administrativo).
- **FR-018**: Administradores y superusuarios MUST poder listar, consultar, editar, activar y desactivar usuarios y restablecer contraseñas sin conocer la actual.
- **FR-019**: Solo el superusuario MUST poder crear usuarios desde la administración, eliminarlos, asignar o retirar el rol de administrador y restablecer MFA.
- **FR-020**: El personal administrativo MUST poder listar únicamente usuarios activos de rol usuario para asignarlos como responsables.
- **FR-021**: Un usuario MUST poder editar sus datos y cambiar su contraseña indicando la actual, sin poder modificar su propio rol, estado ni privilegios.
- **FR-022**: Un superusuario NO MUST poder eliminar su propia cuenta.
- **FR-023**: El tipo de usuario MUST ser obligatorio al crear la cuenta y no modificable después.
- **FR-024**: Eliminar un usuario MUST eliminar también sus reservas y responsabilidades.

**Catálogo de ubicaciones**

- **FR-025**: Los administradores MUST poder crear, consultar, editar y eliminar departamentos, ciudades, sedes, áreas y ubicaciones puntuales (sede + área + detalle).
- **FR-026**: Los nombres de departamento, área y sede MUST ser únicos; las ciudades únicas dentro de un departamento; las ubicaciones únicas por sede, área y detalle.
- **FR-027**: Un elemento del catálogo con dependencias NO MUST poder eliminarse; el sistema MUST informar el conflicto.
- **FR-028**: La consulta del catálogo MUST ser pública y su modificación exclusiva de administradores y superusuarios; ciudades filtrables por departamento y ubicaciones por sede y área.

**Espacios y responsables**

- **FR-029**: Cualquier visitante MUST poder consultar y buscar espacios por nombre, descripción o ubicación y filtrar por categoría (laboratorio, aula, deportivo, sala, auditorio u otro) y estado.
- **FR-030**: Cada espacio MUST registrar nombre, descripción, categoría, capacidad (≥ 1), ubicación (texto o catálogo; al menos una), estado y responsables vigentes.
- **FR-031**: Solo un administrador MUST poder crear y eliminar espacios; el personal administrativo solo MUST editar espacios donde es responsable activo.
- **FR-032**: Un espacio desactivado NO MUST admitir nuevas reservas y MUST conservar las existentes. Eliminar un espacio que tiene reservas MUST sustituirse por su desactivación (las reservas y el historial se conservan); solo se borra un espacio sin reservas.
- **FR-033**: Administradores y personal administrativo MUST poder asignar, desactivar y reactivar responsables; solo usuarios activos de rol usuario, una responsabilidad por usuario y espacio, y el personal administrativo solo en espacios donde es responsable activo.

**Disponibilidad y reservas**

- **FR-034**: El sistema MUST mostrar los espacios y sus franjas ocupadas para una fecha, con alcance: administrador todo; docente propias y de sus espacios; demás solo propias.
- **FR-035**: Las reservas MUST ser filtrables por espacio, fecha y estado y buscables por código, motivo, solicitante o espacio.
- **FR-036**: Un usuario autenticado MUST poder solicitar un espacio con fecha, hora de inicio y fin, con datos adicionales según categoría (aula: motivo; laboratorio: asignatura y grupo; auditorio: asignatura, grupo y asistentes ≤ capacidad).
- **FR-037**: El sistema MUST rechazar solicitudes de espacios inactivos, con fin no posterior al inicio, o que se crucen con una pendiente o aprobada del mismo espacio y fecha, incluso bajo solicitudes simultáneas; las rechazadas y canceladas no bloquean.
- **FR-038**: El sistema MUST asignar solicitante, código único legible con el año y estado inicial «pendiente»; el usuario no puede elegirlos.
- **FR-039**: Un usuario MUST poder modificar una solicitud, revalidando activos, horarios y cruces.
- **FR-040**: Los estados MUST ser pendiente, aprobada, rechazada y cancelada. Una reserva pendiente o aprobada MUST poder cancelarla su solicitante o un administrador, solo antes de que inicie; al cancelarse, el horario queda libre.
- **FR-040a**: Las reservas MUST estar dentro del horario permitido (por defecto 07:00–21:00, configurable); fuera de él se rechazan. No hay límite de duración ni de anticipación.
- **FR-041**: El módulo embebido para Timonel MUST ofrecer solo el formulario de solicitud, limitado a aulas, laboratorios y auditorios activos.

**Revisión**

- **FR-042**: Un administrador o el docente responsable activo del espacio MUST poder aprobar o rechazar solicitudes pendientes; las ya revisadas MUST informarse como conflicto sin cambios.
- **FR-043**: Cada revisión MUST registrar revisor y fecha; aprobar NO MUST revalidar cruces.
- **FR-044**: Usuarios sin permiso o sin acceso a la solicitud NO MUST poder revisarla.

**Notificaciones**

- **FR-045**: Un usuario con sesión MUST recibir avisos sin recargar; al crearse una solicitud, a administradores y responsables activos del espacio (no al solicitante); al revisarse, solo al solicitante.
- **FR-046**: Cada aviso MUST incluir código, espacio, fecha, horario y estado, y emitirse solo tras confirmarse la operación.
- **FR-047**: Un fallo del servicio de avisos NO MUST impedir la operación y MUST registrarse; sin sesión válida no se reciben avisos ni se reintenta indefinidamente; el cliente reintenta con espera creciente; lo que el cliente envíe por el canal se ignora.

**Auditoría y acceso**

- **FR-048**: El sistema MUST registrar quién (si se conoce), acción, objeto, cambio, dirección de origen y fecha, como mínimo para eventos de MFA, cambios de rol, estado y contraseña (con valor anterior y nuevo) y eliminación de usuarios.
- **FR-049**: La autorización MUST decidirla siempre el sistema, no la interfaz; la interfaz MUST mostrar solo las secciones correspondientes al rol y redirigir al panel ante secciones no permitidas.
- **FR-050**: El sistema MUST ofrecer una consulta de estado de sus componentes esenciales y documentación consultable de su interfaz de programación para clientes autorizados.

### Key Entities

- **Usuario**: persona con identificador, correo, nombres, tipo (estudiante, docente, personal administrativo), rol (superusuario, administrador, usuario), estado activo/inactivo y configuración de MFA.
- **Sesión**: acceso vigente de un usuario, renovable hasta cerrarse o invalidarse.
- **Código de recuperación MFA**: código de un solo uso asociado a un usuario.
- **Departamento / Ciudad / Sede / Área / Ubicación**: catálogo jerárquico donde una ubicación combina sede, área y detalle.
- **Espacio**: recurso reservable con categoría, capacidad, ubicación y estado.
- **Responsabilidad**: vínculo único usuario–espacio, activable y desactivable.
- **Reserva (solicitud)**: código, solicitante, espacio, fecha, franja, datos según categoría, estado, y revisor/fecha de revisión.
- **Aviso**: mensaje en tiempo real sobre una reserva dirigido a destinatarios concretos.
- **Registro de auditoría**: evento con autor, acción, objeto, valores anterior/nuevo, origen y fecha.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 reservas pendientes o aprobadas con horario solapado en el mismo espacio y fecha, incluso con solicitudes simultáneas.
- **SC-002**: Un usuario con cuenta completa una solicitud de reserva en menos de 2 minutos.
- **SC-003**: El 95 % de los avisos de solicitud creada o revisada llegan a sus destinatarios conectados en menos de 5 segundos.
- **SC-004**: El 100 % de los intentos de acciones no autorizadas (asignar administradores, revisar sin permiso, editar espacios ajenos) es rechazado.
- **SC-005**: El 100 % de los cambios de rol, estado, contraseña, eliminación de usuarios y eventos de MFA queda en la auditoría con sus datos completos.
- **SC-006**: El 90 % de los usuarios nuevos completa el registro y su primer inicio de sesión al primer intento.
- **SC-007**: La consulta de espacios y disponibilidad de una fecha se muestra en menos de 3 segundos para el 95 % de las consultas.
- **SC-008**: Ningún código de recuperación ni de aplicación es aceptado más de una vez.

## Assumptions

- Los umbrales de bloqueo (intentos y duración), longitud mínima de contraseña y tiempo de vida de sesión se fijan con valores estándar de la industria en la planificación.
- Decidido por el usuario (2026-11-15): usuarios y espacios con reservas se desactivan en vez de borrarse; cancelan el solicitante o un administrador antes del inicio; solo se limita el horario permitido (07:00–21:00 por defecto).
- Reducir la capacidad de un espacio no revalida las reservas existentes.
- La disponibilidad mostrada a usuarios sin alcance total es parcial; el conflicto real se detecta al solicitar.
- El módulo embebido depende de que el usuario ya tenga sesión en ReservaTrack; no hay inicio de sesión único con Timonel.
- Quién puede consultar la auditoría y su retención no están definidos; en esta iteración solo se garantiza el registro.
- Fuera de alcance: límites de duración máxima y de anticipación; reservas recurrentes, listas de espera, varios espacios o equipos; historial y reportes funcionales; correo, mensajería o notificaciones móviles y avisos por edición, cancelación o cambio de estado de espacios; aplicación móvil nativa; inicio de sesión único; sincronización con calendarios externos; aprobación multinivel, delegación o motivo obligatorio de rechazo; políticas de retención de datos; auditoría uniforme de todo el CRUD; recuperación de contraseña por correo y verificación de correo; segundo factor distinto de la aplicación autenticadora; modo sin conexión o de demostración; varios idiomas y accesibilidad certificada; pagos o tarifas.
