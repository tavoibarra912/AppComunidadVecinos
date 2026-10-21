# App Gestión Peñarrubia (Comunidades y Propietarios)

Módulo de gestión y administración para la Asociación de Propietarios de Parcelas de Peñarrubia: CRUD de Comunidades de Vecinos y Entidad de Propietarios / Asociados.

## Ejecución

No requiere dependencias externas ni proceso de compilación. Abre `index.html` directamente en cualquier navegador moderno.

Los datos se gestionan con persistencia local en `localStorage` (`penarrubia.communities.v1` y `penarrubia.owners.v1`) y cuentan con datos iniciales (semillas) de prueba precargados.

---

## 1. Módulo Comunidades de Vecinos

- **Formulario y validaciones estrictas:**
  - NIF obligatorio que comienza por `H` seguido de 8 dígitos numéricos.
  - Teléfono y Otro teléfono obligatorios de 9 dígitos numéricos.
  - Email de contacto obligatorio con validación de formato.
  - Catálogo territorial local (`municipios-ine.js`) con 8.132 municipios y 52 provincias del INE.
  - Código postal de 5 dígitos validado contra los códigos postales reales de España con autocompletado bidireccional de municipio y provincia.
  - Observaciones opcionales.
- **Tabla y visualización:**
  - Paginación configurable (5 o 10 por página) con controles de página anterior, siguiente e indicador de página actual.
  - Contador de propietarios censados en la ficha detallada de la comunidad.
  - Botones de acción con iconos estándar accesibles (Más info, Editar y Eliminar con confirmación modal).

---

## 2. Módulo Propietarios (Nueva Entidad)

Gestión completa de los propietarios y asociados vinculados a las comunidades de la asociación:

- **Estructura y campos de la entidad:**
  - **Nombre y Apellidos:** Campos independientes y validados.
  - **DNI / NIE:** Validación oficial del algoritmo del Ministerio del Interior (Módulo 23 con letras de control `TRWAGMYFPDXBNJZSQVHLCKE` tanto para DNI de 8 dígitos como NIE con prefijo `X`, `Y` o `Z`). Control de unicidad de documento en altas y ediciones.
  - **Comunidad vinculada:** Selector relacional sincronizado en tiempo real con las comunidades existentes en el sistema.
  - **Parcela / Inmueble:** Identificador de parcela, chalet o vivienda.
  - **Condición de asociado:** Indicador de si el propietario es socio activo de la asociación (fundamental para el control de acceso inicial por DNI, cobro de cuotas y asambleas).
  - **Teléfonos:** Teléfono principal obligatorio (9 dígitos numéricos) y teléfono secundario opcional (9 dígitos numéricos).
  - **Email:** Correo electrónico validado.
  - **IBAN / Domiciliación:** Formato bancario español (`ES` + 22 dígitos numéricos) formateado automáticamente en bloques para cobro de cuotas.
  - **Domicilio habitual:** Dirección postal, código postal de 5 dígitos, municipio y provincia vinculados al catálogo territorial INE con autocompletado bidireccional.
  - **Observaciones:** Notas sobre el asociado, convocatorias o preferencias.
- **Búsqueda y Filtros Combinados:**
  - Búsqueda en vivo por nombre, apellidos, DNI/NIE, parcela, comunidad, teléfono o email.
  - Filtro por Comunidad desplegable.
  - Filtro por condición de asociado ("Solo asociados" o "No asociados").
- **Tabla y Fichas:**
  - Badges visuales para estado de asociado (`Asociado` en verde / `No asociado` en neutro), DNI en tipografía monospace y tag de comunidad.
  - Ficha modal de "Más info" con todos los datos personales, bancarios y domiciliarios, con acceso directo a edición.
  - Diálogo de confirmación accesible para eliminación.
  - Paginación configurable (5 o 10 por página) sincronizada con los filtros aplicados.
  - Navegación responsive entre secciones (sidebar en escritorio y barra superior en móviles).

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

