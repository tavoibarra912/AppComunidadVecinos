# Importación local de «BASE DE DATOS 26»

Importador de un solo uso para llevar el censo de la _Asociación de Propietarios de
Parcelas Peña Rubia_ a una **base SQLite nueva y local**, siguiendo el mapping de
`Book1`. No toca `data/`, ni servidores, ni ningún despliegue. Esta copia se abre con `npm run dev:base26`.

- Script: `scripts/import-base-datos-26.mjs`
- Hoja de origen: `BASE DE DATOS COMPLETA` del archivo `BASE DE DATOS 26.xlsm`
- Salida por defecto: `.local-test/base-26/` (ignorada por git)

## Uso

```bash
# 1) Dry-run: solo lee el Excel y escribe el informe (no crea base)
node scripts/import-base-datos-26.mjs --file "BASE DE DATOS 26.xlsm"

# 2) Crear la base local con los datos
node scripts/import-base-datos-26.mjs --file "BASE DE DATOS 26.xlsm" --write

# 3) Reemplazar una importación anterior
node scripts/import-base-datos-26.mjs --file "BASE DE DATOS 26.xlsm" --write --force

# 4) Regenerar con configuración y estatutos de los archivos de referencia
node scripts/import-base-datos-26.mjs --file "BASE DE DATOS 26.xlsm" --mapping "Book1.xlsx" --statutes "estatutos.pdf" --statutes-date "2024-05-12" --statutes-reference "Estatutos modificados en Asamblea General de 12 de mayo de 2024" --write --force
```

Opciones:

| Opción         | Descripción                                                         |
| -------------- | ------------------------------------------------------------------- |
| `--file`, `-f` | Archivo `.xlsm`, `.xlsx` o `.csv` con la hoja. Obligatorio.         |
| `--sheet`      | Nombre de la hoja (por defecto `BASE DE DATOS COMPLETA`).           |
| `--out`        | Carpeta local de salida (por defecto `.local-test/base-26`).        |
| `--write`      | Crea `<out>/data/penarrubia.db`. Sin esta opción solo hace dry-run. |
| `--force`      | Reemplaza la base importada existente en `<out>/data`.              |

Con `--force` se guarda una copia hermana `<out>-backup-<fecha>/` antes de reemplazar la base y los adjuntos. El respaldo SQLite incorpora el WAL. Los Excel y el PDF originales solo se leen.

La carpeta de salida debe quedar dentro del proyecto y no puede ser `data/` ni
`uploads/`: el script se niega a escribir ahí. Tampoco corre con
`NODE_ENV=production`.

## Qué genera

```
.local-test/base-26/
  import-report.json     Resumen, avisos y listado de propietarios/inmuebles
  import-preview.csv     Previsualización fila a fila (se abre en Excel)
  data/penarrubia.db     Base SQLite nueva (solo con --write)
  uploads/               Adjuntos de la copia, incluidos los estatutos si se indican
```

## Mapping aplicado (Book1)

| Dato de la app           | Columna | Campo del Excel                                                           |
| ------------------------ | ------- | ------------------------------------------------------------------------- |
| Comunidad                | —       | Columna Valor de la hoja «Comunidad» de Book1                             |
| Usuario / contraseña     | G       | `DNI/NIF` en minúsculas; clave = usuario + `12345678`                     |
| Propietario: nombre      | D       | `Nombre del Titular (Asociación)`                                         |
| Propietario: apellidos   | D       | Resto del titular                                                         |
| Propietario: documento   | G       | `DNI/NIF` normalizado, con ceros iniciales del DNI y control validado     |
| Propietario: teléfonos   | R / Q   | `Teléfono móvil` / `Teléfono fijo`                                        |
| Propietario: email       | S       | `E-mail`                                                                  |
| Propietario: dirección   | O + P   | `Tipo de via` + `Direccion`                                               |
| Propietario: CP          | T       | `Codigo Postal`                                                           |
| Propietario: localidad   | U       | `Localidad` (la usa también el inmueble)                                  |
| Propietario: observación | A       | `Referencia dentro de la comunidad de Regantes: <Ref.>`                   |
| Inmueble: identificador  | O + P   | `I<número incremental> <dirección O + P>`                                 |
| Inmueble: tipo / uso     | —       | `Vivienda` / `Residencial` (Book1)                                        |
| Inmueble: ref. catastral | F       | `Ref. Catastral` (formato, control y ausencia de repeticiones pendientes) |
| Inmueble: dirección      | O + P   | Concatenadas con un espacio                                               |
| Inmueble: superficie     | I       | `Superficie C.R.`                                                         |
| Inmueble: CP             | T       | `Codigo Postal`                                                           |
| Inmueble: propietario    | —       | Titular de la fila, ocupación «Vive el propietario»                       |

