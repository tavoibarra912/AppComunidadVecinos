# App Gestión Peñarrubia (Comunidades y Propietarios)

Módulo de gestión y administración para la Asociación de Propietarios de Parcelas de Peñarrubia: CRUD de Comunidades de Vecinos y Entidad de Propietarios / Asociados.

## Ejecución

No requiere dependencias externas ni proceso de compilación. Abre `index.html` directamente en cualquier navegador moderno.

Los datos se gestionan con persistencia local en `localStorage` (`penarrubia.communities.v1` y `penarrubia.owners.v1`) y cuentan con datos iniciales (semillas) de prueba precargados.
La verificación de contacto requiere servir la aplicación desde un origen HTTP con los endpoints descritos abajo; sin backend, el envío falla de forma visible y el propietario no puede guardarse hasta verificar sus datos.

---

## 1. Módulo Comunidades de Vecinos

- **Formulario y validaciones estrictas:**
  - NIF obligatorio que comienza por `H` seguido de 8 dígitos numéricos.
  - Teléfono y Otro teléfono obligatorios de 9 dígitos numéricos.
  - Email de contacto obligatorio con validación de formato.
  - Catálogo territorial local (`municipios-ine.js`) con 8.132 municipios y 52 provincias del INE.
  - Código postal de 5 dígitos validado contra los códigos postales reales de España con autocompletado bidireccional de municipio y provincia.
  - IBAN de la comunidad, presidencia, administración de fincas, año de constitución, fondo de reserva y observaciones.
- **Tabla y visualización:**
  - Paginación configurable (5 o 10 por página) con controles de página anterior, siguiente e indicador de página actual.
  - Contador de propietarios censados en la ficha detallada de la comunidad.
  - Botones de acción con iconos estándar accesibles (Más info, Editar y Eliminar con confirmación modal).
  - La ficha de cada comunidad permite crear inmuebles nuevos, asociar inmuebles existentes y consultar o desvincular los relacionados.

---

## 2. Módulo Propietarios (Nueva Entidad)

Gestión completa de los propietarios y asociados vinculados a las comunidades de la asociación:

- **Estructura y campos de la entidad:**
  - **Nombre y Apellidos:** Campos independientes y validados.
  - **DNI / NIE / CIF:** Tipo y documento obligatorios, validados y únicos. DNI/NIE usan su letra de control y CIF su dígito/letra de control.
  - **Inmueble (obligatorios):** Comunidad vinculada, asociación con un inmueble existente o registro de uno nuevo, tipo de inmueble e identificador/número.
  - **Datos opcionales del inmueble:** Referencia catastral (20 caracteres alfanuméricos cuando se informa), finca registral, planta, puerta, superficie (decimal positiva), coeficiente (0,0001–100 %) y uso.
  - **Asociación con inmueble:** Combo con búsqueda por identificador y referencia catastral, limitado a la comunidad elegida; al elegir un inmueble existente carga sus datos editables.
  - **Inmuebles del propietario:** La ficha muestra un desplegable con todos sus inmuebles y un filtro por comunidad; un propietario puede estar relacionado con inmuebles de distintas comunidades.
  - **Condición de asociado:** Indicador de si el propietario es socio activo de la asociación (fundamental para el control de acceso inicial por DNI, cobro de cuotas y asambleas).
  - **Contacto:** Teléfono principal español (9 dígitos, empieza por 6–9) y email obligatorios; ambos requieren verificación por código. Otro teléfono es opcional.
  - **Dirección:** Dirección, provincia, municipio y código postal son obligatorios; provincia → municipio → código postal depende del catálogo territorial INE.
  - **IBAN / Domiciliación:** Opcional; IBAN español de 24 caracteres validado por checksum MOD-97 y visualizado en bloques de cuatro.
  - **Moneda de cuotas:** Selector con catálogo en memoria.
  - **Observaciones:** Notas sobre el asociado, convocatorias o preferencias.
