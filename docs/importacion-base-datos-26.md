# Importación local de «BASE DE DATOS 26»

Importador de un solo uso para llevar el censo de la _Asociación de Propietarios de
Parcelas Peña Rubia_ a una **base SQLite nueva y local**, siguiendo el mapping de
`Book1`. No toca `data/`, ni producción, ni ningún despliegue.

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
```

Opciones:

| Opción         | Descripción                                                         |
| -------------- | ------------------------------------------------------------------- |
| `--file`, `-f` | Archivo `.xlsm`, `.xlsx` o `.csv` con la hoja. Obligatorio.         |
| `--sheet`      | Nombre de la hoja (por defecto `BASE DE DATOS COMPLETA`).           |
| `--out`        | Carpeta local de salida (por defecto `.local-test/base-26`).        |
| `--write`      | Crea `<out>/data/penarrubia.db`. Sin esta opción solo hace dry-run. |
| `--force`      | Reemplaza la base importada existente en `<out>/data`.              |

La carpeta de salida debe quedar dentro del proyecto y no puede ser `data/` ni
`uploads/`: el script se niega a escribir ahí. Tampoco corre con
`NODE_ENV=production`.

## Qué genera

```
.local-test/base-26/
  import-report.json     Resumen, avisos y listado de propietarios/inmuebles
  import-preview.csv     Previsualización fila a fila (se abre en Excel)
  data/penarrubia.db     Base SQLite nueva (solo con --write)
  uploads/               Carpeta de subidas vacía de esta copia
```

## Mapping aplicado (Book1)

| Dato de la app           | Columna | Campo del Excel                                         |
| ------------------------ | ------- | ------------------------------------------------------- |
| Comunidad                | —       | Valores fijos de la hoja «Comunidad»                    |
| Usuario / contraseña     | G       | `DNI/NIF` en minúsculas; clave = usuario + `12345678`   |
| Propietario: nombre      | D       | `Nombre del Titular (Asociación)`                       |
| Propietario: apellidos   | D       | Resto del titular                                       |
| Propietario: documento   | G       | `DNI/NIF` (tipo detectado: DNI/NIE/CIF)                 |
| Propietario: teléfonos   | R / Q   | `Teléfono móvil` / `Teléfono fijo`                      |
| Propietario: email       | S       | `E-mail`                                                |
| Propietario: dirección   | O + P   | `Tipo de via` + `Direccion`                             |
| Propietario: CP          | T       | `Codigo Postal`                                         |
| Propietario: localidad   | U       | `Localidad` (la usa también el inmueble)                |
| Propietario: observación | A       | `Referencia dentro de la comunidad de Regantes: <Ref.>` |
| Inmueble: identificador  | C       | `Pcla.` → `Parcela <Pcla.>`                             |
| Inmueble: tipo / uso     | —       | `Vivienda` / `Residencial` (Book1)                      |
| Inmueble: ref. catastral | F       | `Ref. Catastral` (solo si tiene 20 caracteres)          |
| Inmueble: dirección      | O + P   | Concatenadas con un espacio                             |
| Inmueble: superficie     | I       | `Superficie C.R.`                                       |
| Inmueble: CP             | T       | `Codigo Postal`                                         |
| Inmueble: propietario    | —       | Titular de la fila, ocupación «Vive el propietario»     |

Decisiones sobre el mapping:

- **Identificador del inmueble = `Pcla.` (columna C)**, no la dirección (columna P).
  En los datos reales la dirección se repite en 21 filas (varias parcelas comparten
  «Camino de la Barca, s/n», etc.), así que no sirve como identificador único:
  `Pcla.` sí es único en las 140 filas.
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
