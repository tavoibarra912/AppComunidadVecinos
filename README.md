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
coinciden (por ejemplo, `admin` / `admin`), salvo que hayas cambiado la contraseña.

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

El SSO y la recuperación por email están desactivados hasta configurar proveedores
reales. Sin SMTP, un administrador debe asignar la nueva contraseña. El envío de
códigos de contacto también queda desactivado; se pueden guardar contactos sin verificar.

## API (resumen)

- `GET /api/bootstrap` — estado permitido para el usuario autenticado.
- `POST/PUT/DELETE /api/{communities|owners|properties|tenants}` — CRUD; el servidor resuelve la reasignación de inmuebles entre propietarios y el rearme de relaciones.
- `POST /api/documents` (multipart: `entityType`, `entityId`, `files[]`) · `DELETE /api/documents/:id` · `GET /api/documents/:id/download`.
- `POST /api/owners/contact/{phone|email}/{send|confirm}` — responde con un aviso de servicio no configurado; no genera códigos de prueba.
- `GET /api/notifications/*`, `POST /api/notifications/*` — buzones.
- `GET /api/health`.

## Funcionalidad principal

### Comunidades
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