- **Contrato requerido para el backend de verificación:**
  - `POST /api/owners/contact/phone/send` con `{ "phone": "612345678" }`; responde `{ "challengeId": "...", "maskedDestination": "...", "expiresAt": "..." }`.
  - `POST /api/owners/contact/phone/confirm` con `{ "challengeId": "...", "code": "123456" }`; responde `{ "verified": true, "verifiedAt": "..." }`.
  - `POST /api/owners/contact/email/send` con `{ "email": "persona@dominio.es" }`; responde el mismo contrato de envío.
  - `POST /api/owners/contact/email/confirm` con `{ "challengeId": "...", "code": "123456" }`; responde el mismo contrato de confirmación.
  - El backend debe enviar el OTP, limitar intentos y caducidad, asociar el reto al destino y volver a comprobar la verificación al crear/actualizar el propietario. Los códigos nunca se muestran ni se autocompletan en el frontend.
- **Catálogos y SUPOSICIÓN:** El catálogo de provincias, municipios y códigos postales se carga desde `municipios-ine.js`; moneda usa un catálogo local cacheado en memoria. SUPOSICIÓN: la mención «caching de moneda» se refiere a un combo de monedas con cache local, no a una operación financiera.
- **Búsqueda y Filtros Combinados:**
  - Búsqueda en vivo por nombre, apellidos, DNI/NIE, parcela, comunidad, teléfono o email.
  - Filtro por Comunidad desplegable.
  - Filtro por condición de asociado ("Solo asociados" o "No asociados").
- **Tabla y Fichas:**
  - Badges visuales para estado de asociado (`Asociado` en verde / `No asociado` en neutro), DNI en tipografía monospace y tag de comunidad.
  - Ficha modal de "Más info" con todos los datos personales, bancarios y domiciliarios, con acceso directo a edición.
  - Diálogo de confirmación accesible para eliminación.
  - Paginación configurable (5 o 10 por página) sincronizada con los filtros aplicados.
  - Prioridad de grilla: propietario, documento, inmueble, comunidad y acciones permanecen visibles; dirección, contacto, condición y documentación se ocultan progresivamente en ventanas estrechas. Las columnas prioritarias mantienen scroll horizontal.
  - Navegación responsive entre secciones (sidebar en escritorio y barra superior en móviles).

---

## 2.1. Entidad Inmuebles

- La sección **Inmuebles**, situada debajo de **Comunidades**, permite crear y editar inmuebles; cada registro pertenece a una única comunidad y debe tener uno o más propietarios.
- El inmueble guarda tipo e identificador, dirección, bloque/escalera, planta y puerta, superficie, coeficiente de participación, uso, referencia catastral, finca registral, certificado energético, cuota comunitaria, estado de recibos y documentos adjuntos.
- Un inmueble puede tener varios propietarios y varios inquilinos. Los inquilinos se vinculan además a su propietario y a una unidad; sólo se pueden asociar a un inmueble los inquilinos de alguno de los propietarios seleccionados.
- Los botones de creación, edición, eliminación, guardado y cancelación de estas pantallas usan iconos accesibles con título y nombre accesible.
- Los documentos adjuntos se guardan en el navegador junto con el resto de datos `localStorage`; esta persistencia es de demostración y debe migrarse a almacenamiento de backend para producción.
- Los inmuebles existentes se vinculan a sus propietarios por la relación guardada o, durante la migración inicial, por el inmueble principal ya registrado en la ficha del propietario. Las unidades de catálogo todavía sin propietario no aparecen como entidades hasta que se asocian desde la ficha de un propietario.
- Una comunidad no se puede eliminar si tiene inmuebles asociados, ni un propietario si es titular de un inmueble; primero hay que reasignar esos registros.

---

## 2.2. Inquilinos y residentes

- La opción **Inquilinos**, debajo de **Propietarios** en la navegación, muestra un listado independiente con búsqueda y filtros por comunidad y estado del contrato.
- Desde la ficha de un propietario se pueden crear, consultar, editar y eliminar sus inquilinos.
- Cada inquilino queda asociado a una unidad de ese propietario, con contacto, documento identificativo opcional y fechas de contrato.
- El inicio del contrato, un teléfono español y un email válido son obligatorios; la fecha de fin es opcional y no puede ser anterior al inicio.
- El detalle indica si el contrato está próximo, vigente o finalizado, y permite abrir la ficha de la unidad.
- Las autorizaciones se registran mediante permisos explícitos para zonas comunes, comunicaciones e incidencias, además de observaciones de texto libre.
- Los inquilinos se guardan dentro de la ficha del propietario en `localStorage`; este modelo local de demostración debe migrarse a backend para producción.

