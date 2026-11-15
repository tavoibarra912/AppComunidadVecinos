import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import express from "express";

const directory = mkdtempSync(path.join(tmpdir(), "pen-bench-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";

const { db } = await import("./src/db.js");
const { seedIfEmpty } = await import("./src/seed.js");
seedIfEmpty();
const extra = Number(process.argv[2] || 300);
const insert = db.prepare(
  "INSERT INTO properties(id,communityId,communityName,propertyType,plot,address,participationCoef) VALUES(?,?,?,?,?,?,?)",
);
const communities = db.prepare("SELECT id,name FROM communities").all();
db.exec("BEGIN");
for (let i = 0; i < extra; i++) {
  const c = communities[i % communities.length];
  insert.run(`bench-${i}`, c.id, c.name, "vivienda", `Bench ${i}`, `Calle Bench ${i}`, "1.0000");
}
db.exec("COMMIT");
const { default: router } = await import("./src/routes/index.js");
const app = express();
app.use(express.json({ limit: "60mb" }));
app.use("/api", router);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/api`;
let cookie = "";
const request = async (route, method = "GET", body) => {
  const res = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.headers.get("set-cookie")) cookie = res.headers.get("set-cookie").split(";")[0];
  return { status: res.status, data: await res.json() };
};
const login = await request("/auth/signin", "POST", {
  usuario: "super_admin",
  password: "super_admin",
});
if (login.status !== 200) throw new Error(JSON.stringify(login.data));
const counts = {
  properties: db.prepare("SELECT COUNT(*) n FROM properties").get().n,
  owners: db.prepare("SELECT COUNT(*) n FROM owners").get().n,
};

// warmup
await request("/bootstrap");
const samples = [];
let healthMax = 0;
for (let i = 0; i < 6; i++) {
  const healthPromise = (async () => {
    await new Promise((r) => setTimeout(r, 10));
    const t = performance.now();
    const res = await request("/health");
    if (!res.data?.status) throw new Error("health failed");
    healthMax = Math.max(healthMax, performance.now() - t);
  })();
  const t = performance.now();
  const res = await request("/bootstrap");
  const elapsed = performance.now() - t;
  if (res.status !== 200) throw new Error(JSON.stringify(res.data));
  samples.push(elapsed);
  await healthPromise;
}
samples.sort((a, b) => a - b);
const p = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))].toFixed(0);
console.log(
  JSON.stringify(
    {
      counts,
      bootstrap_ms: { min: p(0), median: p(0.5), max: p(1) },
      health_max_ms: healthMax.toFixed(0),
      payload_bytes: Buffer.byteLength(JSON.stringify((await request("/bootstrap")).data)),
    },
    null,
    2,
  ),
);
await new Promise((r) => server.close(r));
db.close();
rmSync(directory, { recursive: true, force: true });
