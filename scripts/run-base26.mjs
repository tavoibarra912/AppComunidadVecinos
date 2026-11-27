// Lanza la app contra la base importada de "BASE DE DATOS 26".
// Uso: npm run dev:base26
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

process.env.APP_DATA_DIR = path.join(root, ".local-test", "base-26", "data");
process.env.APP_UPLOADS_DIR = path.join(root, ".local-test", "base-26", "uploads");
process.env.APP_DEMO_DATA = "false";
process.env.APP_DEMO_PROFILES = "false";
if (!process.env.PORT) process.env.PORT = "3100";
if (!process.env.HOST) process.env.HOST = "127.0.0.1";

await import("../server.js");
