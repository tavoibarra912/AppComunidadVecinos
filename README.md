# App Gestión de Comunidades (Propietarios e Inquilinos)

Aplicación web para la gestión de comunidades de vecinos, propietarios/asociados, inmuebles, inquilinos y documentación con revisión administrativa.

## Arquitectura

- **Backend**: Node.js + Express + SQLite (`node:sqlite`, sin dependencias nativas). API REST, subida de archivos (`multer`) y control de acceso por sesiones.
- **Frontend**: vanilla JavaScript en módulos ES (sin build step), servido por el propio backend. Persistencia íntegra en base de datos — ya no se usa `localStorage`.
- **Datos demo**: fuera de producción, el arranque llama a `seedIfEmpty()` y `seedDemoFees()` y carga censo y cuotas de ejemplo **solo si faltan**; `APP_DEMO_DATA=false` lo desactiva también en local y una base que arrancó en producción nunca recibe demo. Los cambios persisten entre reinicios.

## Cuotas ordinarias

La gestión está en el menú **Cuotas**, con selector de comunidad y permisos por
comunidad. El propietario tiene el menú **Mis cuotas**, que reúne los recibos de
todos sus perfiles e inmuebles. Las fichas financieras mantienen accesos directos
a estas pantallas. Un administrador que también sea propietario puede alternar
entre la gestión de comunidades y sus cuotas personales.

1. En «Configuración y acuerdos», guardar el importe anual aprobado, periodicidad,
   primer día del mes de aplicación, vencimiento (día 1–28), criterio de reparto y
   referencia al acuerdo. Cada cambio crea una versión y no altera recibos emitidos.
2. Elegir reparto por coeficientes (deben sumar exactamente 100 %, hasta cuatro
   decimales) o importes anuales aprobados por inmueble (deben sumar el total anual).
3. En «Emitir cuotas», seleccionar el mes inicial, revisar importes y avisos y
   confirmar. Los redondeos cuadran por periodo y por ciclo anual; no se duplican
   cargos por copropiedad, ni se permiten periodos solapados o vistas previas obsoletas.
4. Registrar transferencias, ingresos o domiciliaciones ya confirmadas. Un cobro
   puede aplicarse a varios recibos del mismo pagador y comunidad; el sobrante queda
   a favor para aplicarlo después. La devolución revierte también las aplicaciones
   posteriores hechas con ese saldo. No se ejecuta ningún cargo bancario desde la app.
5. Los propietarios pueden consultar sus recibos históricos, descargar un extracto
   CSV y aportar justificantes PDF/JPG/PNG/WebP de hasta 10 MB. Revisar o aceptar un
   justificante no marca el recibo como pagado: el cobro se registra por separado.

La pantalla permite filtrar por periodo, estado, comunidad e inmueble según el
perfil, buscar por titular o referencia y paginar los recibos. Los errores de los
formularios se muestran dentro del diálogo, junto con la validación de importes,
fechas y límites. Cambiar el mes invalida la vista previa de emisión. Al registrar
un cobro se muestra cómo se reparte entre recibos y saldo a favor; la confirmación
de posibles duplicados solo aparece cuando el servidor detecta una coincidencia.

Los permisos `fee:read` y `fee:manage` se configuran en Administración → Roles.
Desde **Cuotas → Certificado de deuda**, los gestores pueden descargar un PDF
informativo por inmueble o por propietario, limitado a la comunidad seleccionada.
El certificado incluye todo ese ámbito, sin aplicar los filtros de la tabla.

Las derramas admiten reparto **mixto**: importes fijos para determinados inmuebles
y el resto por coeficiente. El borrador conserva qué importes son fijos. Los
repartos mixtos antiguos sin ese detalle pueden editar textos y plazos conservando
sus importes; cambiar el reparto requiere reconfigurarlo expresamente.

Editar un acuerdo sin enviar recordatorios conserva los avisos guardados. Las
nuevas emisiones y rectificaciones guardan la moneda en su snapshot; los recibos
anteriores mantienen sus datos y la lectura heredada desde la comunidad. No se
convierte ni se reetiqueta el histórico.

La purga continúa disponible solo por API y con permiso `fee:purge`. No permite
dejar rectificaciones apuntando a un recibo borrado. Una derrama completa puede
purgarse si todos sus recibos están anulados y ninguna referencia queda fuera
del conjunto eliminado.

Los roles de administrador reciben ambos; el rol de usuario recibe consulta
exclusiva de sus perfiles propietarios. Los inquilinos no reciben cuotas por su
condición de inquilinos. Los titulares se conservan en cada recibo y no se puede
eliminar una comunidad, inmueble o propietario con historial financiero mediante el borrado normal.
El borrado avanzado permite excepciones explícitas mediante un asistente y permisos adicionales.
El estado de pagos del inmueble se calcula desde el libro de recibos cuando existe.

En Administración → Configuración se definen los valores iniciales de recordatorios
(3 días antes, 7 después, sin repetición por defecto), canales y plantillas de email.
Cada acuerdo conserva su configuración de avisos. Los recordatorios se procesan con
el servidor encendido, cada 30 segundos, usando Europe/Madrid, sin duplicados y
sin reclamar recibos pagados o anulados. Los avisos internos enlazan al recibo;
los emails requieren activar el canal en el acuerdo, el ajuste general, el proveedor
y el consentimiento del destinatario en sus preferencias de comunicación. La
oposición **«no contactar»** prevalece sobre cualquier canal consentido y cada alta
o baja queda en el historial de consentimientos (`communication_consent_log`), que
el titular consulta en el mismo diálogo; la revisión de destinatarios indica cuántas
cuentas se han opuesto. El email
de cuotas está desactivado inicialmente. Los fallos e interrupciones de envío no se
reintentan automáticamente; quedan en auditoría. La aceptación por el proveedor no
confirma entrega. Los justificantes se guardan dentro de `uploads/fee-proofs/` y
solo pueden descargarlos su autor y los gestores autorizados de la comunidad.

## Borrado avanzado con asistente (#195 y #196)

En **Administración → Roles**, el permiso **Borrado avanzado con asistente**
(`cascade-delete`) habilita la acción **Avanzado** en propietarios, inquilinos,
inmuebles y comunidades. `super_admin` lo tiene automáticamente; los demás roles
requieren asignación expresa. También se comprueban el permiso de borrado de la
entidad principal, los permisos para modificar cada dependencia y los ámbitos de
todas las comunidades afectadas. Cambiar datos financieros exige `fee:manage`.

El asistente recorre selección, dependencias, opciones, resumen y resultado.
Evalúa inmuebles, copropietarios, inquilinos y contratos, comunidades relacionadas,
recibos, pagos, repartos, documentos, notificaciones, publicaciones y cuentas.
Antes de confirmar, el servidor valida el plan y calcula su alcance financiero exacto.

- Los inmuebles pueden conservarse, perder el vínculo con el propietario eliminado,
  reasignarse a otro titular, trasladarse a otra comunidad, trasladarse a una nueva
  comunidad temporal (con nombre y NIF válido) o eliminarse. Al borrar una comunidad,
  también pueden quedar expresamente sin comunidad.
- Los inquilinos pueden conservarse, trasladarse, desvincularse, finalizar su contrato
  y desvincularse, o eliminarse. Un inmueble que se elimina exige resolver cada inquilino.
  Los propietarios conservados mantienen los inmuebles que tengan en otras comunidades.
- El borrado global de propietarios informa todas sus comunidades y exige una casilla
  adicional cuando afecta a varias, incluso si se inicia desde una comunidad.
- Las finanzas se conservan como histórico por defecto. La liquidación final anula
  los recibos afectados, perdona el pendiente y libera los cobros aplicados como saldo
  a favor; no registra pagos ni movimientos bancarios. El acta detalla importes por moneda, el destino del crédito y su referencia de conciliación.
- **Eliminar definitivamente** permite borrar también recibos activos, pagos,
  aplicaciones y justificantes mediante una casilla expresa, sin exigir liquidación
  previa. Los recibos compartidos requieren otra confirmación porque la acción afecta
  al recibo completo y a sus cotitulares. Si un pago también se aplicaba a recibos
  conservados, el resumen avisa de que su pendiente aumentará al retirar esas aplicaciones.