Decisiones sobre el mapping:

- **Identificador del inmueble = `I` + número incremental + dirección**. El número
  sigue el orden del Excel y se conserva aunque se excluyan filas, evitando
  renumerar el resto de los inmuebles cuando un dato no se puede importar. El ID interno sigue derivado de `Pcla.`.
- **Configuración y marca**: `--mapping Book1.xlsx` lee nombre, email y teléfono
  de «Datos de la Asociacion» y utiliza el mismo nombre para la marca de la plataforma.
- **Contactos de comunidad**: el estado verificado se importa según Observaciones,
  se guarda y se recupera en la interfaz. Cambiar el contacto exige otra verificación.
- **Estatutos**: `--statutes` copia el PDF a la raíz de Estatutos de la comunidad;
  la referencia y la fecha se indican con los valores comprobados en el documento.
- **DNI**: se recuperan los ceros iniciales sin modificar la letra. Los seis
  documentos del censo que aún fallan el formato o el control excluyen al
  propietario y su cuenta. Las filas sin documento tampoco crean identidades. Los usuarios y contraseñas
  siguen derivados del documento original, sin añadir ceros a las credenciales.
- **Referencias catastrales**: las ausentes, de formato incorrecto o con caracteres
  de control incorrectos excluyen el inmueble. Las referencias repetidas pendientes
  de confirmar excluyen todas sus parcelas: no se elige arbitrariamente la primera.
  En el censo actual se excluyen 48B y 139F por ausencia, 140A/140B por una referencia
  compartida y 179A–179E por otra, hasta corregir o confirmar la asignación en origen.
- **Reglas independientes**: un documento inválido no elimina un inmueble con
  referencia válida; queda sin titular. Una referencia inválida no elimina un socio
  cuya identidad sea válida; queda sin ese vínculo. Nunca se enlazan filas solo por
  coincidencia de nombre. No se crean enlaces a registros excluidos.
- **Resultado del filtrado actual**: 125 propietarios y sus 125 usuarios (más
  super_admin), 131 inmuebles y 20 incidencias de exclusión: seis documentos inválidos,
  cinco filas sin documento y nueve inmuebles excluidos. No se generan avisos por
  emails ausentes. El informe JSON incluye tipo, celda, parcela, titular y motivo.
- **La cuota de superficie (columna M) no se carga como cuota manual.** Desde el
  rediseño financiero la cuota y el estado de los recibos se derivan del libro de
  recibos; la app ya no acepta una cuota editable en el inmueble. El importe de M
  queda registrado como dato histórico en las observaciones.
- **Los coeficientes de participación quedan vacíos**: el régimen es asociación y
  el coeficiente es opcional. Los repartos que lo necesiten se configuran después.
- **Propietarios unificados por documento**: un titular con varias parcelas queda
  como una sola ficha con varios inmuebles vinculados.
- Las filas sin documento generan el inmueble **sin propietario** y un aviso; no se
  inventan identidades.

## Cómo probar la copia

```bash
APP_DATA_DIR="$PWD/.local-test/base-26/data" \
APP_UPLOADS_DIR="$PWD/.local-test/base-26/uploads" \
APP_DEMO_PROFILES=false APP_DEMO_DATA=false \
PORT=3100 HOST=127.0.0.1 node server.js
```

- Abrir `http://127.0.0.1:3100`
- Login de administración: `super_admin` / `super_admin`
- Cada vecino entra con su documento en minúsculas (sin guiones) y la clave
  `<documento>12345678`, por ejemplo `50035496p` / `50035496p12345678`.
- Con `APP_DEMO_PROFILES=false` no se crean las cuentas de demostración
  (`ca1`, `urucp1`, …), así que la copia solo tiene el censo importado.

## Antes de pensar en producción

1. Revisar `import-report.json`: avisos por documentos incompletos, filas sin
   contacto, direcciones o referencias catastrales descartadas.
2. Verificar en la app: 140 inmuebles, propietarios con varias parcelas, ficha de
   un inmueble y una búsqueda por documento.
3. Reimportar con `--force` tras corregir el Excel de origen.
4. El pasaje a producción es un paso **aparte** (backup, ventana y autorización
   explícita); este script no lo hace.
