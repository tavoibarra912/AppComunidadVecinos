# App Gestión Peñarrubia (Comunidades y Propietarios)

Aplicación web completa para la gestión de la Asociación de Propietarios de Parcelas de Peñarrubia: comunidades de vecinos, propietarios/asociados, inmuebles, inquilinos y documentación con revisión administrativa.

## Arquitectura

- **Backend**: Node.js + Express + SQLite (`node:sqlite`, sin dependencias nativas). API REST, subida de archivos (`multer`) y control de acceso por sesiones.
- **Frontend**: vanilla JavaScript en módulos ES (sin build step), servido por el propio backend. Persistencia íntegra en base de datos — ya no se usa `localStorage`.
- **Datos demo**: la base se inicializa con datos de ejemplo **solo si está vacía** al arrancar; los cambios persisten entre reinicios.

## Ejecución

```bash
npm install
npm start        # producción (http://localhost:3000)
npm run dev      # desarrollo con recarga (node --watch)
npm run restart  # Windows: libera el puerto de la app y vuelve a arrancar
```

Abrí **http://localhost:3000/** en Firefox (o el puerto configurado con `PORT`).
El frontend y la API deben salir del mismo servidor Node; Live Server de VS Code
no sirve la API. Para los usuarios demo iniciales, el usuario y la contraseña
coinciden (por ejemplo, `super_admin` / `super_admin`), salvo que hayas cambiado la contraseña.

Cuentas demo estándar (usuario = contraseña = email local = nombre):

| Usuario | Rol | Escenario |
| --- | --- | --- |
| `super_admin` | super_admin | Acceso total, sin perfil |
| `admin` | administrator | Crea y administra todas las comunidades |
| `comm_admin` | community_admin | Administra la comunidad asignada (Peñarrubia) |
| `usuario_r_user_s_perfil` | user | Sin perfil vinculado |
| `usuario_r_user_c_propietario` | user | Con perfil de propietario |
| `usuario_r_user_c_inquilino` | user | Con perfil de inquilino |
| `usuario_r_user_c_propietario_c_inquilino` | user | Con perfiles de propietario e inquilino |

Permisos destacados configurables por rol (Administración → Roles):

- **`owner:delete`** — eliminar un socio. Por defecto solo lo tiene `super_admin`;
  otorgáselo al rol `administrator` si querés que el administrador general pueda
  hacerlo (el borrado se bloquea si el socio tiene un inmueble con inquilino).
- **`comm:participacion`** — participar en Comunicación: comentar (con nombre),
  votar encuestas y confirmar asistencia a reuniones. Activado por defecto para
  `administrator`, `community_admin` y `user`; desmarcalo en un rol y ese rol ve
  las publicaciones de forma informativa (sin la parte social). `super_admin`
  siempre participa.

**Avisos por email de cambios de perfiles**: en Configuración → General, la
clave *Email(s) para avisar cambios de perfiles* acepta una o varias
direcciones separadas por comas (vacío = desactivado). Cada vez que un
propietario se edita, la plataforma envía un correo con quién lo modificó y
el detalle campo por campo. El envío usa el correo habilitado en Proveedores
de comunicación, y los asuntos/cuerpos se personalizan en Textos de envío
(placeholders `{{perfil}}`, `{{usuario}}`, `{{comunidad}}`, `{{cambios}}`,
`{{fecha}}`, `{{plataforma}}`).

La base de datos se crea en `data/penarrubia.db` y los archivos subidos en `uploads/` (ambos ignorados por git).

## Estructura del proyecto

```
server.js                 Entrada: Express, estáticos, rutas, seed
src/
  db.js                   Esquema SQLite + mapeadores de filas
  domain.js               Lógica de negocio (reasignaciones, relaciones, contratos)
  seed.js                 Datos demo (solo si la BD está vacía)
  routes/
    index.js              /api/bootstrap, /api/health
    communities.js        CRUD de comunidades
    owners.js             CRUD de propietarios (+ vínculo de inmueble transaccional)
    properties.js         CRUD de inmuebles
    tenants.js            CRUD de inquilinos (ownerId derivado del inmueble)
    documents.js          Subida/descarga/borrado de archivos (multer, 15 MB)
    notifications.js      Buzón del administrador y del propietario
    verification.js       contacto (envío no configurado)
public/
  index.html · styles.css
  js/
    main.js               Bootstrap: carga de estado + render global
    api.js                Cliente fetch de la API
    state.js              Estado en memoria + refreshState + selectores
    utils.js              Formateadores, validadores y helpers de documentos
    territory.js          Catálogo INE (provincia → municipio → CP)
    docs-engine.js        Motor de validación del expediente de propietario
    municipios-ine.js     Catálogo territorial (8.132 municipios, script clásico)
    features/             navigation, home, comunidades, propietarios,
                          inquilinos, inmuebles, notificaciones
```