- Al eliminar una comunidad se puede trasladar también su histórico financiero y sus
  publicaciones si todos los inmuebles se trasladan al mismo destino y moneda.
  El traslado de un inmueble por separado conserva los cargos en la comunidad original.
  El certificado de deuda del inmueble sigue disponible en la comunidad de origen aunque la
  ficha ya apunte a otra, y el certificado de destino indica dónde consta ese historial.
  Los repartos de derramas y servicios conservan su fotografía histórica: no se recalculan
  automáticamente al retirar inmuebles ni se redistribuyen importes a otros titulares.
  Si ya no permiten emitir por la retirada, traslado o pérdida de titulares de un inmueble,
  el resumen informa de su cierre para nuevas emisiones; los repartos compartidos exigen
  confirmación adicional. Los recibos ya emitidos mantienen su saldo salvo la acción
  financiera elegida. Una comunidad sin inmuebles admite un destino explícito para su histórico.
- Documentos y notificaciones pueden conservarse en **Administración → Auditoría → Histórico de borrados** o
  eliminarse. Las publicaciones de una comunidad pueden conservarse, trasladarse o
  eliminarse con sus dependencias. El histórico permite consultar actas, descargar los
  datos y recuperar los adjuntos conservados, incluso tras borrar la ficha original.
- Las cuentas de acceso se conservan por defecto. Su eliminación requiere `admin:users`,
  no admite cuentas administrativas ni la cuenta que ejecuta la operación y comprueba
  que no queden perfiles o comunidades asociados; también revoca sus sesiones.

La ejecución usa una transacción `BEGIN IMMEDIATE`, comprueba que las dependencias
sigan coincidiendo con la vista previa y registra auditoría dentro de la transacción.
La revisión final devuelve un `executionToken` firmado, obligatorio al ejecutar, que
incluye el plan, los destinos de reasignación y las cuentas afectadas. Un cambio en
el origen o el destino exige volver a evaluar. Las referencias documentales que solo
se piden al ejecutar (conciliación del saldo a favor y acuerdo de traslado) son
evidencia y no invalidan la revisión. La sincronización de vínculos se limita
a los registros afectados; no ejecuta reparaciones globales.
Un conflicto invalida el plan sin aplicar cambios. Los archivos eliminados se retiran
del disco después del commit. No se generan recordatorios automáticos para perfiles o inmuebles
borrados. Los endpoints de borrado normal conservan sus restricciones anteriores.

API: `GET /api/:collection/:id/cascade-preview` evalúa dependencias;
`POST` en la misma ruta revisa el plan sin ejecutarlo;
`DELETE /api/:collection/:id?cascade=true` ejecuta con las confirmaciones.
`:collection` admite `owners`, `tenants`, `properties` y `communities`.
`GET /api/cascade-archives` y `/api/cascade-archives/:id` consultan históricos
con permiso `cascade-delete` o `audit:read`, además de `document:read` y control de ámbito.

## Comunicaciones y notificaciones personales

La cabecera distingue **Comunicaciones** (avisos generales, eventos y reuniones de
las comunidades dirigidos a la cuenta) de **Mis notificaciones** (documentación,
solicitudes de administración y avisos de cuotas de sus perfiles).
El contador de Comunicaciones refleja publicaciones sin leer, se actualiza al
abrirlas y permite actualizar el buzón o marcar todas como leídas mediante iconos.
Abrir el listado no marca automáticamente cada publicación como leída. Las lecturas
se conservan frente a respuestas atrasadas y el contador se reinicia al cambiar de cuenta.

## Derramas (cuotas extraordinarias)

En **Cuotas** hay tres pestañas: **Cuotas ordinarias**, **Derramas** y
**Servicios**, cada una con sus propios recibos y filtros. En **Derramas → Nueva
derrama** se abre un editor integrado en la página, con secciones **General**,
**Inmuebles**, **Plazos** y **Avisos**. Los campos obligatorios llevan `*`; el
motivo y los ajustes de avisos son opcionales. El motivo admite texto enriquecido,
listas y enlaces saneados.

Indicar nombre, acuerdo de Junta e importe total. En **Inmuebles**, usar el botón
de vincular para buscar y agregar inmuebles existentes, o **Agregar todos** para
incluir toda la comunidad. Cada inmueble se puede quitar con su botón de papelera.
Se puede repartir por coeficientes o importes manuales. Si se incluyen todos,
los coeficientes deben sumar el 100 %; una selección se reparte proporcionalmente.
Los importes manuales deben sumar el total. Solo se admiten comunidades en EUR.

El reparto y los inmuebles incluidos quedan congelados al guardar: los cambios
posteriores de coeficientes o las altas de inmuebles no recalculan la derrama.
Cada plazo tiene importe y vencimiento propios; los vencimientos deben ser
crecientes y los importes sumar el total. La vista previa muestra el reparto antes
de confirmar la emisión de cada plazo. Los redondeos conservan tanto el total del
plazo como el importe aprobado para cada inmueble. Los titulares se identifican al
emitir el recibo, conservando los titulares históricos de los recibos anteriores.
No se permite borrar o mover a otra comunidad un inmueble incluido en una derrama
vigente. Todos los plazos deben asignar al menos un céntimo a cada inmueble;
los repartos que no lo permiten se rechazan antes de guardar.
En **Plazos**, el botón `+` agrega otro plazo y la papelera lo elimina, manteniendo
al menos uno. El formulario muestra cuánto queda por distribuir y valida también
los campos de las pestañas que no estén visibles. El detalle de la derrama separa
**Resumen**, **Plazos** y **Recibos** en pestañas.

Se puede editar el borrador antes de emitir o anular cualquier plazo; al editar se
actualiza el reparto con los datos actuales. Después de la primera emisión no se
permite editar, aunque se anulen todos los recibos. Se pueden anular plazos
pendientes o emitidos y la derrama completa, indicando un motivo. Los cobros
aplicados bloquean la anulación hasta revertirlos. Un plazo anulado no se vuelve
a emitir: para sustituirlo hay que crear una nueva derrama.

Las derramas usan el mismo libro de recibos, cobros, imputaciones, saldos a favor,
justificantes privados y avisos que las cuotas ordinarias. Aparecen identificadas
por nombre y plazo en **Mis cuotas**, el detalle y el CSV del recibo, y sus saldos
se incluyen en el resumen de Inicio. Los canales y recordatorios se configuran
para cada derrama. Las cuotas ordinarias y varias derramas pueden coexistir en
el mismo mes sin duplicar un inmueble dentro del mismo plazo.

Quedan fuera de esta versión el adjunto del acta a la derrama, los mandatos y
remesas SEPA, los intereses, otros cargos y la contabilidad de gastos.

## Servicios y suministros

La pestaña **Servicios**, dentro de **Cuotas**, permite repartir facturas de luz,
agua, gas o gasóleo entre los inmuebles de la comunidad. Se indican proveedor,
número de factura, periodo, fecha de factura, vencimiento e importe total. La foto
o el PDF de la factura se adjunta manualmente como justificante; todavía no hay OCR.
También se pueden cargar a mano las lecturas de contador.

Métodos de reparto disponibles:

- **Coeficiente**: usa el coeficiente de participación de cada inmueble. Si se elige
  un subconjunto, los coeficientes se renormalizan entre los incluidos y se muestra
  el coeficiente efectivo.
- **Lecturas**: reparte según el consumo del periodo. Las lecturas se guardan en
  milésimos de m³; la lectura anterior se propone desde el último servicio emitido
  del mismo suministro. Los inmuebles sin consumo no reciben recibo y se avisa.
- **Mixto**: separa una parte fija por coeficiente y una parte variable por lecturas.
  Para calefacción o refrigeración centralizada, si la parte variable queda fuera del
  60–75 % se muestra la recomendación del RD 736/2020.
- **Manual**: importes por inmueble que deben sumar exactamente el total de la factura.

Cada factura elige entre **emitir un recibo por inmueble** o **solo reparto
informativo**. El reparto y los inmuebles incluidos quedan congelados al guardar:
los cambios posteriores del censo o de los coeficientes no lo recalculan. Los
métodos distintos de coeficiente muestran una advertencia si falta la base legal o
el acuerdo de Junta que los autoriza (LPH art. 9.1.e y 9.2; RD 736/2020 arts. 6.1
y 6.4). Solo se admiten comunidades en EUR.

