# Reglas del proyecto

## Producción: datos y credenciales

- La base del servidor es la fuente de verdad. Un pedido de deploy autoriza actualizar código, no reemplazar, reimportar, vaciar ni restaurar la base, ni copiar una base local sobre producción.
- No cambiar, regenerar, normalizar ni rotar usuarios o contraseñas durante un deploy, importación, preparación de candidata o arranque sin un pedido explícito del usuario para esa operación. Conservar también las contraseñas que alguien haya personalizado.
- La sustitución inicial del Excel y la corrección de contraseñas del 27/11/2026 fueron excepciones puntuales ya ejecutadas. No autorizan repetirlas en futuros deploys.
- Los deploys habituales usan `scripts/update-vm.sh`: respaldo previo verificado, ensayo de arranque con una copia aislada y conservación de `data/`, `uploads/`, `.env` y claves del servidor.
- No desactivar ni saltarse las protecciones para conseguir un deploy verde. Si una migración modifica datos existentes, preparar el alcance y la recuperación y obtener autorización explícita antes de aplicarla aparte. Las ampliaciones de esquema que conservan los datos pueden validarse con el ensayo normal.
- Si falta la base de producción, detener el arranque. No crear una base vacía, ejecutar seeds ni recrear cuentas por defecto para resolverlo.
- No restaurar la base automáticamente al fallar una versión. Conservar los datos posteriores al despliegue y revisar compatibilidad antes de restaurar.
- Mantener backups separados: diario a las 03:00 y semanal los domingos a las 03:15, `Europe/Madrid`, una copia reemplazable por tipo; los de deploy tienen su propia carpeta y retención.
- Nunca incluir bases, adjuntos, `.env`, claves, contraseñas ni archivos privados de accesos en Git, imágenes o publicaciones estáticas. No imprimir hashes ni secretos en logs.

## Contexto compartido local (`QSMANU-LOCAL-SHARED-MCP`)

- Compartición opt-in estricta: no publicar ni actualizar contexto sin pedido explícito del usuario. Un cierre de trabajo no autoriza publicar un handoff; pedir permiso antes.
- Usar `shared_pull` al retomar trabajo o recibir una tarea de otra herramienta, antes de pedir explicaciones.
- No leer otros proyectos sin pedido explícito y `confirm_cross_project: true`.
- El proyecto se detecta automáticamente. Preguntar cuál es solo si `shared_status` dice «sin determinar»; puede fijarse con `shared_use_project` o `sharedctx use`.
- Un handoff autorizado usa `shared_publish`, `type: "handoff"`: qué se hizo, pendientes, próximo paso y archivos tocados, breve y sin transcripciones.
- Si una publicación queda PENDIENTE, informar el id y `sharedctx approve <id>` (o `sharedctx approve all`). No se comparte hasta aprobarla.
- Nunca cambiar el modo de consentimiento; lo hace el usuario con `sharedctx mode`.
