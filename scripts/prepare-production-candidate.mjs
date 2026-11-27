// Operación local y excepcional. Nunca conecta ni escribe en producción.
import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brandOf, validateBrand } from "../src/branding.js";

const root = fileURLToPath(new URL("../", import.meta.url));
export const VISUAL_KEYS = Object.freeze([
  "colorPrimario",
  "colorAcento",
  "logoDataUrl",
  "colorFondo",
  "colorSuperficie",
  "colorTexto",
  "colorTextoSuave",
  "colorBorde",
  "tipografia",
  "tipografiaTitulos",
  "tipografiaBotones",
  "tipografias",
  "tamanoBase",
  "radioBordes",
  "densidad",
]);
const countsOf = (db) =>
  Object.fromEntries(
    [
      "communities",
      "owners",
      "properties",
      "users",
      "documents",
      "fee_receipts",
      "fee_payments",
    ].map((table) => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]),
  );

export async function prepareCandidate({ sourceDir, visualsFile, outputDir }) {
  const source = path.resolve(sourceDir);
  const output = path.resolve(outputDir);
  const privateRoot = path.join(root, ".deploy-private");
  if (path.dirname(output) !== privateRoot || !path.basename(output).startsWith("candidate-"))
    throw new Error("La candidata debe ser una carpeta candidate-* nueva en .deploy-private/.");
  if (source === output) throw new Error("Origen y destino deben ser distintos.");
  const visuals = JSON.parse(await fs.readFile(visualsFile, "utf8"));
  const error = validateBrand(visuals.marca);
  if (!visuals.marca || error) throw new Error(error || "Falta la marca exportada de producción.");
  const brand = brandOf(visuals);
  const appearance = Object.fromEntries(VISUAL_KEYS.map((key) => [key, brand[key]]));
  await fs.mkdir(privateRoot, { recursive: true });
  await fs.mkdir(output, { mode: 0o700 }); // EEXIST evita sobrescribir una candidata previa.
  await fs.mkdir(path.join(output, "data"), { mode: 0o700 });
  const original = new DatabaseSync(path.join(source, "data/penarrubia.db"), { readOnly: true });
  try {
    await backup(original, path.join(output, "data/penarrubia.db"));
  } finally {
    original.close();
  }
  await fs.cp(path.join(source, "uploads"), path.join(output, "uploads"), { recursive: true });
  try {
    await fs.copyFile(
      path.join(source, "data/provider-key"),
      path.join(output, "data/provider-key"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.writeFile(path.join(output, "data/provider-key"), crypto.randomBytes(32), {
      mode: 0o600,
    });
  }
  const db = new DatabaseSync(path.join(output, "data/penarrubia.db"));
  let counts, credentials, settings;
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok")
      throw new Error("La copia no supera integrity_check.");
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("La copia contiene relaciones inválidas.");
    counts = countsOf(db);
    settings = JSON.parse(db.prepare("SELECT data FROM settings WHERE id='general'").get().data);
    settings.marca = { ...settings.marca, ...appearance }; // El nombre permanece como en el Excel.
    credentials = [];
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE settings SET data=? WHERE id='general'").run(JSON.stringify(settings));
    for (const user of db.prepare("SELECT id,usuario,activo FROM users").all()) {
      const password = crypto.randomBytes(24).toString("base64url");
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
      db.prepare(
        "UPDATE users SET passwordHash=?,resetToken='',resetTokenExpira='' WHERE id=?",
      ).run(hash, user.id);
      credentials.push({ usuario: user.usuario, password, activo: !!user.activo });
    }
    db.exec(
      "DELETE FROM sessions; DELETE FROM password_recovery_requests; DELETE FROM password_recovery_mail;",
    );
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations(id) VALUES('production-database-v1')",
    ).run();
    db.exec("COMMIT");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
  await fs.writeFile(
    path.join(output, "accesos-produccion.json"),
    JSON.stringify(credentials, null, 2) + "\n",
    { mode: 0o600 },
  );
  const manifest = {
    generatedAt: new Date().toISOString(),
    source,
    counts,
    visualKeys: VISUAL_KEYS,
    appearanceSha256: crypto.createHash("sha256").update(JSON.stringify(appearance)).digest("hex"),
    databaseSha256: crypto
      .createHash("sha256")
      .update(await fs.readFile(path.join(output, "data/penarrubia.db")))
      .digest("hex"),
    associationNamePreserved: settings.nombreAsociacion,
    credentialsRotated: credentials.length,
    productionChanged: false,
  };
  await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", {
    mode: 0o600,
  });
  return { output, ...manifest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await prepareCandidate({
    sourceDir: path.join(root, ".local-test/base-26"),
    visualsFile: path.join(root, ".deploy-private/production-visuals.json"),
    outputDir: path.join(
      root,
      ".deploy-private",
      `candidate-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    ),
  });
  console.log(JSON.stringify(result, null, 2));
}
