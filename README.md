# App Comunidad Vecinos

Primer módulo de gestión para la Asociación de Propietarios de Parcelas de Peñarrubia: CRUD de comunidades de vecinos.

## Ejecutar

No requiere dependencias ni proceso de compilación. Abre `index.html` en un navegador moderno.

Incluye altas, consulta detallada, búsqueda, paginación configurable, edición y eliminación. Para esta primera iteración, los registros se guardan en el almacenamiento local del navegador. La autenticación y los permisos por rol quedan fuera del alcance de este módulo inicial.

### Características implementadas
- **Formulario y validaciones estrictas:**
  - NIF obligatorio que comienza por `H` seguido de 8 dígitos numéricos.
  - Teléfono y Otro teléfono obligatorios, exactamente de 9 dígitos numéricos.
  - Email de contacto obligatorio con validación de formato.
  - Catálogo territorial local (`municipios-ine.js`) con 8.132 municipios y 52 provincias del INE.
  - Código postal validado contra los códigos postales reales de España con autocompletado bidireccional de municipio y provincia.
  - Observaciones opcionales.
- **Tabla y visualización:**
  - Paginación configurable (5 o 10 comunidades por página) con controles de página anterior, siguiente e indicador de página actual.
  - Columna de contacto con ancho suficiente para mostrar los 9 dígitos sin truncar ni cortar texto.
  - Botones de acción con iconos estándar accesibles (Más info, Editar y Eliminar).
  - Ficha modal de "Más info" con la visualización completa de todos los datos de la comunidad y acceso directo a edición.