## Modelo de datos

- `communities`: datos de la comunidad + documentación adjunta.
- `owners`: datos personales, verificación de contacto, IBAN y **expediente de documentación** (JSON del motor de validación client-side).
- `properties`: inmuebles con **uno o más propietarios** (`ownerIds`, N:M) y **uno o más inquilinos** (`tenantIds`), pertenecientes a una única comunidad.
- `tenants`: inquilinos con propietario e inmueble, contrato (tipo, renta, fianza, teléfono de emergencia) y autorizaciones.
- `documents`: archivos subidos (por entidad: comunidad, inmueble o inquilino) con su archivo en disco.
- `admin_emails` / `owner_notifications`: buzones del administrador y del propietario.

### Sesiones, roles y contraseñas

El servidor exige una sesión para todas las rutas de datos. La sesión se guarda
con un token aleatorio en una cookie HttpOnly y SameSite Strict, tiene una duración
máxima de ocho horas y se revoca al cerrar sesión o cambiar la contraseña.
Las contraseñas nuevas se guardan con scrypt; las antiguas se actualizan al iniciar sesión.

Los roles y sus permisos se comparten entre backend y frontend:
- Super Administrador: administración completa, incluido usuarios, roles y configuración.
- Administrador: los permisos definidos en su rol.
- Administrador de Comunidad: permisos limitados a las comunidades asignadas.
- Usuario: permisos limitados a sus perfiles de propietario o inquilino.
- Roles personalizados: se aplican los permisos configurados, sin cambiar de identidad desde la interfaz.

Administración permite asignar una contraseña al crear o editar un usuario.
Nunca devuelve hashes ni tokens de recuperación. No se puede borrar, desactivar
ni quitar el rol al último superadministrador activo.

El botón de usuario de la esquina superior derecha abre «Mi perfil», «Cambiar
contraseña», «Mi comunidad» y «Cerrar sesión». El perfil muestra los datos de la
cuenta y enlaces a las fichas de propietario o inquilino que tenga vinculadas.
Cambiar la contraseña requiere la actual y cierra las sesiones de esa cuenta.

Registrar una cuenta no la convierte automáticamente en propietaria ni le asigna
una comunidad. Un administrador debe vincularla desde **Administración → Usuarios**
al perfil de propietario o inquilino correspondiente; la comunidad se deriva del
inmueble vinculado. Mientras falte ese vínculo, «Mi comunidad» explica que el perfil
está pendiente, sin mostrar nombres ni comunidades de los datos de ejemplo.

El SSO y la verificación OTP siguen desactivados. La recuperación de contraseña
usa el SMTP configurado en Administración → Configuración → Proveedores de
comunicación (requiere el permiso «Configurar proveedores de comunicación»).
En desarrollo no hace falta configurar el origen: el enlace se construye con
`http://localhost:` + `PORT`. En producción hay que definir `APP_PUBLIC_URL` con
el origen HTTPS de la aplicación (por ejemplo, `https://vecinos.example.org`).
Nunca se usa el encabezado Host para construir enlaces.

### Recuperación de contraseña

Desde «Olvidé mi contraseña», indicá el email de la cuenta. La respuesta es igual
para cuentas inexistentes, inactivas y activas; no contiene tokens. Se admite una
solicitud por minuto por dirección, además del límite de intentos por IP. El correo
se procesa desde una cola SQLite cada 30 segundos con el servidor encendido,
independientemente de las preferencias de avisos comunitarios.

