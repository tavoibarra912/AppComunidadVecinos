import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { performance } from "node:perf_hooks";

test(
  "F16 · bootstrap con censo, documentos y recibos mantiene acceso y disponibilidad",
  { timeout: 30_000 },
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(), "pen-bootstrap-load-"));
    process.env.APP_DATA_DIR = directory;
    process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
    process.env.NODE_ENV = "test";
    const { db, propertyFromRow } = await import("../../src/db.js");
    const { seedIfEmpty } = await import("../../src/seed.js");
    seedIfEmpty();
    let child;
    try {
      const communities = db.prepare("SELECT id,name FROM communities ORDER BY id").all();
      const insertOwner = db.prepare(
        "INSERT INTO owners(id,name,surname,dni,propertyIds,propertyId) VALUES(?,?,?,?,?,?)",
      );
      const insertProperty = db.prepare(
        "INSERT INTO properties(id,communityId,communityName,plot,ownerIds,ownerPercentages,participationCoef) VALUES(?,?,?,?,?,?,?)",
      );
      const insertTenant = db.prepare(
        "INSERT INTO tenants(id,name,surname,ownerId,propertyId,contractStart) VALUES(?,?,?,?,?,?)",
      );
      const insertDocument = db.prepare(
        "INSERT INTO documents(id,entityType,entityId,fileName,storedName) VALUES(?,'property',?,'acta.pdf','fixture.pdf')",
      );
      const insertReceipt =
        db.prepare(`INSERT INTO fee_receipts(id,communityId,propertyId,planId,period,periodEnd,dueDate,amount,snapshot,createdAt,actorId)
      VALUES(?,?,?,'load-plan',?,?,'2026-12-31',1200,'{"months":1}','2026-01-01','load-test')`);
      db.exec("BEGIN");
      for (let i = 0; i < 1200; i++) {
        const c = communities[i % communities.length];
        const id = `load-property-${i}`,
          owner = `load-owner-${i}`;
        insertProperty.run(
          id,
          c.id,
          c.name,
          `Carga ${i}`,
          JSON.stringify([owner]),
          JSON.stringify({ [owner]: 100 }),
          "1",
        );
        insertOwner.run(owner, "Titular", String(i), `load-${i}`, JSON.stringify([id]), id);
        if (i % 4 === 0)
          insertTenant.run(`load-tenant-${i}`, "Residente", String(i), owner, id, "2020-01-01");
        insertDocument.run(`load-doc-${i}`, id);
        for (let month = 1; month <= 12; month++) {
          const period = `2026-${String(month).padStart(2, "0")}-01`;
          insertReceipt.run(`load-receipt-${i}-${month}`, c.id, id, period, period);
        }
      }
      db.exec("COMMIT");
      // La consulta por lotes conserva pagos parciales, devoluciones y anulaciones.
      db.prepare(
        "INSERT INTO fee_payments(id,communityId,ownerId,amount,paidOn,method,reference,requestId,createdAt,actorId) VALUES('load-payment',?,'load-owner-0',14400,'2026-01-01','transfer','','load-payment','2026-01-01','load-test')",
      ).run(communities[0].id);
      for (let month = 1; month <= 12; month++)
        db.prepare(
          "INSERT INTO fee_allocations(paymentId,receiptId,amount) VALUES('load-payment',?,1200)",
        ).run(`load-receipt-0-${month}`);
      const property = () =>
        propertyFromRow(db.prepare("SELECT * FROM properties WHERE id='load-property-0'").get());
      assert.equal(property().receiptStatus, "current");
      assert.equal(property().communityFee, "12.00");
      db.exec("UPDATE fee_payments SET reversedAt='2026-02-01' WHERE id='load-payment'");
      assert.equal(property().receiptStatus, "pending");
      db.exec(
        "UPDATE fee_receipts SET cancelledAt='2026-02-01' WHERE propertyId='load-property-0'",
      );
      assert.equal(property().receiptStatus, "current");

      const socket = createServer().listen(0, "127.0.0.1");
      await once(socket, "listening");
      const port = socket.address().port;
      await new Promise((resolve) => socket.close(resolve));
      child = spawn(process.execPath, ["server.js"], {
        cwd: path.resolve(import.meta.dirname, "../.."),
        env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), TRUST_PROXY: "" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let log = "";
      child.stdout.on("data", (data) => (log += data));
      child.stderr.on("data", (data) => (log += data));
      const base = `http://127.0.0.1:${port}/api`;
      let ready = false;
      for (let i = 0; i < 150; i++) {
        if (child.exitCode !== null) throw new Error(log);
        try {
          if ((await fetch(base + "/health")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      assert.ok(ready, log);
      let communityCookie;
      for (const usuario of ["super_admin", "ca1", "urucp1", "uruci1"]) {
        const login = await fetch(base + "/auth/signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario, password: usuario }),
        });
        assert.equal(login.status, 200);
        const cookie = login.headers.get("set-cookie").split(";")[0];
        if (usuario === "ca1") communityCookie = cookie;
        const samples = [],
          healthSamples = [];
        let boot;
        for (let sample = 0; sample < 3; sample++) {
          const started = performance.now();
          const pending = fetch(base + "/bootstrap", { headers: { Cookie: cookie } }).then(
            async (response) => {
              assert.equal(response.status, 200);
              boot = await response.json();
              samples.push(performance.now() - started);
            },
          );
          // El cliente vive en otro proceso: este temporizador sigue corriendo
          // aunque el event loop del servidor esté ocupado con el bootstrap.
          await new Promise((resolve) => setTimeout(resolve, 1));
          const healthStart = performance.now();
          assert.equal((await fetch(base + "/health")).status, 200);
          healthSamples.push(performance.now() - healthStart);
          await pending;
        }
        t.diagnostic(
          JSON.stringify({
            usuario,
            properties: 1211,
            receipts: 14400,
            bootstrap_ms: samples.map(Math.round),
            health_ms: healthSamples.map(Math.round),
          }),
        );
        // Margen para máquinas compartidas; la regresión original tardaba 12 s
        // con solo 311 inmuebles y sin esta carga de recibos/documentos.
        assert.ok(Math.max(...samples) < 1500, `${usuario}: bootstrap ${samples}`);
        assert.ok(Math.max(...healthSamples) < 1500, `${usuario}: health ${healthSamples}`);
        if (usuario === "super_admin") assert.equal(boot.properties.length, 1211);
        if (usuario === "ca1")
          assert.ok(boot.properties.every((p) => p.communityId === "com-seed-1"));
        if (usuario === "urucp1" || usuario === "uruci1")
          assert.ok(!boot.properties.some((p) => p.id.startsWith("load-")));
        for (const p of boot.properties.filter((p) => p.id.startsWith("load-")))
          assert.deepEqual(
            p.documents.map((d) => d.id),
            [p.id.replace("load-property-", "load-doc-")],
          );
      }
      // Sin caché entre peticiones: retirar un permiso afecta al siguiente bootstrap.
      const role = db.prepare("SELECT id,permisos FROM roles WHERE nombre='community_admin'").get();
      db.prepare("UPDATE roles SET permisos=? WHERE id=?").run(
        JSON.stringify(JSON.parse(role.permisos).filter((p) => p !== "document:read")),
        role.id,
      );
      const revoked = await fetch(base + "/bootstrap", { headers: { Cookie: communityCookie } });
      assert.equal(revoked.status, 200);
      const revokedData = await revoked.json();
      assert.ok(revokedData.properties.every((p) => p.documents.length === 0));
    } finally {
      if (child && child.exitCode === null) {
        const ended = once(child, "exit");
        child.kill();
        await ended;
      }
      db.close();
      assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
      assert.ok(path.basename(directory).startsWith("pen-bootstrap-load-"));
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
