import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = new URL(process.env.APP_BACKEND_URL || "https://35.209.188.202/comunidad/");
if (
  target.protocol !== "https:" ||
  target.username ||
  target.password ||
  target.search ||
  target.hash
)
  throw new Error("APP_BACKEND_URL debe ser una URL HTTPS sin credenciales, query ni fragmento.");
const backend = target.href.replace(/\/$/, "");
const output = path.join(root, "dist");
await rm(output, { recursive: true, force: true });
await cp(path.join(root, "public"), output, { recursive: true });
// El HTML lleva la marca/configuración actual y se obtiene del backend en cada visita.
await rm(path.join(output, "index.html"));
if (process.env.APP_RELEASE)
  await writeFile(
    path.join(output, "release.json"),
    JSON.stringify({ release: process.env.APP_RELEASE }),
  );
await mkdir(path.join(output, "vendor"), { recursive: true });
await cp(
  path.join(root, "node_modules/dompurify/dist/purify.es.mjs"),
  path.join(output, "vendor/dompurify.mjs"),
);
await writeFile(
  path.join(output, "_redirects"),
  [
    `/api/* ${backend}/api/:splat 200!`,
    `/ ${backend}/ 200!`,
    `/index.html ${backend}/ 200!`,
    "",
  ].join("\n"),
);
await writeFile(
  path.join(output, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
/*.js
  Cache-Control: public, max-age=0, must-revalidate
/*.css
  Cache-Control: public, max-age=0, must-revalidate
/api/*
  Cache-Control: no-store
/
  Cache-Control: no-store
/index.html
  Cache-Control: no-store
`,
);
console.log("Frontend listo en dist/: solo archivos públicos y DOMPurify, sin datos ni secretos.");
