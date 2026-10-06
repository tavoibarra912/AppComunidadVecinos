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