Los recibos de servicio reutilizan el mismo libro de cobros, imputaciones, saldos a
favor, justificantes y avisos que las cuotas ordinarias y las derramas. Aparecen
identificados en **Mis cuotas**, el detalle del recibo, el CSV y el resumen de
Inicio. En modo informativo no se crean recibos ni deuda: el propietario ve el
reparto en la pestaña **Servicios** de **Mis cuotas**, con su parte, las lecturas y
la factura adjunta. La descarga de la factura está disponible para gestión, para
los titulares de recibos del servicio y para los propietarios actuales de los
inmuebles incluidos. Los adjuntos admiten PDF, PNG, JPG o WebP de hasta 10 MB
(máximo 10 por factura), se guardan en `uploads/service-bills/` y solo se pueden
eliminar mientras la factura es borrador. No se puede borrar ni mover a otra
comunidad un inmueble incluido en un servicio vigente.

API de servicios (gestión: sesión y `fee:manage` en la comunidad):
`GET/POST /api/fees/communities/:communityId/services`;
`GET/PUT /api/fees/services/:serviceId`;
`POST /api/fees/services/:serviceId/preview|issue|cancel`;
`POST /api/fees/services/:serviceId/attachments`;
`GET /api/fees/service-attachments/:attachmentId/download` y
`DELETE /api/fees/service-attachments/:attachmentId`. La descarga también está
disponible para los titulares de recibos y los propietarios incluidos; el borrado
sigue reservado a gestión y solo en borrador.

Quedan fuera de esta versión el OCR, las plantillas recurrentes, las facturas
negativas o abonos, los métodos por igual/superficie/personas, SEPA, intereses y
la contabilidad de gastos.

## Estatutos y biblioteca documental

Los estatutos de cada comunidad se gestionan en la pestaña **Estatutos** del
editor y de la ficha de comunidad, y también desde el acceso directo **Estatutos
de la comunidad** del inicio. Una comunidad puede tener uno o varios documentos
vigentes o históricos. Todos los residentes con acceso a la comunidad pueden
consultarlos, previsualizarlos y descargarlos; subirlos, reemplazarlos,
renombrarlos o borrarlos requiere ser administrador de esa comunidad y tener los
permisos documentales correspondientes. La ficha muestra nombre, tipo, tamaño,
fecha de subida y la cuenta que subió cada archivo.

La documentación general de comunidades, inmuebles e inquilinos usa una
**biblioteca documental reutilizable** con carpetas:

- Crear, renombrar y eliminar carpetas, con **20 iconos y 10 colores** personalizables y hasta **cinco niveles** de
  anidamiento (la raíz no cuenta como nivel). Las carpetas y los archivos se
  mueven con arrastrar y soltar o con **Mover a…**.
- Navegación por migas de pan, búsqueda por nombre, orden por nombre, fecha o
  tamaño y vistas de lista o cuadrícula.
- Subida directa dentro de la carpeta abierta. Se mantienen los límites y
  formatos configurados en Administración → Configuración (PDF, JPG, PNG, WebP,
  DOC y DOCX; tamaño y cantidad máximos), con validación del contenido en el
  servidor. Los formatos Word sólo se descargan, sin vista previa.
- No se permiten dos carpetas con el mismo nombre en el mismo nivel ni dos
  archivos con el mismo nombre en la misma carpeta, sin distinguir mayúsculas ni
  acentos. Sí puede repetirse un nombre en carpetas distintas.
- Al eliminar una carpeta con contenido se muestra primero el recuento de
  carpetas y archivos afectados; tras confirmar, el borrado es en cascada y
  elimina también los archivos físicos. Una carpeta no puede moverse dentro de
  sí misma.
- Los permisos existentes se aplican sin cambios: `document:read` para consultar,
  y el permiso de gestión de la entidad más `document:upload` o
  `document:delete` para escribir. Los administradores de comunidad sólo operan
  sobre sus comunidades asignadas; los vecinos acceden en modo lectura a sus
  comunidades, inmuebles e inquilinos.

La ruta indica «Ubicación actual → Carpeta principal» y permite volver a cualquier
carpeta del recorrido. El selector de orden es compacto y el botón ascendente/descendente
está separado y alineado. El editor de carpetas ofrece vista previa, elección mediante
teclado y guardado con disquete; icono y color se conservan al volver a cargar.
La columna `document_folders.color` se añade automáticamente con color turquesa
para las carpetas existentes, sin alterar sus nombres ni documentos.

La migración `document-library-v1` añade las columnas y la tabla de carpetas sin
mover ni borrar archivos: todos los documentos existentes quedan en la raíz de
su entidad. La categoría `statutes` separa los estatutos de la documentación
general y no admite carpetas.

La migración `community-nif-v1` corrige los NIF de demostración que quedaron con
un dígito de control incorrecto en bases creadas con semillas antiguas; solo
actúa si el valor guardado sigue siendo exactamente el heredado.

## Ejecución

```bash
npm install
npm start        # producción (http://localhost:3000)
npm run dev      # desarrollo con recarga (node --watch)
npm run restart  # Windows: libera el puerto de la app y vuelve a arrancar
```

Abre **http://localhost:3000/** en Firefox (o el puerto configurado con `PORT`).
El frontend y la API deben salir del mismo servidor Node; Live Server de VS Code
no sirve la API. Para los usuarios demo iniciales, el usuario y la contraseña
coinciden (por ejemplo, `super_admin` / `super_admin`), salvo que hayas cambiado la contraseña.

Cuentas demo estándar (usuario = contraseña = email local = nombre):

| Usuario                                    | Rol             | Escenario                                     |
| ------------------------------------------ | --------------- | --------------------------------------------- |
| `super_admin`                              | super_admin     | Acceso total, sin perfil                      |
| `admin`                                    | administrator   | Crea y administra todas las comunidades       |
| `comm_admin`                               | community_admin | Administra la comunidad asignada (Peñarrubia) |
| `usuario_r_user_s_perfil`                  | user            | Sin perfil vinculado                          |
| `usuario_r_user_c_propietario`             | user            | Con perfil de propietario                     |
| `usuario_r_user_c_inquilino`               | user            | Con perfil de inquilino                       |
| `usuario_r_user_c_propietario_c_inquilino` | user            | Con perfiles de propietario e inquilino       |

Permisos destacados configurables por rol (Administración → Roles):

- **`owner:delete`** — eliminar un socio. Por defecto solo lo tiene `super_admin`;
  otorgáselo al rol `administrator` si quieres que el administrador general pueda
  hacerlo (el borrado se bloquea si el socio tiene un inmueble con inquilino).
- **`comm:participacion`** — participar en Comunicación: comentar (con nombre),
  votar encuestas y confirmar asistencia a reuniones. Activado por defecto para
  `administrator`, `community_admin` y `user`; desmarcalo en un rol y ese rol ve
  las publicaciones de forma informativa (sin la parte social). `super_admin`
  siempre participa.

**Avisos por email de cambios de perfiles**: en Configuración → General, la
clave _Email(s) para avisar cambios de perfiles_ acepta una o varias
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
    documents.js          Documentos, estatutos y carpetas (multer, 15 MB)
    notifications.js      Buzón del administrador y del propietario
    verification.js       contacto (envío no configurado)
    issues.js             reportes de usuarios enviados a GitHub
  document-library.js     Servicio genérico de carpetas, jerarquía y permisos
public/
  index.html · styles.css
  js/
    main.js               Bootstrap: carga de estado + render global
    api.js                Cliente fetch de la API
    state.js              Estado en memoria + refreshState + selectores
    utils.js              Formateadores, validadores y helpers de documentos
    territory.js          Catálogo INE (provincia → municipio → CP)
    docs-engine.js        Motor de validación del expediente de propietario
    document-library.js   Componente de biblioteca documental (carpetas, DnD)
    municipios-ine.js     Catálogo territorial (8.132 municipios, script clásico)
    features/             navigation, home, comunidades, propietarios,
                          inquilinos, inmuebles, notificaciones