El enlace vence en 30 minutos, es de un solo uso y una nueva solicitud invalida el
anterior. El token se guarda como hash; la copia temporal para SMTP se cifra y se
elimina al terminar el envío. El navegador retira el fragmento del historial al
abrir el formulario. Se pide confirmar la nueva contraseña, se revocan todas las
sesiones de la cuenta y no se inicia sesión automáticamente. Cambiar el email o
desactivar la cuenta desde Administración invalida los enlaces pendientes.

Si el SMTP no está habilitado (o falta `APP_PUBLIC_URL` en producción), la
solicitud se registra en el log del servidor y en la auditoría, y se responde
con el mismo mensaje genérico: el usuario final nunca ve errores de
configuración del servidor. Los fallos o envíos interrumpidos quedan en
la auditoría, invalidan el enlace y no se reenvían automáticamente: solicitá uno
nuevo después de revisar el proveedor. «Aceptado por SMTP» no confirma entrega.

### Marca (white-label)

En **Administración → Configuración General → Marca** se personalizan nombre
visible, color principal, color de acento y logo (PNG, JPG, SVG o WebP, máx.
225 KB). La marca se guarda en `settings/general` y se valida en el servidor
(solo `admin:settings`). No hay endpoint público de marca ni dominio
customizable: el servidor incrusta nombre y variables de color en el propio
`index.html` al servirlo (bloque `<script type="application/json">` + un
`<style>` con variables CSS), por lo que también la pantalla de login llega ya
personalizada y la CSP (sin scripts inline) sigue intacta. Los colores
anteriores son los por defecto y actúan de respaldo. El logo se almacena como
data URL en la configuración, con vista previa en el formulario. El nombre de
marca se aplica en la barra superior, el login, el título de la pestaña, el
saludo de inicio y el correo de recuperación de contraseña. Los cambios se
muestran de inmediato al guardar; el resto de clientes los recibe en la
próxima recarga.

### Auditoría de seguridad

**Administración → Auditoría** consulta el historial persistente de logins correctos
y fallidos, cierres de sesión, accesos API denegados y altas/cambios/bajas de usuarios
y roles. Incluye fecha UTC (mostrada en horario local), actor, recurso, resultado,
IP y valores anteriores/posteriores de campos administrativos permitidos. También
registra solicitud, envío y finalización de recuperación. No guarda contraseñas,
cookies, tokens, cuerpos completos ni parámetros de consulta.

El tab es un permiso de rol: sólo se ve con «Ver auditoría» (`audit:read`), que
se otorga o quita en el editor de roles; sin el permiso, el tab y su panel
quedan ocultos aunque se force la URL, y la API responde 403. El rol
`super_admin` lo trae siempre (acceso total).

La API `GET /api/audit?limit=25&offset=0&action=login` exige sesión y `audit:read`.
Admite hasta 100 resultados por página. Es un permiso global: no se habilita para
roles `user` ni `community_admin`, aunque se marque en su editor; sí para roles
personalizados autorizados explícitamente y el superadministrador. No existe una
API de modificación o borrado del historial. Definí una política de retención y
protección de sus copias de seguridad para producción.

## API (resumen)

- `GET /api/bootstrap` — estado permitido para el usuario autenticado.
- `POST/PUT/DELETE /api/{communities|owners|properties|tenants}` — CRUD; el servidor resuelve la reasignación de inmuebles entre propietarios y el rearme de relaciones.
- `POST /api/documents` (multipart: `entityType`, `entityId`, `files[]`) · `DELETE /api/documents/:id` · `GET /api/documents/:id/download`.
- `POST /api/owners/contact/{phone|email}/{send|confirm}` — responde con un aviso de servicio no configurado; no genera códigos de prueba.
- `GET /api/notifications/*`, `POST /api/notifications/*` — buzones.
- `GET /api/health`.

## Funcionalidad principal

### Inicio
- Panel con métricas de los registros visibles para la cuenta, filtro de comunidad y actualización manual. Los inmuebles con varios titulares se cuentan una sola vez; el usuario ve sus vínculos reales, incluidas varias comunidades si corresponde.
- Gráficos de documentación e inmuebles, avisos pendientes, agenda y últimas publicaciones. La documentación de ejemplo no acredita un expediente; los contratos sin fechas válidas se identifican aparte. Los accesos se muestran según permisos.