---

## 3. Módulo de Documentación y Aprobación Administrativa

Permite a los propietarios adjuntar toda la documentación reglamentaria tanto en el alta de nuevo usuario como en la posterior edición de su ficha:

- **Documentación Requerida:**
  1. **Copia de DNI (ambas caras):** Documento de identidad español escaneado o fotografiado (ambas caras en un único archivo o documento).
  2. **Recibo bancario o certificado de titularidad:** Justificante bancario que acredite la cuenta donde se domiciliará el pago de las cuotas.
  3. **Copia de la escritura del inmueble:** Título o escritura acreditativa de la propiedad de la parcela/vivienda.

- **Validación Automática del Sistema (Motor Client-Side):**
  - **DNI Español:** Verificación de algoritmo oficial de control (módulo 23), detección de anverso y reverso, y ratio de aspecto.
  - **Inspección de Legibilidad (Canvas Pixel Analysis):** Cálculo en tiempo real de resolución útil, luminancia media (evita documentos quemados u oscuros) y desviación típica de contraste (garantiza nitidez suficiente del texto impreso).
  - **Recibo Bancario:** Comprobación de coincidencia del IBAN con la cuenta domiciliada del propietario.
  - **Escritura:** Comprobación de vinculación a la parcela y legibilidad documental.
  - **Asistente de Pruebas Rápidas:** Botones *"✨ Cargar de prueba válido"* para generar al vuelo documentos vectoriales/canvas de prueba válidos y agilizar testeos.

- **Confirmación Inmediata al Usuario (Modal Emergente):**
  - Tras procesar y superar las validaciones automáticas, el usuario recibe un diálogo modal emergente (`#doc-success-dialog`) confirmando que la documentación se ha cargado correctamente y queda a la espera de la resolución administrativa.

- **Notificación por Email y Aprobación del Administrador:**
  - **Envío de Notificación:** Al completar la subida, el sistema despacha una notificación por correo electrónico al Administrador solicitando la verificación y aprobación.
  - **Plantilla de Email Interactiva (`#admin-email-dialog`):** Simula el correo recibido con remitente, asunto, resumen del propietario y botón directo *"Revisar y Aprobar Documentación"*.
  - **Buzón del Administrador (`#admin-inbox-dialog`):** Contador de notificaciones pendientes en la barra superior con historial de avisos.
  - **Panel de Aprobación Administrativa:** En la ficha del propietario, el Administrador puede inspeccionar el estado de cada documento, auditar el desglose de legibilidad y resolver el expediente mediante:
    - **Aprobar Documentación:** Concede el estado oficial de documentación validada.
    - **Solicitar Subsanación / Rechazar:** Permite especificar los motivos para que el propietario reenvíe los archivos requeridos.

- **Aislamiento y Persistencia:**
  - Toda la documentación queda vinculada **única y exclusivamente** al perfil del propietario en cuestión (`owner.documents` dentro de `penarrubia.owners.v1`), garantizando la privacidad e integridad de los datos.

---

## 4. Modelo de control de acceso (RBAC)

> **Estado: modelo para validación del producto.** La demo aplica comprobaciones de permisos en la interfaz para las vistas de Administrador y Propietario. Estas comprobaciones no son una frontera de seguridad: los datos siguen en `localStorage`, no hay autenticación y no existe backend. No usar con datos reales.

### Roles y responsabilidades