```

## Modelo de datos

- `communities`: datos de la comunidad + documentación adjunta.
- `owners`: datos personales, verificación de contacto, IBAN y **expediente de documentación** (JSON del motor de validación client-side).
- `properties`: inmuebles con **uno o más propietarios** (`ownerIds`, N:M) y **uno o más inquilinos** (`tenantIds`), pertenecientes a una única comunidad. `parcelId` apunta a su finca matriz cuando tiene referencia catastral.
- `parcels`: fincas matriz derivadas de la referencia catastral, únicas por comunidad; agrupan los inmuebles/unidades que comparten referencia y se eliminan cuando quedan sin unidades.
- `tenants`: inquilinos con propietario e inmueble, contrato (tipo, renta, fianza, teléfono de emergencia) y autorizaciones.
- `documents`: archivos subidos (por entidad: comunidad, inmueble o inquilino), con carpeta, categoría (`document` o `statutes`), autor de la subida y archivo en disco.
- `document_folders`: carpetas por entidad, con jerarquía (`parentId`) y nombre normalizado para evitar duplicados por nivel.
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

### Derecho de supresión (RGPD)

Cualquier titular puede pedir la baja de su cuenta desde **Mi perfil → Privacidad y
datos**. La solicitud no borra nada por sí sola: queda pendiente para que la
administración la revise, y el motivo es opcional (máx. 500 caracteres). Para
enviarla hay que confirmar la contraseña actual, igual que en el cambio de
contraseña, y los intentos fallidos consumen el mismo limitador por cuenta
(15 fallos cada 15 minutos). Mientras siga pendiente, el titular puede cancelarla
y también puede volver a solicitarla si se rechaza.

Quien tenga el permiso `admin:users` ve la cola en **Administración → Usuarios →
Solicitudes de baja (RGPD)**. Puede aprobar, lo que elimina la cuenta en el mismo
acto, o rechazar con una nota que el titular verá en su perfil. Al aprobar se
borran las sesiones, los enlaces de recuperación de contraseña, las preferencias
de aviso y los avisos aún no enviados de esa cuenta; los perfiles de propietario e
inquilino y las comunidades que administraba quedan desvinculados. También se
borra el historial de «Reportar un error» en Postgres y se anonimiza la autoría de
los documentos, carpetas, comentarios y publicaciones que hubiera creado, que se
conservan sin nombre porque forman parte de la documentación y de los hilos de la
comunidad. También se anonimiza la copia de su ficha conservada en el acta de un
borrado avanzado (identidad, DNI, contacto, dirección e IBAN), manteniendo el
vínculo por id, los importes y las fechas del registro contable. Si
el historial de reportes no se puede purgar, el borrado no se ejecuta y la
administración puede reintentarlo. Se conservan los recibos, cobros, derramas,
actas y la auditoría de seguridad, que son registro contable y de seguridad, sin
datos de acceso. El motivo y la nota se descartan al
ejecutar el borrado. La solicitud expone el plazo de respuesta de un mes (art.
12.3) y la administración ve las que están vencidas. Nunca se puede eliminar un usuario con ficha de propietario o
inquilino vinculada ni el último superadministrador activo. Cada paso queda en la
auditoría (`users.deletion-requested`, `users.deletion-cancelled`,
`users.deletion-rejected`, `users.deleted`).

### Aviso de privacidad (art. 13 RGPD)

**Mi perfil → Privacidad y datos → Aviso de privacidad** abre la información del
artículo 13: quién es el responsable, qué categorías de datos se tratan (cuenta,
comunidad, documentos y comunicaciones, avisos, seguridad y bajas), para qué y con
qué base legal del artículo 6, los plazos de respuesta del artículo 12.3, cuánto se
conservan —incluido lo que sobrevive a la baja y qué se anonimiza— y quién más los
ve. El texto es estático (`#privacy-notice-dialog` en `public/index.html`): si
cambia un tratamiento, se actualiza en el mismo cambio.

### Acceso y portabilidad (arts. 15 y 20 RGPD)

**Mi perfil → Privacidad y datos → Descargar mis datos** genera un paquete JSON con
la cuenta, los consentimientos y su historial, las fichas de propietario o
inquilino vinculadas, sus comunidades, los recibos y cobros propios, sus
comentarios y el estado de su solicitud de baja. `GET /api/auth/my-data` lo sirve
como descarga, exige sesión, no necesita ningún permiso de gestión, queda auditado
(`users.data-exported`) y nunca incluye datos de terceros: los recibos van sin la
instantánea compartida y los cobros solo del titular. Los endpoints de exportación
con `export:read` siguen siendo la vía de la administración.

### Información de tratamientos (art. 30 RGPD)

`public/informacion-tratamientos.html` (accesible desde _Privacidad y datos_) resume
las actividades que la aplicación trata realmente, con finalidad, base legal,
destinatarios y conservación. `docs/rat-actividades-tratamiento.md` es la plantilla
cumplimentable del registro y la guía para el responsable; no se implementa un
módulo de cumplimiento.

### Recuperación de contraseña

Desde «Olvidé mi contraseña», indica el email de la cuenta. La respuesta es igual
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
y fallidos, cierres de sesión, accesos a la API denegados y altas/cambios/bajas de usuarios
y roles. Incluye fecha UTC (mostrada en horario local), actor, recurso, resultado,
IP y valores anteriores/posteriores de campos administrativos permitidos. También
registra solicitud, envío y finalización de recuperación. No guarda contraseñas,
cookies, tokens, cuerpos completos ni parámetros de consulta.

El tab es un permiso de rol: solo se ve con «Ver auditoría» (`audit:read`), que
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

- `GET /api/bootstrap` — estado permitido para el usuario autenticado; incluye el `parcelId` de cada inmueble visible y **solo** las parcelas/fincas matriz de esos inmuebles: un residente no recibe las referencias de las unidades vecinas que no puede abrir.
- `POST/PUT/DELETE /api/{communities|owners|properties|tenants}` — CRUD; el servidor resuelve la reasignación de inmuebles entre propietarios y el rearme de relaciones.
- `GET /api/documents?entityType=&entityId=&category=` — documentos y carpetas de la entidad.
- `POST /api/documents` (multipart: `entityType`, `entityId`, `folderId`, `category`, `files[]`) · `PATCH /api/documents/:id` (renombrar o mover) · `POST /api/documents/:id/replace` · `DELETE /api/documents/:id` · `GET /api/documents/:id/download` · `GET /api/documents/:id/preview` (sólo PDF e imágenes).
- `POST /api/documents/folders` · `PATCH /api/documents/folders/:id` (renombrar o mover) · `DELETE /api/documents/folders/:id?confirm=1` (cascada con confirmación).
- `POST /api/owners/contact/{phone|email}/{send|confirm}` — responde con un aviso de servicio no configurado; no genera códigos de prueba.
- `GET /api/notifications/*`, `POST /api/notifications/*` — buzones.
- `GET/POST/DELETE /api/auth/deletion-request` — baja de cuenta del propio titular (RGPD).
- `GET /api/admin/users/deletion-requests` · `POST /api/admin/users/deletion-requests/:id/{approve|reject}` — revisión de bajas (`admin:users`).
- `GET/POST /api/issues` — configuración y creación de reportes de error con adjuntos en GitHub.
- `GET /api/health`.

## Funcionalidad principal

### Inicio

- Panel con métricas de los registros visibles para la cuenta, filtro de comunidad y actualización manual. Los inmuebles con varios titulares se cuentan una sola vez; el usuario ve sus vínculos reales, incluidas varias comunidades si corresponde.
- Gráficos de documentación e inmuebles, avisos pendientes, agenda y últimas publicaciones. La documentación de ejemplo no acredita un expediente; los contratos sin fechas válidas se identifican aparte. Los accesos se muestran según permisos, incluido el acceso directo a los estatutos de la comunidad.

### Comunidades