### Comunidades
- En **Ver**, solo están habilitados las pestañas, el cierre y la apertura de los adjuntos. No se puede editar, verificar contactos, asociar inmuebles ni abrir sus fichas desde esa vista. La edición se recupera al abrir **Editar**.
- Año de constitución mediante selector y fondo de reserva numérico no negativo con hasta dos decimales. El servidor valida ambos campos, incluido el importe cero.
- CRUD con validaciones estrictas (NIF `H` + 8 dígitos, teléfonos de 9 dígitos, email, CP contra catálogo INE con autocompletado municipio/provincia).
- Documentación adjunta con drag & drop multi-archivo y ficha detallada con propietarios censados.

### Propietarios
- Formulario en tres pestañas: **1. Datos personales**, **2. Inmueble** (un único selector que vincula al propietario con un inmueble existente, igual que la asociación «Propietario» del formulario de inmuebles; si el inmueble era de otro dueño se reasigna) y **3. Documentación requerida**.
- Contacto guardado sin exigir un proveedor de verificación todavía no configurado.
- Expediente documental (DNI, recibo bancario, escritura) con comprobaciones de formato y revisión administrativa manual, botones de documento de prueba, aprobación/rechazo administrativo y buzones de notificación.
- IBAN con validación MOD-97, moneda de cuotas, dirección con catálogo territorial.

### Inmuebles
- CRUD completo por comunidad con propietario, tipo, identificador, datos catastrales opcionales, estado de recibos e inquilino vinculado.
- Documentación con dropzone drag & drop.

### Inquilinos
- Alta/edición seleccionando **directamente el inmueble** (el propietario se deduce de él; si se cambia a un inmueble de otro dueño, el inquilino cambia de propietario).
- Pestaña de documentación multi-archivo y ficha con estado del contrato (próximo, vigente, finalizado) y autorizaciones.

### Comunicación: tablón, calendario y reuniones

- **Comunicación** está disponible desde la navegación y el buzón **Comunidad** de la barra superior, también para inquilinos. El contador muestra las comunicaciones sin leer. **Mis canales** permite aceptar o revocar avisos externos por cuenta; dentro de la app siempre están disponibles.
- Los administradores con permiso para gestionar la comunidad crean avisos, eventos y reuniones en tres pasos: contenido, destinatarios y revisión. Admiten borradores, programación, inicio/fin, archivo, prioridad, fijado y recordatorios. Las fechas se guardan en UTC y se muestran en la zona local del navegador.
- Destinos: toda la comunidad, propietarios, inquilinos o selección de perfiles/unidades. Una unidad seleccionada incluye sus propietarios e inquilinos vigentes; se deduplican cuentas. La vista previa identifica perfiles sin cuenta activa. La distribución guarda la lista de cuentas destinatarias; nuevos vecinos no reciben publicaciones históricas. La desvinculación o el fin del contrato revocan el acceso.
- El detalle separa publicación, participación, reunión y seguimiento. Lectura y confirmación de recepción se registran por separado. Las ediciones publicadas se versionan, vuelven a marcar el aviso como pendiente y generan avisos de actualización. El guardado detecta conflictos de edición.
- Reuniones: lugar/videollamada HTTPS, orden del día, confirmación de invitación, asistencia real, acuerdos y tareas con responsable/vencimiento. Los adjuntos admiten PDF/JPG/PNG, hasta 10 MB por archivo y 30 archivos por publicación. Se comprueba el contenido y cada descarga requiere sesión y acceso a esa publicación.
- Las actas se suben como borradores privados de administración. **Publicar acta** habilita esa versión para destinatarios y genera un aviso. Las versiones publicadas se conservan; las correcciones se suben como versiones nuevas.
- Comentarios habilitables por publicación, eliminación propia y moderación administrativa. Encuestas/votaciones de una pregunta con 2–12 opciones, respuesta simple o múltiple, cierre por fecha o manual y electorado de destinatarios o propietarios destinatarios. Una respuesta inmutable por cuenta; los resultados son agregados y pueden mostrarse en vivo o al cerrar. No se pondera por unidad, coeficiente ni representación.

### Proveedores SMTP, SMS y WhatsApp

La configuración vive en **Administración → Configuración → Proveedores de
comunicación** (sub-tab; ya no es un modal) y requiere el permiso de rol
«Configurar proveedores de comunicación» (`admin:providers`), que se otorga en
el editor de roles. Ese control también se aplica en la API y no depende de
mostrar u ocultar botones; los accesos directos «Proveedores de envío»
(Comunicación) llevan a esa pantalla sólo a quien tiene el permiso.

