import { fileURLToPath } from "node:url";

/**
 * Carga el archivo .env local antes de que el resto de módulos lea la
 * configuración (puerto, directorios de datos, token de GitHub…). Las variables
 * ya definidas en el entorno del proceso tienen prioridad.
 */
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") {
    console.warn(`[env] No se pudo leer .env: ${error.message}`);
  }
}
