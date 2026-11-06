# App Gestión Peñarrubia (Comunidades y Propietarios)

Aplicación web completa para la gestión de la Asociación de Propietarios de Parcelas de Peñarrubia: comunidades de vecinos, propietarios/asociados, inmuebles, inquilinos y documentación con validación automática.

## Arquitectura

- **Backend**: Node.js + Express + SQLite (`node:sqlite`, sin dependencias nativas). API REST, subida de archivos (`multer`) y verificación de contacto por OTP.
- **Frontend**: vanilla JavaScript en módulos ES (sin build step), servido por el propio backend. Persistencia íntegra en base de datos — ya no se usa `localStorage`.
- **Datos demo**: la base se inicializa con datos de ejemplo **solo si está vacía** al arrancar; los cambios persisten entre reinicios.

## Ejecución

```bash
npm install
npm start        # producción (http://localhost:3000)
npm run dev      # desarrollo con recarga (node --watch)
```

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
    verification.js       OTP de teléfono y email (código en consola + devCode)
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

### Control de acceso (RBAC)

La app implementa un modelo de roles en memoria (`admin` / `owner`) con matriz de permisos (`ROLE_PERMISSIONS`):
- **admin**: acceso completo (gestión de comunidades, propietarios, inmuebles, inquilinos, aprobación documental).
- **owner (demo)**: acceso restringido a su propio perfil, sus inmuebles e inquilinos, y lectura de su comunidad.
- Es una demostración de frontend: no sustituye autenticación/autorización de servidor.

## API (resumen)

- `GET /api/bootstrap` — estado completo de la aplicación.
- `POST/PUT/DELETE /api/{communities|owners|properties|tenants}` — CRUD; el servidor resuelve la reasignación de inmuebles entre propietarios y el rearme de relaciones.
- `POST /api/documents` (multipart: `entityType`, `entityId`, `files[]`) · `DELETE /api/documents/:id` · `GET /api/documents/:id/download`.
- `POST /api/owners/contact/{phone|email}/{send|confirm}` — verificación OTP (10 min, 5 intentos). Sin proveedor real de SMS/email, el código se registra en la consola del servidor y se devuelve como `devCode` para pruebas.
- `GET /api/notifications/*`, `POST /api/notifications/*` — buzones.
- `GET /api/health`.

## Funcionalidad principal

### Comunidades
- CRUD con validaciones estrictas (NIF `H` + 8 dígitos, teléfonos de 9 dígitos, email, CP contra catálogo INE con autocompletado municipio/provincia).
- Documentación adjunta con drag & drop multi-archivo y ficha detallada con propietarios censados.

### Propietarios
- Formulario en tres pestañas: **1. Datos personales**, **2. Inmueble** (un único selector que vincula al propietario con un inmueble existente, igual que la asociación «Propietario» del formulario de inmuebles; si el inmueble era de otro dueño se reasigna) y **3. Documentación requerida**.
- Contacto con verificación por OTP de teléfono y email contra el backend.
- Expediente documental (DNI, recibo bancario, escritura) con validación automática client-side (legibilidad, tipo de documento, coincidencia de datos), botones de documento de prueba, aprobación/rechazo administrativo y buzones de notificación.
- IBAN con validación MOD-97, moneda de cuotas, dirección con catálogo territorial.

### Inmuebles
- CRUD completo por comunidad con propietario, tipo, identificador, datos catastrales opcionales, estado de recibos e inquilino vinculado.
- Documentación con dropzone drag & drop.

### Inquilinos
- Alta/edición seleccionando **directamente el inmueble** (el propietario se deduce de él; si se cambia a un inmueble de otro dueño, el inquilino cambia de propietario).
- Pestaña de documentación multi-archivo y ficha con estado del contrato (próximo, vigente, finalizado) y autorizaciones.

## Notas para producción

- La verificación de contacto es demostrativa: no hay proveedor real de SMS/email. Sustituir `src/routes/verification.js` por un proveedor real manteniendo el contrato de la API.
- Los documentos se guardan en disco local (`uploads/`); en producción conviene almacenamiento externo (S3, etc.) y autenticación/autorización en la API.
- `node:sqlite` es el motor embebido de Node (sin dependencias nativas); puede migrarse a `better-sqlite3` o PostgreSQL sin cambiar el contrato REST.