- **SMTP:** servidor, puerto, TLS directo o STARTTLS obligatorio, usuario, contraseña y remitente. Implementado con [Nodemailer](https://nodemailer.com/smtp). No se desactiva la validación de certificados.
- **SMS:** Twilio, con Account SID, Auth Token y teléfono emisor internacional.
- **WhatsApp:** Twilio, con emisor habilitado y Content SID de una plantilla aprobada. La plantilla debe tener una variable de texto `{{1}}` para el aviso. Se utiliza la [API de mensajes de Twilio](https://www.twilio.com/docs/messaging/api/message-resource).
- Los proveedores vienen desactivados. **Enviar prueba** hace un envío real al destino indicado, después de guardar la configuración. Los envíos de publicaciones requieren que el autor elija el canal y que el destinatario lo haya aceptado en **Mis canales**.
- Las contraseñas/tokens se cifran con AES-256-GCM y nunca se devuelven al navegador. Un campo vacío conserva la credencial; la casilla de eliminación la borra. `APP_PROVIDER_KEY` admite una clave de 32 bytes codificada en 64 caracteres hexadecimales. Sin esa variable se genera `data/provider-key` (o dentro de `APP_DATA_DIR`). La clave debe conservarse junto con la base en una copia de seguridad privada; cambiarla impide descifrar las credenciales existentes. Estos datos locales están excluidos de Git.
- Una cola SQLite procesa programación, recordatorios y envíos cada 30 segundos mientras el servidor está encendido. Los envíos aceptados no se repiten automáticamente. Los canales no autorizados o desactivados se registran como omitidos. Los fallos y las respuestas inciertas permiten reintento explícito desde Seguimiento; conviene revisar el proveedor para evitar duplicados tras una interrupción.
- **Aceptado por el proveedor** no confirma entrega ni lectura: no hay un webhook de confirmación de entrega. El buzón de la app y sus lecturas son independientes. El SMTP también se utiliza para recuperación de contraseña cuando `APP_PUBLIC_URL` está configurado; la verificación OTP sigue desactivada.

API del módulo: `GET /api/communications/{metadata|posts|preferences}`, `POST /preview`, `POST /posts`, `GET/PUT /posts/:id`, acciones `read`, `receipt`, `comments`, `ballot`, `rsvp`, `attendance`, `retry` y `files`. `GET/PUT /providers` y `POST /providers/test` están restringidos al superadministrador. Las tablas se crean de forma idempotente al arrancar, sin sustituir los datos existentes.

## Comprobaciones

`npm test` ejecuta pruebas de dominio, arranque desde cero, migraciones, sesiones,
permisos, rutas HTTP, subidas y referencias de JavaScript. Las pruebas crean sus
bases y archivos dentro de directorios temporales y no usan los datos locales.

## Ejecución y datos existentes

Por defecto, el servidor escucha sólo en 127.0.0.1. `HOST` permite elegir otra
interfaz de red. `PORT` cambia el puerto. `APP_DATA_DIR` y `APP_UPLOADS_DIR`
permiten aislar la base y los archivos; sin configurarlos se conservan las rutas
`data/penarrubia.db` y `uploads/`.

Las migraciones conservan las contraseñas existentes, salvo las credenciales
predecibles que la migración anterior había generado para cuentas SSO. Esas
cuentas necesitan una contraseña asignada por el administrador. Al arrancar se
reconstruyen las referencias derivadas de inquilinos; los titulares borrados por
versiones anteriores no pueden recuperarse sin una copia de seguridad.

## Producción

Con `NODE_ENV=production` no se cargan datos demo y las cookies requieren HTTPS.
Una base nueva exige `APP_ADMIN_PASSWORD` de al menos 12 caracteres para crear
la cuenta inicial. Las bases existentes conservan su administrador. Si se desea
escuchar fuera de la máquina local, debe configurarse `HOST` explícitamente.

Los archivos se guardan en disco y necesitan copias de seguridad junto con SQLite.
La revisión documental es humana: el sistema no realiza OCR ni certifica la
identidad, titularidad o validez legal a partir del nombre de archivo.