| Rol | Alcance y responsabilidad |
|---|---|
| Anónimo | Sin acceso a información privada ni operaciones de gestión. Solo podrá usar endpoints públicos de alta, inicio de sesión y recuperación de cuenta, con sus propias protecciones y límites. No es un rol asignable. |
| Administrador (`admin`) | Personal autorizado de la asociación. Gestiona las comunidades y sus datos, propietarios, inmuebles, inquilinos y revisión documental en el ámbito de la asociación. Puede otorgar y revocar roles de propietario e inquilino, pero no concederse ni asignar el rol de administrador. |
| Propietario (`owner`) | Persona cuya identidad y relación con uno o más inmuebles hayan sido verificadas. Accede a su perfil, documentos, inmuebles y avisos; puede gestionar los inquilinos de sus unidades y concederles únicamente autorizaciones explícitas admitidas para esas unidades. |
| Inquilino (`tenant`) | Persona asociada a un contrato vigente y a una unidad concreta. Accede únicamente a esa relación y a las capacidades expresamente otorgadas para ella. El fin o revocación del contrato elimina el acceso derivado de esa relación. |

El estado de socio, la validación documental y la existencia de una cuenta son atributos o estados del flujo, no roles por sí mismos. No conceden permisos adicionales automáticamente.

### Matriz de permisos

Las operaciones no indicadas quedan denegadas. `CRUD` representa crear, consultar, modificar y eliminar, siempre sujeto al alcance de la columna.

| Recurso / acción | Anónimo | Administrador | Propietario | Inquilino |
|---|---:|---|---|---|
| Comunidades | Denegado | CRUD en la asociación | Consultar las relacionadas con sus inmuebles | Consultar solo las necesarias para una autorización explícita |
| Perfil de propietario | Denegado | CRUD en la asociación | Consultar y modificar su propio perfil; no cambiar su estado de verificación | Consultar solo los datos mínimos compartidos para su contrato |
| Inmuebles | Denegado | CRUD en la asociación | Consultar únicamente sus inmuebles | Consultar solo las unidades vinculadas a su contrato |
| Inquilinos y contratos | Denegado | CRUD en la asociación | CRUD solo para inquilinos y unidades propias | Consultar su propio contrato; sin administrar titulares ni otros inquilinos |
| Documentos del propietario | Denegado | Consultar, aprobar o solicitar subsanación dentro de la asociación | Cargar y consultar únicamente los propios; sin aprobarlos | Denegado |
| Avisos y comunicaciones | Denegado | Gestionar avisos administrativos | Consultar los propios | Consultar comunicaciones de la comunidad solo con autorización vigente |
| Zonas comunes | Denegado | Gestionar autorizaciones | Gestionar autorizaciones de sus unidades | Acceso solo con autorización vigente para su unidad |
| Incidencias | Denegado | Gestionar las de la asociación | Consultar y gestionar las de sus unidades | Solo consultar o gestionar las de su unidad si tiene el permiso explícito correspondiente |
| Asignaciones de roles y permisos | Denegado | Otorgar/revocar roles `owner` y `tenant` dentro de su alcance; no alterar el catálogo ni asignar `admin` | Otorgar/revocar únicamente autorizaciones de inquilino permitidas en sus unidades | Denegado |

Las filas de comunidades, avisos e incidencias no amplían por sí solas el acceso: se requiere una relación válida con el recurso y el permiso concreto. La funcionalidad de incidencias está aún pendiente en la aplicación.

### Permisos y denegación por defecto

- Cada permiso se identifica como `recurso:acción` (por ejemplo, `property:read`, `document:submit`, `document:approve` o `tenant_grant:manage`); el alcance de datos se valida por separado.
- Toda solicitud privada parte denegada. Solo se permite si existe una identidad autenticada y activa, un permiso explícito, una asignación vigente y una relación vigente con el recurso que coincida con el alcance solicitado.
- La ausencia de rol, permiso, relación, contexto de comunidad/unidad, o cualquier dato de autorización incompleto o inválido produce denegación. No hay acceso por herencia implícita ni elevación por fallo de una comprobación.
- El backend debe volver a comprobar autorización en cada lectura y escritura, incluyendo operaciones por ID, búsquedas, listados, descargas y cambios de estado. Ocultar controles en la interfaz no es una medida de autorización.
- Las autorizaciones de inquilinos son específicas a la unidad y al contrato vigente. El catálogo inicial queda limitado a `common_areas`, `community_communications` e `incident_management`; cada autorización se concede por separado y su ausencia significa denegación.
- La validación automática de documentos no equivale a aprobación administrativa. Solo `document:approve` puede aprobar; quien carga un documento no puede aprobarlo.