- En **Ver**, solo están habilitados las pestañas, el cierre y la apertura de los adjuntos. No se puede editar, verificar contactos, asociar inmuebles ni abrir sus fichas desde esa vista. La edición se recupera al abrir **Editar**.
- Año de constitución mediante selector y fondo de reserva numérico no negativo con hasta dos decimales. El servidor valida ambos campos, incluido el importe cero.
- CRUD con validaciones estrictas (NIF de comunidad/CIF `H` + 7 dígitos + dígito numérico de control, teléfonos de 9 dígitos, correo electrónico, CP contra catálogo INE con autocompletado de municipio y provincia). El NIF se normaliza antes de validar y guardar: admite minúsculas y separadores habituales (espacios, puntos y guiones), y conserva la comprobación del dígito de control.
- Documentación adjunta y ficha con propietarios censados. La gestión de archivos y estatutos se describe en [Estatutos y biblioteca documental](#estatutos-y-biblioteca-documental).
- La pestaña **Estatutos** permite configurar el régimen jurídico (comunidad de propietarios LPH o asociación) y las reglas de deuda de copropietarios, crédito al borrar un titular, traslados y votaciones. Se guardan con la comunidad y se aplican al certificado de deuda, al crédito del borrado avanzado, al traslado documentado y a las consultas nuevas; el destino del crédito y su referencia de conciliación, y el criterio de traslado de deuda con su referencia quedan en el acta, pero el asistente sigue exigiendo elegir expresamente si mueve el libro financiero. Son criterios orientativos que deben validarse con los estatutos y títulos antes de emitir certificados formales o votaciones vinculantes. El régimen jurídico debe estar declarado de forma explícita: los certificados de deuda y las votaciones nuevas se bloquean si la comunidad no lo tiene configurado, y la migración convierte el antiguo valor implícito en LPH para las comunidades existentes.

### Propietarios

- Formulario en tres pestañas: **1. Datos personales**, **2. Inmueble** (un único selector que vincula al propietario con un inmueble existente, igual que la asociación «Propietario» del formulario de inmuebles; si el inmueble era de otro dueño se reasigna) y **3. Documentación requerida**.
- Contacto guardado sin exigir un proveedor de verificación todavía no configurado.
- Expediente documental (DNI, recibo bancario, escritura) con comprobaciones de formato y revisión administrativa manual, botones de documento de prueba, aprobación/rechazo administrativo y buzones de notificación.
- IBAN con validación MOD-97, moneda de cuotas, dirección con catálogo territorial.

### Inmuebles

- CRUD completo por comunidad con propietario, tipo, identificador, datos catastrales opcionales, estado de recibos e inquilino vinculado.
- **Finca matriz y referencia catastral**: la misma referencia dentro de una comunidad agrupa varias unidades en una sola parcela; en otra comunidad se rechaza. La referencia se normaliza y, al elegir una parcela, se completa y bloquea. Al cambiar de comunidad se limpian referencia y parcela, porque pertenecen al censo de origen.
- Los checksums inválidos se toleran en fichas y parcelas heredadas y en la importación BASE 26, donde quedan avisados; una referencia nueva sí debe superar el control. La ficha, la tabla, la exportación y los certificados muestran la referencia y, cuando corresponde, «Unidad X de N».
- La pestaña **Propietarios** del alta empieza con la **ocupación del inmueble**: se indica si vivirá el propietario (opción predeterminada, sin contrato y con la pestaña Inquilinos deshabilitada) u otra persona (se habilita la pestaña Inquilinos para asociar o crear su ficha). En un inmueble ya creado la pregunta no se muestra y la pestaña Inquilinos está siempre disponible.
- Documentación con biblioteca de archivos y carpetas, disponible también en la ficha de consulta.

### Inquilinos

- Alta/edición seleccionando **directamente el inmueble** (el propietario se deduce de él; si se cambia a un inmueble de otro dueño, el inquilino cambia de propietario).
- Pestaña de documentación multi-archivo, biblioteca de archivos y carpetas, y ficha con estado del contrato (próximo, vigente, finalizado) y autorizaciones.

### Comunicación: tablón, calendario y reuniones

- **Comunicación** está disponible desde la navegación y el buzón **Comunidad** de la barra superior, también para inquilinos. El contador muestra las comunicaciones sin leer. **Mis canales** permite aceptar o revocar avisos externos por cuenta; dentro de la app siempre están disponibles.
- Los administradores con permiso para gestionar la comunidad crean avisos, eventos y reuniones en tres pasos: contenido, destinatarios y revisión. Admiten borradores, programación, inicio/fin, archivo, prioridad, fijado y recordatorios. Las fechas se guardan en UTC y se muestran en la zona local del navegador.
- Destinos: toda la comunidad, propietarios, inquilinos o selección de perfiles/unidades. Una unidad seleccionada incluye sus propietarios e inquilinos vigentes; se deduplican cuentas. La vista previa identifica perfiles sin cuenta activa. La distribución guarda la lista de cuentas destinatarias; nuevos vecinos no reciben publicaciones históricas. La desvinculación o el fin del contrato revocan el acceso.
- El detalle separa publicación, participación, reunión y seguimiento. Lectura y confirmación de recepción se registran por separado. Las ediciones publicadas se versionan, vuelven a marcar el aviso como pendiente y generan avisos de actualización. El guardado detecta conflictos de edición.
- Reuniones: lugar/videollamada HTTPS, orden del día, confirmación de invitación, asistencia real, acuerdos y tareas con responsable/vencimiento. Los adjuntos admiten PDF/JPG/PNG, hasta 10 MB por archivo y 30 archivos por publicación. Se comprueba el contenido y cada descarga requiere sesión y acceso a esa publicación.
- Las actas se suben como borradores privados de administración. **Publicar acta** habilita esa versión para destinatarios y genera un aviso. Las versiones publicadas se conservan; las correcciones se suben como versiones nuevas.
- Comentarios habilitables por publicación, eliminación propia y moderación administrativa. Encuestas/votaciones de una pregunta con 2–12 opciones, respuesta simple o múltiple, cierre por fecha o manual y electorado de destinatarios o propietarios/socios destinatarios según el régimen jurídico. Una respuesta inmutable por cuenta; los resultados son agregados y pueden mostrarse en vivo o al cerrar. En votaciones, la unidad de cómputo (cuenta, propietario, inmueble o coeficiente), la regla de copropiedad y la mayoría ordinaria se congelan desde el régimen jurídico de la comunidad al crear la consulta. El censo de titularidades y coeficientes LPH se conserva al publicar para que una transferencia posterior no duplique peso; el peso de cada respuesta queda guardado al votar. Las consultas antiguas sin regla conservan el cómputo por cuenta al editarlas o cerrarlas. Las votaciones ponderadas anteriores sin censo se fijan antes de su primera respuesta; si ya tienen votos, deben cerrarse y crearse de nuevo para seguir recibiendo respuestas sin mezclar repartos históricos. En las asociaciones el censo son los socios (`isMember`) y sus derechos estatutarios, aunque no tengan inmueble; no se aplican coeficientes y cada cuenta computa una sola vez aunque tenga varios registros de socio. Las encuestas informativas siguen contando una respuesta por cuenta.

### Proveedores SMTP, SMS y WhatsApp

La configuración vive en **Administración → Configuración → Proveedores de
comunicación** (sub-tab; ya no es un modal) y requiere el permiso de rol
«Configurar proveedores de comunicación» (`admin:providers`), que se otorga en
el editor de roles. Ese control también se aplica en la API y no depende de
mostrar u ocultar botones; los accesos directos «Proveedores de envío»
(Comunicación) llevan a esa pantalla solo a quien tiene el permiso.

- **SMTP:** servidor, puerto, TLS directo o STARTTLS obligatorio, usuario, contraseña y remitente. Implementado con [Nodemailer](https://nodemailer.com/smtp). No se desactiva la validación de certificados.
- **SMS:** Twilio, con Account SID, Auth Token y teléfono emisor internacional.
- **WhatsApp:** Twilio, con emisor habilitado y Content SID de una plantilla aprobada. La plantilla debe tener una variable de texto `{{1}}` para el aviso. Se utiliza la [API de mensajes de Twilio](https://www.twilio.com/docs/messaging/api/message-resource).
- Los proveedores vienen desactivados. **Enviar prueba** hace un envío real al destino indicado, después de guardar la configuración. Los envíos de publicaciones requieren que el autor elija el canal y que el destinatario lo haya aceptado en **Mis canales**.
- Las contraseñas/tokens se cifran con AES-256-GCM y nunca se devuelven al navegador. Un campo vacío conserva la credencial; la casilla de eliminación la borra. `APP_PROVIDER_KEY` admite una clave de 32 bytes codificada en 64 caracteres hexadecimales. Sin esa variable se genera `data/provider-key` (o dentro de `APP_DATA_DIR`). La clave debe conservarse junto con la base en una copia de seguridad privada; cambiarla impide descifrar las credenciales existentes. Estos datos locales están excluidos de Git.
- Una cola SQLite procesa programación, recordatorios y envíos cada 30 segundos mientras el servidor está encendido. Los envíos aceptados no se repiten automáticamente. Los canales no autorizados o desactivados se registran como omitidos. Los fallos y las respuestas inciertas permiten reintento explícito desde Seguimiento; conviene revisar el proveedor para evitar duplicados tras una interrupción.
- **Aceptado por el proveedor** no confirma entrega ni lectura: no hay un webhook de confirmación de entrega. El buzón de la app y sus lecturas son independientes. El SMTP también se utiliza para recuperación de contraseña cuando `APP_PUBLIC_URL` está configurado; la verificación OTP sigue desactivada.

API del módulo: `GET /api/communications/{metadata|posts|preferences}`, `POST /preview`, `POST /posts`, `GET/PUT /posts/:id`, acciones `read`, `receipt`, `comments`, `ballot`, `rsvp`, `attendance`, `retry` y `files`. `GET/PUT /providers` y `POST /providers/test` están restringidos al superadministrador. Las tablas se crean de forma idempotente al arrancar, sin sustituir los datos existentes.

### Reportar un error desde la app

Cualquier cuenta con sesión iniciada ve un botón flotante con forma de insecto en
la esquina inferior derecha. Abre un formulario con título, descripción y pasos
para reproducir con formato enriquecido, además de adjuntos múltiples. Al
enviarlo se crea un issue real en GitHub con la etiqueta `User-Detected-Issue`.
La confirmación solo muestra un agradecimiento y el botón Cerrar, sin enlaces
ni identificadores de GitHub.

- El título y la descripción son obligatorios. Los adjuntos siguen la misma
  configuración general que los documentos (tipos permitidos, tamaño máximo por
  archivo y número máximo de archivos), con un tope adicional de 50 MB por
  reporte.
- Los adjuntos se suben como commits a la rama `main` del
  repositorio y se enlazan desde el cuerpo del issue. El issue nunca se publica
  como creado si GitHub devuelve un error; en ese caso se retiran los adjuntos
  que se hubieran subido.
- Si main exige PR, la integración usa una rama temporal y la elimina después
  de fusionar los adjuntos, sin cambiar las protecciones del repositorio.
- El contexto automático incluye usuario, rol, fecha, pantalla, navegador,
  idioma y resolución. No se envía el correo electrónico del usuario.
- Cada cuenta puede crear como máximo cinco reportes cada diez minutos. La API
  exige sesión y origen del mismo servidor (`GET/POST /api/issues`).
- La integración se configura en el servidor con variables de entorno (o un
  archivo `.env` local, ignorado por git):

  ```bash
  GITHUB_ISSUES_TOKEN=...            # token con Issues y Contents: Read and write
  GITHUB_ISSUES_REPO=tavoibarra912/AppComunidadVecinos
  GITHUB_ISSUES_LABEL=User-Detected-Issue
  GITHUB_ISSUES_ATTACHMENTS_BRANCH=main
  ```

  Puedes obtener un token con `gh auth token`. Sin `GITHUB_ISSUES_TOKEN` el
  formulario sigue visible para probar la interfaz, pero muestra un aviso y no
  permite enviar. Copia `.env.example` como `.env` y reinicia el servidor.

## Comprobaciones

`npm test` ejecuta pruebas de dominio, arranque desde cero, migraciones, sesiones,
permisos, rutas HTTP, subidas y referencias de JavaScript. Las pruebas crean sus
bases y archivos dentro de directorios temporales y no usan los datos locales.

## Ejecución y datos existentes

Por defecto, el servidor escucha solo en 127.0.0.1. `HOST` permite elegir otra
interfaz de red. `PORT` cambia el puerto. `APP_DATA_DIR` y `APP_UPLOADS_DIR`
permiten aislar la base y los archivos; sin configurarlos se conservan las rutas
`data/penarrubia.db` y `uploads/`.

Las migraciones conservan las contraseñas existentes, salvo las credenciales
predecibles que la migración anterior había generado para cuentas SSO. Esas
cuentas necesitan una contraseña asignada por el administrador. Al arrancar se
reconstruyen las referencias derivadas de inquilinos; los titulares borrados por
versiones anteriores no pueden recuperarse sin una copia de seguridad.

## Producción

### Demo local y datos de producción

La base local (`data/penarrubia.db`, o `APP_DATA_DIR`) y la de producción
(`/home/quantum_system/comunidad/data` en la VM) son independientes y no se
sincronizan. Los despliegues solo reemplazan imagen y código: el volumen de
producción conserva sus comunidades, propietarios, recibos y documentos.

Para regenerar la demo local basta con borrar `data/` (o usar otro
`APP_DATA_DIR`); `APP_DEMO_DATA=false` evita sembrarla. Fuera de producción el
arranque siembra censo y cuotas solo si faltan, nunca sobre datos existentes.
Con `NODE_ENV=production` no se siembra nada y la base queda marcada con
`production-database-v1`: aunque después se abra desde un equipo local, no
recibirá censo, cuotas ni cuentas demo.

`scripts/snapshot-deploy.mjs` sirve solo para la primera transferencia de una
base existente a producción; después, los datos reales se crean o corrigen
desde la web publicada, no reenviando el `.db` local. Para cargar un lote
puntual, preparar una importación revisada, ejecutar `deploy/backup.sh` y
aplicarla con la API detenida o sobre una copia; no editar a mano el `.db`
activo.

### Despliegue híbrido de coste mínimo

**Estado a 16 de noviembre de 2026:** publicación temporal completa en GCP,
`https://penarrubia.35.209.188.202.sslip.io`. Reutiliza la VM/IP y el certificado
gratuito de Let's Encrypt se renueva con el timer ya existente de MyGym.
`sslip.io` resuelve el nombre a la IP actual sin comprar un dominio; depende
de ese servicio DNS y, si cambia la IP, cambia también esta dirección.
El consumo adicional puede generar tráfico facturable fuera de cuota.
La API de Netlify rechazó la publicación de producción por créditos agotados,
aunque el resumen de la cuenta no señalaba límites excedidos. La renovación
indicada es el 13 de diciembre de 2026. Existe un borrador de validación protegido
por Netlify; la URL de Netlify no está disponible para uso normal.

El frontend para el híbrido se prepara con `npm run build:netlify` y su destino es
`https://gestion-penarrubia.netlify.app` (sitio Netlify
`60d02ac0-8740-489e-852d-b4f48342c744`). Solo `dist/` se sube a Netlify.
El HTML inicial y `/api/*` se reenvían por HTTPS a
`https://35.209.188.202/comunidad/`, en la VM existente `wger-server`,
proyecto `wger-mygym`, zona `us-central1-a`. Los estáticos y DOMPurify se sirven
desde Netlify. El HTML mantiene la marca y los ajustes actuales sin reconstruir
la web. `APP_BACKEND_URL` permite cambiar el destino del proxy al compilar.

El backend usa Node.js 24 en un contenedor independiente, con límite de 192 MB,
0,5 CPU, logs rotados y sin puertos públicos propios. Reutiliza la red Docker,
IP y certificado de la instalación existente. Los datos viven en
`/home/quantum_system/comunidad/{data,uploads}` y nunca dentro de la imagen.
La API y el HTML dinámico llevan `Cache-Control: no-store`.

No se crean máquinas, IPs, discos, bases gestionadas, dominios ni planes de pago.
La VM/IP existentes mantienen sus costes y el tráfico adicional puede consumir
cuota. Netlify debe permanecer en Free y sin recarga automática: sus créditos
son compartidos por los sitios del equipo y, al agotarlos, puede pausar las webs.
El despliegue automático publica al actualizar la rama
predeterminada del repositorio: cada publicación de Netlify
consume los créditos del equipo. Una falta de créditos hace fallar la ejecución;
no se añaden créditos ni se cambia el plan automáticamente.

### Despliegue automático con GitHub Actions

**Conservación de producción:** desplegar código no autoriza reemplazar o
restaurar la base ni cambiar usuarios o contraseñas. Esas operaciones necesitan
un pedido explícito del usuario; la carga inicial del Excel fue una excepción
puntual. Ver [las reglas permanentes](AGENTS.md) y el
[procedimiento y las protecciones](docs/puesta-en-produccion-base26.md).
El deploy ensaya el arranque sobre una copia aislada y aborta si altera datos o
credenciales existentes. Si falta la base, el servidor no crea una nueva.

Cada actualización de la rama predeterminada del repositorio
inicia **dos workflows independientes**, tanto si llega de un merge de PR como
de un push directo. Ambos escuchan `push`: fusionar una PR no duplica el despliegue.
La rama predeterminada se consulta en el evento de GitHub; cambiar su nombre no
requiere editar una lista fija. Las demás ramas y los tags no despliegan. Las PR
hacia la rama predeterminada ejecutan validación, sin acceso a secretos ni publicación.

- **Deploy to Netlify** (`.github/workflows/deploy-netlify.yml`): instala con
  Node.js 24, ejecuta las pruebas, construye y empaqueta `dist/`, publica solo
  los estáticos en el sitio Netlify configurado y espera la confirmación de
  producción. Verifica `release.json` y el JavaScript público del sitio sin
  consultar la API ni el HTML que se sirven desde GCP.
- **Deploy to GCP** (`.github/workflows/deploy-gcp.yml`): instala con Node.js 24,
  ejecuta las pruebas y valida Bash; transfiere el commit exacto por SSH a
  `/home/quantum_system/comunidad/releases/<SHA>`, sin requerir un clon de Git.
  Construye la imagen en el runner de GitHub y la carga por SSH en la VM sin
  compilar allí. Comprueba su etiqueta de commit antes de detener el servicio y hace backup privado de
  SQLite, documentos, clave de proveedores, `.env` y Compose, y actualiza solo
  `api`. Conserva datos, credenciales, UID/GID, red, alias y límites de recursos.
  Comprueba por HTTPS la API, el HTML y los estáticos del commit publicado.

Cada workflow tiene su propia validación, artefactos, secretos, cola y resultado.
**Ninguno espera al otro.** Si falla Netlify, GCP continúa y puede quedar en verde;
si falla GCP, Netlify sigue intentando publicar sus estáticos. La publicación
completa exige éxito en ambos. La web de Netlify sigue usando la API y el HTML
de GCP, por lo que su disponibilidad funcional depende del backend aunque sus
publicaciones sean independientes. Al ejecutarse en paralelo puede haber un
intervalo con versiones distintas entre proveedores.

Ambos admiten _Run workflow_ sobre la rama predeterminada,
para reintentar cada proveedor por separado. Comprobado el 16/11/2026: Netlify
responde HTTP 403, «Account credit usage exceeded - new deploys are blocked until
credits are added»; su dominio actual devuelve 401 por protección del borrador.
Ese bloqueo deja en rojo solo **Deploy to Netlify**. GCP sirve la aplicación
completa por su propia URL.

Los seis secretos de Actions están configurados en el repositorio:

- `VM_HOST`: IP pública de la VM existente.
- `VM_USER`: `quantum_system`.
- `VM_SSH_KEY`: clave dedicada a este despliegue, autorizada en la VM.
- `VM_KNOWN_HOSTS`: clave pública de host comprobada contra la VM; SSH exige
  que coincida, sin aceptar claves obtenidas de la red durante el despliegue.
- `NETLIFY_AUTH_TOKEN`: token de la cuenta conectada de Netlify.
- `NETLIFY_SITE_ID`: `60d02ac0-8740-489e-852d-b4f48342c744`.

Cada proveedor ejecuta un despliegue a la vez; GCP y Netlify pueden trabajar en
paralelo. Se usa `queue: max` para encolar ejecuciones sin sustituir la pendiente
(hasta el límite de 100 de GitHub), y no se interrumpe un despliegue en curso.
La VM también usa un bloqueo local. Los backups e
imágenes anteriores se conservan. Si falla el backup se reinicia la versión
anterior; si la nueva versión no pasa salud, se informa del backup sin restaurar
la base automáticamente, porque las migraciones pueden necesitar revisión.
El despliegue reinicia brevemente la API; no ofrece actualización sin interrupción.

No activar Functions, AI, analítica de pago o compras de créditos.
Correo, SMS y WhatsApp conservan sus proveedores y pueden tener cargos propios.

Copiar `deploy/.env.example` a `.env` en la VM, fijar `COMUNIDAD_IMAGE` a una
imagen local previamente construida, ajustar `APP_UID`/`APP_GID` al propietario
de los datos (`id -u` / `id -g` en la VM) y configurar
`APP_PUBLIC_URL` con el origen real de la web (actualmente
`https://penarrubia.35.209.188.202.sslip.io`; al activar el híbrido,
`https://gestion-penarrubia.netlify.app`). Este origen exacto se usa
para validar peticiones del navegador sin confiar en `Host` ni en cabeceras
reenviadas por Internet. `TRUST_PROXY` queda vacío en este montaje: los límites
por IP se comparten a través del proxy; los límites por identidad se mantienen.
`APP_DEMO_PROFILES=false` evita recrear cuentas con contraseñas previsibles sin
borrar los perfiles existentes. El entorno local conserva su comportamiento.

`APP_ALLOWED_ORIGINS` admite orígenes adicionales separados por comas, validados
con las mismas reglas estrictas que `APP_PUBLIC_URL`. En este despliegue incluye
`https://gestion-penarrubia.netlify.app` para permitir el acceso desde Netlify
y desde el dominio directo de GCP. No admite comodines ni URLs con rutas.

La primera transferencia usa `node scripts/snapshot-deploy.mjs --rotate-predictable`.
Crea una copia consistente de SQLite mediante su API de backup, copia `uploads/`
y conserva `provider-key`; ejecutar sin subidas/ediciones concurrentes para que
los documentos correspondan a la misma copia. Solo en la copia sustituye
contraseñas previsibles por claves aleatorias y descarta sesiones/recuperaciones.
Los accesos nuevos quedan en `.deploy-private/snapshot-*/accesos-produccion.json`.
Ese directorio está excluido de Git, del contenedor y de Netlify. No trasladar
manualmente el `.db` activo sin su WAL ni regenerar la clave de proveedores.
Después del traslado, usar la web publicada como fuente de datos: la copia local
y la remota son independientes y no se sincronizan.

El gateway compartido incluye `additional-https/*.conf` dentro del servidor de
la IP y `additional-servers/*.conf` a nivel HTTP. Las inclusiones se conservan
en el repositorio canónico de MyGym; sus snippets viven solo en la VM.
El servidor de la IP conserva `default_server` en ambos listeners para que los
clientes que conectan a MyGym sin SNI sigan recibiendo el certificado de la IP.
`deploy/install-gateway-route.py` prepara `/comunidad/` para Netlify y
`deploy/install-standalone.py` activa el virtual host temporal después de emitir
su certificado. Ambos guardan la configuración anterior y validan nginx antes
de recargar. La app no depende del estado de mantenimiento de MyGym.

Desde `/home/quantum_system/comunidad`, operar con:

```bash
docker compose --project-directory . --env-file .env -f deploy/compose.yml ps
bash deploy/backup.sh
```

`deploy/backup.sh [daily|weekly]` detiene brevemente solo esta API y guarda base,
documentos, clave de proveedores en `data/`, `.env` y Compose. La vuelve a arrancar
incluso si falla la copia. El archivo se escribe en un temporal y se verifica
antes de reemplazar atómicamente la copia anterior.

La política preparada es un diario a las **03:00 Europe/Madrid** y un semanal los
domingos a las **03:15 Europe/Madrid**. Cada tipo conserva una copia independiente
en `backups/daily/` y `backups/weekly/`. Los respaldos previos a los deploys están
en `backups/deploys/`, conservando los dos últimos tras una publicación saludable.
Ninguna de esas rotaciones elimina copias de los otros tipos. No se amplía el
disco automáticamente. Las copias de la VM no cubren pérdida del disco.

La activación se realiza una vez, durante la ventana de mantenimiento:

```bash
sudo bash deploy/install-backup-schedule.sh
systemctl list-timers comunidad-backup-daily.timer comunidad-backup-weekly.timer
```

El instalador sustituye el cron antiguo por timers con zona horaria explícita y
guarda una copia del crontab anterior. No se activa desde un deploy normal.
Ver el procedimiento de [carga inicial del censo y recuperación](docs/puesta-en-produccion-base26.md)
para preparar y verificar la candidata local y realizar la sustitución excepcional
de la base. La preparación local no cambia la programación del servidor.

Para actualizar, fusionar una PR o hacer push a la rama
predeterminada, y seguir los dos workflows de Actions. Para reintentar un fallo,
usar _Run workflow_ en el workflow del proveedor afectado sobre la rama predeterminada. Para una intervención manual, construir
una imagen con etiqueta fija, hacer backup, cambiar `COMUNIDAD_IMAGE` y ejecutar
`docker compose ... up -d --no-deps api`.
Conservar el `.env` privado del servidor y configurar en él `GITHUB_ISSUES_TOKEN`,
`GITHUB_ISSUES_REPO`, `GITHUB_ISSUES_LABEL` y `GITHUB_ISSUES_ATTACHMENTS_BRANCH`
para habilitar los reportes. Nunca incluir ese `.env` en la imagen ni en Git.
Tras una actualización, comprobar también login, permisos y descargas. Un
rollback de imagen puede necesitar restaurar también la
base del backup si hubo migraciones; conservar primero los datos posteriores.

Con `NODE_ENV=production` no se carga automáticamente el censo ni las cuotas de
ejemplo y las cookies requieren HTTPS. Tampoco se crean cuentas demo:
`APP_DEMO_PROFILES=false` las desactiva también fuera de producción y la marca
`production-database-v1` impide volver a sembrarlas al abrir la base en local.
Una base nueva exige `APP_ADMIN_PASSWORD` de al menos 12 caracteres para crear
la cuenta inicial. Las bases existentes conservan su administrador. Si se desea
escuchar fuera de la máquina local, debe configurarse `HOST` explícitamente.

Detrás de un proxy inverso, configurar `TRUST_PROXY` con las IP o redes de los
proxies de confianza, separadas por comas (por ejemplo, `loopback` si el proxy
corre en la misma máquina, o una IP/CIDR concreta). El backend debe recibir
conexiones solo por esa ruta de confianza. Sin esta opción, Express ignora
`X-Forwarded-For` y usa la IP de la conexión. No se debe confiar en cualquier
origen ni en un número fijo de saltos cuando hay varias rutas de acceso.

Los intentos de autenticación se separan por operación, IP e identidad.
Los accesos correctos no consumen intentos. El acceso limita 15 fallos por
identidad/IP cada 15 minutos, con `Retry-After`; un barrido desde una IP tiene
además un tope de 500 fallos por minuto. Recuperación, registro, restablecimiento
y cambio de contraseña tienen presupuestos independientes. Estos contadores
son locales al proceso: un despliegue con varias instancias necesita un almacén
compartido o límites equivalentes en el proxy.

La API devuelve `version` en las fichas de comunidades, propietarios, inmuebles
e inquilinos. Cada `PUT` debe incluir la versión leída: sin ella responde `428`,
y si cambió responde `409` con `code: "EDIT_CONFLICT"`. El formulario conserva
los cambios pendientes; hay que revisar la ficha actual antes de reenviar.
Las versiones también reflejan modificaciones indirectas de vínculos.
El editor de propietario envía `propertyShares` con inmueble, versión y porcentaje,
y guarda ficha y titularidades en una sola transacción.

El bootstrap usa una instantánea de permisos por petición y carga los estados
financieros y la biblioteca documental por lotes. `npm test` incluye una prueba
con 1.211 inmuebles, 14.400 recibos y 1.200 documentos que comprueba tiempos de
respuesta, disponibilidad y aislamiento entre roles en un servidor separado.

Los archivos se guardan en disco y necesitan copias de seguridad junto con SQLite.
La revisión documental es humana: el sistema no realiza OCR ni certifica la
identidad, titularidad o validez legal a partir del nombre de archivo.

### Exportación de tablas e informes (issue #128)

La acción **Exportar** ofrece PDF, Excel (.xlsx) y CSV. En las tablas del motor común conserva el conjunto completo filtrado (antes de paginar), el orden, las agrupaciones con sus encabezados y las columnas visibles, excluyendo los botones de acción. Una selección vacía nunca se interpreta como «todos». Si una fila deja de estar autorizada o desaparece, la descarga falla y pide actualizar la vista.

El inventario ejecutable es `src/export-inventory.js`, con las proyecciones autorizadas en `src/export-views.js`. `GET /api/export/inventory` publica las definiciones disponibles para la cuenta: pantalla, lectura, exportación, ámbito, columnas, formatos, fuente y límites. `POST /api/export/:tableId` recibe `format`, `filters`, `sort`, `columns` e `itemIds`; únicamente admite claves declaradas. `GET /api/export/:tableId/preview` ofrece la misma proyección de lectura a Informes. Los nombres de permisos usan la convención real de la aplicación (`community:read`, etc.).

Inventario de vistas habilitadas:

- Comunidades, inmuebles, propietarios e inquilinos: permiso de lectura y `<entidad>:export`, con comprobación por recurso. En propietarios se mantienen solo los vínculos visibles para la cuenta.
- En inmuebles, la exportación añade **Parcela** y **Unidad** y conserva la agrupación por finca matriz.
- Administración de usuarios y roles: `admin:users` / `admin:roles` y `admin:export`; se excluyen contraseñas, sesiones, tokens e identificadores de proveedores de acceso.
- Auditoría: `audit:read` y `audit:export`, restringidos a roles autorizados; conserva el filtro de evento y el orden de más reciente a más antiguo.
- Recibos, saldos a favor y cobros/devoluciones: `fee:read` y `fee:export`, con las reglas de lectura del recibo y del pagador.
- Acuerdos de cuotas, derramas, sus plazos, servicios y reparto por inmueble: `fee:manage` y `fee:export`, limitados a comunidades gestionadas.
- Repartos informativos propios: `fee:read` y `fee:export`, limitados a los inmuebles del propietario consultado autorizado.
- Comunicación, buzón de comunicaciones y seguimiento de lecturas/envíos/historial: `comm:participacion` o permiso de publicación para seguimiento, más `comm:export`. La audiencia y las publicaciones privadas se comprueban con las mismas reglas del tablón.
- Bibliotecas de documentación y estatutos, incluidas carpetas: `document:read` y `document:export`, por entidad, categoría, carpeta y búsqueda; se exportan metadatos, nunca el contenido ni las rutas físicas de los archivos.
- Mis notificaciones y buzón de administración: su permiso de lectura y `owner:export`, manteniendo los filtros activos y la visibilidad del propietario.
- Informes financiero, deuda vencida, suministros y comparativa: `reports:read` y `reports:export`, junto con la autorización de sus fuentes. Los importes se convierten de céntimos a euros; los cobros proceden de aplicaciones vigentes y se excluyen recibos cancelados del consolidado. Las columnas configurables de la tabla también se respetan al descargar. Nuevos informes de #124 deben registrarse en este mismo contrato; esto no implementa por sí solo el resto de aquella épica.

Todos necesitan además el permiso general `export:read` para descargar. La lectura por sí sola no concede exportación. Los roles del sistema de administración reciben los permisos declarados; los roles personalizados se configuran desde Administración. Los residentes no reciben exportación automáticamente. El servicio reconstruye los datos desde la base, revalida el ámbito y acepta únicamente columnas de su lista autorizada. La privacidad sigue la lectura de la vista: perfiles propios, comunidades asignadas o el alcance explícito del rol; no amplía datos personales por disponer de exportación.

Límites por formato: PDF hasta **500 filas**, XLSX y CSV hasta **5.000 filas**; máximo **10 MiB** por archivo y **15 segundos** de generación (CSV: 10 segundos), con tres generaciones simultáneas como máximo. Se configuran en el inventario. La generación se ejecuta en un worker terminable y el archivo completo se valida antes de enviarlo. Los errores, límites y estados vacíos no generan una descarga parcial. Cada intento registra usuario, rol, listado, formato, cantidad, orden, columnas y resultado; los filtros de texto libre se registran por sus claves para no duplicar datos personales en auditoría.

Los archivos se generan en memoria, se entregan con sesión y `Cache-Control: no-store` y se descartan al terminar: retención de servidor **cero**, sin URL pública ni carpeta temporal de descargas. XLSX mantiene números y fechas nativos y añade una hoja de metadatos. CSV usa UTF-8 con BOM, punto y coma y metadatos iniciales de dos columnas entrecomilladas; neutraliza fórmulas de hojas de cálculo y no conserva estilos. PDF incluye metadatos y numeración; las vistas anchas o registros largos usan campos etiquetados para conservar el contenido sin recortarlo.

Exclusiones del inventario: campos de formularios y selectores de configuración, editores sin guardar y vistas previas efímeras de emisión/reparto (son preparación de una operación, no listados persistidos); paneles gráficos de Inicio; expedientes históricos de borrado, que mantienen su descarga original con adjuntos desde Auditoría. Las fichas individuales mantienen sus descargas de documentos originales. Incidencias, tareas, mantenimiento y reservas todavía no tienen listados funcionales en esta versión: al implementarlos deberán declarar su adaptador e incorporar el control común. No se crean datos o cálculos ficticios para esas pantallas.

Validación: `scripts/tests/export.test.mjs` prueba los tres formatos, datos financieros reales, separación de lectura/exportación, ámbitos, audiencia, revocación, estados vacíos, entrada inválida, límites, errores, auditoría y ausencia de archivos temporales; `scripts/tests/export-ui.test.mjs` verifica filtros antes de paginar, columnas, orden, teclado y permisos en la interfaz.

Las tablas comunes reúnen búsqueda, agrupación, selector de columnas, exportar (icono) y alta en una sola barra; el recuento se muestra en el pie. La agrupación se aplica al conjunto filtrado antes de paginar y se conserva en PDF, XLSX (filas de grupo con esquema) y CSV (separadores de grupo), incluso cuando la columna de agrupación está oculta.
