# Puesta en producción excepcional del censo BASE 26

La base del Excel sustituirá una sola vez a la base actual del servidor. No se
mezclan censos ni se trasladan cuentas, sesiones, cuotas o documentos antiguos.
Se conservan únicamente los valores visuales de producción. El entorno `.env`
del servidor se conserva por separado: contiene la configuración de despliegue,
no los datos del censo. No ejecutar este procedimiento en los deploys habituales.

## Candidata local

`node scripts/prepare-production-candidate.mjs` crea una carpeta nueva
`.deploy-private/candidate-<fecha>/`, sin sobrescribir ninguna copia existente.
Usa `.local-test/base-26/` como origen y la exportación de solo marca
`.deploy-private/production-visuals.json` como referencia visual.

Contiene `data/`, `uploads/`, `manifest.json` y `accesos-produccion.json`.
Los colores, las fuentes, el logo, el tamaño, los bordes y la densidad proceden
de producción. El nombre y los demás ajustes permanecen como en la importación.
El favicon se conserva en `public/favicon.svg`, dentro del código de la release.

Las contraseñas de origen se conservan sin modificarlas. Para el censo BASE 26,
el acceso administrativo es `super_admin` / `super_admin`; los vecinos usan su
usuario del documento en minúsculas, sin guiones ni espacios, y la contraseña
es ese usuario seguido de `12345678`. Las contraseñas personalizadas también se
conservan. El archivo privado de accesos solo recoge claves iniciales que
coincidan con el hash guardado; queda fuera de Git y del paquete de datos del
servidor. No se cambia ninguna contraseña al preparar una copia.

La sustitución inicial ya se ejecutó el 27/11/2026. No repetir este procedimiento
en actualizaciones posteriores: producción conserva sus datos y credenciales.

## Protección de los siguientes deploys

`AGENTS.md` establece que reemplazar/restaurar la base o cambiar credenciales
requiere un pedido explícito nuevo del usuario. Un deploy de código no lo autoriza.

`scripts/update-vm.sh` rechaza releases que incluyan `data/` o `uploads/`. Tras el
respaldo y antes de cambiar de imagen, prueba el arranque de la nueva versión con
copias privadas de esos directorios, sin red ni puertos. La comprobación rechaza
el reemplazo del archivo SQLite, cambios en cuentas/contraseñas y modificaciones
de los valores previamente guardados. Se permiten columnas/tablas nuevas que
conserven esos valores; los cambios de datos requieren una migración autorizada
por separado. Si falla el ensayo, vuelve a arrancar la imagen anterior con su
base original y no restaura ninguna base automáticamente.

Compose exige que los directorios persistentes existan y establece
`APP_REQUIRE_EXISTING_DB=true`: si falta el archivo SQLite, el servidor falla en
vez de crear otra base. El preparador de candidatas conserva los hashes de origen.

Para probarla:

```powershell
node scripts/verify-production-candidate.mjs .deploy-private/candidate-<fecha>
```

El verificador arranca el servidor real en modo producción sobre una copia
temporal. Comprueba integridad, relaciones, igualdad con el censo original,
apariencia, login, permisos, descarga de estatutos y reinicio sin demo. Guarda
`verification.json` y no altera la base candidata.

## Ventana de cambio (todavía no ejecutada)

1. Revisar y consolidar el código que acompaña a la candidata. Un push o merge a
   la rama predeterminada inicia los workflows de despliegue: no hacerlo hasta
   disponer de la ventana acordada. El `.db` nunca se añade al repositorio ni a
   la imagen Docker.
2. Transferir el paquete `production-data.tar.gz` a una carpeta de entrada privada
   nueva en la VM. Comprobar su SHA-256 contra `package-verification.json`.
   Contiene únicamente `data/` y `uploads/`; las credenciales permanecen en local.
3. Dentro de la ventana, impedir acceso de usuarios y adquirir `.deploy.lock`,
   el mismo bloqueo de backups y deploys. Detener exclusivamente la API Comunidad.
   No interrumpir MyGym. Ningún job de despliegue debe ejecutarse simultáneamente.