### Reglas para la administración de roles y permisos

1. El alta inicial de administradores se realiza mediante un proceso de despliegue/operación controlado, fuera de las pantallas de gestión ordinaria. Un administrador no puede asignar, revocar ni modificar su propio rol privilegiado ni el de otros administradores.
2. El administrador puede asignar o revocar roles de propietario e inquilino solo después de comprobar identidad y relación con la asociación, propiedad o contrato correspondiente. Toda asignación debe tener un alcance explícito.
3. El propietario solo puede conceder a un inquilino permisos del catálogo aprobado y limitados a una unidad que controle; no puede crear permisos, conceder acceso a otra unidad ni delegar su propio rol.
4. El catálogo de permisos y sus asignaciones a roles se versionan y modifican mediante cambios revisados del sistema, no desde el cliente. No se admiten roles o permisos personalizados que amplíen privilegios sin revisión.
5. Las concesiones, revocaciones, aprobaciones documentales y cambios de alcance registran actor, objetivo, recurso, fecha, motivo y resultado en una auditoría protegida contra modificación por usuarios ordinarios. Revocaciones y fin de contrato deben surtir efecto inmediatamente.
6. Las cuentas deshabilitadas, asignaciones revocadas o vencidas y relaciones de propiedad/contrato finalizadas no autorizan operaciones, aunque el usuario conserve una sesión o URL abierta.

### Modelo de datos objetivo

- `users`: identidad de acceso, estado de cuenta y referencias a los perfiles verificados de propietario o inquilino. La autenticación y las credenciales se gestionan separadas de los perfiles de negocio.
- `roles`: catálogo estable (`admin`, `owner`, `tenant`) y metadatos de rol administrado por el sistema.
- `permissions`: catálogo estable de pares recurso/acción, con clave única.
- `role_permissions`: relación muchos-a-muchos entre roles y permisos concedidos.
- `user_role_assignments`: usuario, rol, tipo e ID de alcance, otorgante, fecha de alta, expiración y revocación. Una asignación no implica acceso fuera de su alcance.
- `property_ownerships` y `tenancies`: relaciones verificadas entre usuario y comunidad/unidad, con estado y vigencia; determinan el alcance consultable.
- `tenant_permission_grants`: usuario inquilino, unidad/contrato, permiso del catálogo, propietario otorgante, fechas de vigencia y revocación. Solo permite permisos delegables definidos por política.
- `authorization_audit_log`: eventos de concesión, revocación y decisiones privilegiadas, almacenados con acceso restringido.

Las claves externas deben impedir asignaciones a usuarios, roles, permisos o recursos inexistentes; las consultas deben aplicar el alcance en el servidor y evitar devolver campos personales o bancarios que el rol no necesite.

### Política de mínimo privilegio y estado actual

- Conceder el conjunto mínimo de permisos necesario para la tarea, a la menor unidad de alcance posible y durante el menor tiempo necesario. No usar cuentas compartidas.
- Revisar periódicamente cuentas privilegiadas y asignaciones; retirar accesos al terminar una relación o función. Las operaciones administrativas y el acceso a documentos de identidad o datos bancarios requieren justificación y auditoría.
- El selector «Modo Administrador / Modo Propietario» de la demo solo cambia la presentación. Los datos se almacenan en `localStorage` del navegador y no existe autenticación ni autorización de backend: no debe usarse con datos reales ni considerarse una frontera de seguridad. Antes de producción, implementar identidad, controles de acceso a nivel de API y almacenamiento protegido conforme a este modelo.
- La demo filtra los registros y controla las acciones disponibles para Administrador y Propietario; el Propietario solo puede ver su propio perfil, comunidad e inmuebles, cargar su documentación y gestionar inquilinos de sus unidades. La vista global de inquilinos, la administración de inmuebles y la aprobación documental son exclusivas de Administrador. No hay cuentas ni sesiones de inquilino ni gestión real de asignaciones de roles; el selector solo permite probar las dos vistas y no autentica a nadie.
