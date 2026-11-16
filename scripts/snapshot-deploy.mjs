// Exportación explícita. Nunca importa db.js (evita migrar/modificar la base local).
import { DatabaseSync, backup } from "node:sqlite";
import { cp, mkdir, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(root, ".deploy-private", `snapshot-${stamp}`);
const sourceData = process.env.APP_DATA_DIR || path.join(root, "data");
const sourceUploads = process.env.APP_UPLOADS_DIR || path.join(root, "uploads");
await mkdir(path.join(destination, "data"), { recursive: true, mode: 0o700 });
const source = new DatabaseSync(path.join(sourceData, "penarrubia.db"), { readOnly: true });
try {
  await backup(source, path.join(destination, "data/penarrubia.db"));
} finally {
  source.close();
}
await cp(sourceUploads, path.join(destination, "uploads"), { recursive: true });
// Es imprescindible conservar esta clave para descifrar los proveedores existentes.
if (process.env.APP_PROVIDER_KEY) {
  if (!/^[a-f0-9]{64}$/i.test(process.env.APP_PROVIDER_KEY))
    throw new Error("APP_PROVIDER_KEY inválida.");
  await writeFile(
    path.join(destination, "data/provider-key"),
    Buffer.from(process.env.APP_PROVIDER_KEY, "hex"),
    { mode: 0o600 },
  );
} else {
  await cp(path.join(sourceData, "provider-key"), path.join(destination, "data/provider-key"));
}
const copy = new DatabaseSync(path.join(destination, "data/penarrubia.db"));
try {
  if (copy.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw new Error("La copia de SQLite no supera integrity_check.");
  const counts = Object.fromEntries(
    ["communities", "owners", "properties", "tenants", "users", "documents"].map((table) => [
      table,
      copy.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,
    ]),
  );
  const predictable = copy
    .prepare("SELECT id, usuario, passwordHash, activo FROM users")
    .all()
    .filter((user) => {
      const [scheme, salt, hash] = String(user.passwordHash).split(":");
      return (
        scheme === "scrypt" &&
        /^[a-f0-9]{32}$/.test(salt) &&
        /^[a-f0-9]{128}$/.test(hash) &&
        [user.usuario, "super_admin", "admin"].some((candidate) =>
          crypto.timingSafeEqual(crypto.scryptSync(candidate, salt, 64), Buffer.from(hash, "hex")),
        )
      );
    });
  const rotated = [];
  if (process.argv.includes("--rotate-predictable")) {
    for (const user of predictable) {
      const password = crypto.randomBytes(24).toString("base64url");
      const salt = crypto.randomBytes(16).toString("hex");
      const record = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
      copy
        .prepare("UPDATE users SET passwordHash=?, resetToken='', resetTokenExpira='' WHERE id=?")
        .run(record, user.id);
      rotated.push({ usuario: user.usuario, password, activo: !!user.activo });
    }
    await writeFile(
      path.join(destination, "accesos-produccion.json"),
      JSON.stringify(rotated, null, 2) + "\n",
      { mode: 0o600 },
    );
  }
  // Las sesiones y recuperaciones locales no se trasladan a un origen diferente.
  copy.exec(
    "DELETE FROM sessions; DELETE FROM password_recovery_requests; DELETE FROM password_recovery_mail; UPDATE users SET resetToken='', resetTokenExpira='';",
  );
  const summary = {
    destination,
    counts,
    predictablePasswords: predictable.length,
    rotatedPasswords: rotated.length,
  };
  await writeFile(
    path.join(destination, "manifest.json"),
    JSON.stringify(summary, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  copy.close();
}