4. Crear y verificar un respaldo completo de `data/`, `uploads/`, `.env` y
   `deploy/compose.yml` en `backups/initial-migration/`. Este respaldo excepcional
   queda fuera de la rotación diaria, semanal y de despliegues. Registrar también
   la imagen anterior. Conservar la copia hasta cerrar la migración.
5. Extraer primero a una carpeta de preparación, verificar SQLite y los adjuntos
   y asignar los UID/GID que ya usan los datos del servidor. Sustituir los
   directorios completos `data/` y `uploads/` con la API detenida: no superponer
   únicamente el `.db` sobre archivos WAL/SHM antiguos. Conservar los directorios
   anteriores para recuperación. Usar la imagen correspondiente al código probado.
6. Arrancar la API y verificar HTTPS, 1 comunidad, 125 propietarios, 131 inmuebles,
   126 cuentas, estatutos, apariencia y acceso administrativo y de un vecino.
   Revisar los resultados de GCP y Netlify: son publicaciones independientes.
7. Con la aplicación ya validada, activar la política de backups descrita abajo.
   Comprobar sus primeras copias y la próxima ejecución antes de abrir acceso y
   entregar las nuevas credenciales.

Si falla antes de abrir el acceso, detener la API y recuperar juntos código,
directorios de datos, adjuntos y configuración anteriores. Después de abrirla,
preservar primero cualquier dato nuevo antes de restaurar. Un rollback de imagen
por sí solo no revierte migraciones de SQLite.

## Política de backups acordada

- Diario: todos los días a las **03:00 Europe/Madrid**, una copia en
  `backups/daily/comunidad-daily.tar.gz`.
- Semanal: domingos a las **03:15 Europe/Madrid**, una copia independiente en
  `backups/weekly/comunidad-weekly.tar.gz`.
- Deploy: respaldo previo a cada publicación en `backups/deploys/`, con retención
  de los **dos últimos respaldos**, aplicada al terminar una publicación saludable.
  Si falla una publicación se conserva su respaldo sin podar las anteriores.

El diario reemplaza al diario anterior; el semanal reemplaza al semanal
anterior. Se crean primero en un temporal y se verifica el archivo comprimido;
solo después se reemplaza atómicamente la copia anterior. Un fallo conserva la
copia previa e intenta volver a arrancar la API. El bloqueo común evita que
coincidan con otro backup o deploy. Cada copia detiene brevemente la API e
incluye base, adjuntos, clave de proveedores dentro de `data/`, `.env` y Compose.
Los deploys mantienen la API detenida entre el respaldo y el cambio de versión.

La programación usa timers de systemd con zona explícita, por lo que respeta el
horario de verano aunque la VM esté en UTC. `Persistent=true` recupera una
ejecución omitida si la VM estuvo apagada: puede empezar una copia al activarlos.
Los logs se consultan en el journal de systemd.

Activación única, con los nuevos archivos ya instalados en la raíz de la app:

```bash
cd /home/quantum_system/comunidad
sudo bash deploy/install-backup-schedule.sh
sudo systemctl start comunidad-backup@daily.service
sudo systemctl start comunidad-backup@weekly.service
systemctl list-timers comunidad-backup-daily.timer comunidad-backup-weekly.timer
journalctl -u comunidad-backup@daily.service -u comunidad-backup@weekly.service -n 50
```

El instalador guarda el crontab anterior y retira solo las líneas activas de
`deploy/backup.sh`. No instala ya el cron quincenal. Los backups antiguos que
queden en la raíz de `backups/` no se borran ni se mezclan con la nueva rotación.
Los deploys siguientes actualizan los scripts, pero no activan timers ni ejecutan
este instalador con privilegios automáticamente.

Esta configuración guarda copias en la misma VM; no configura almacenamiento
externo. No se ha activado todavía en producción durante la preparación local.
