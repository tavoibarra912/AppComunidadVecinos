import { test } from "node:test";
import assert from "node:assert/strict";

const { purgeIssueReports } = await import("../../src/issue-reports.js");

// Pool falso: estas pruebas no abren conexiones reales a Postgres.
function fakePool(calls, rowCount = 0) {
  return () => ({
    query: async (sql, params) => {
      calls.push([sql, params]);
      return { rowCount };
    },
  });
}

test("el historial de reportes se borra con el id de la cuenta", async () => {
  const calls = [];
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://usuario:clave@127.0.0.1:5432/pruebas";
  let purged;
  try {
    purged = await purgeIssueReports("user-borrado", { pool: fakePool(calls, 3) });
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
  assert.equal(purged, 3);
  assert.deepEqual(calls, [["DELETE FROM issue_reports WHERE user_id = $1", ["user-borrado"]]]);
});

test("sin DATABASE_URL no hay historial que borrar ni se abre una conexión", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const calls = [];
  try {
    assert.equal(await purgeIssueReports("user-borrado", { pool: fakePool(calls) }), 0);
  } finally {
    if (previous !== undefined) process.env.DATABASE_URL = previous;
  }
  assert.deepEqual(calls, []);
});

test("sin la tabla creada la purga no bloquea la baja", async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://usuario:clave@127.0.0.1:5432/pruebas";
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(String(message));
  try {
    const pool = () => ({
      query: async () => {
        throw Object.assign(new Error('relation "issue_reports" does not exist'), {
          code: "42P01",
        });
      },
    });
    assert.equal(await purgeIssueReports("user-sin-tabla", { pool }), 0);
  } finally {
    console.warn = warn;
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /issue_reports no existe/);
});

test("un fallo real de Postgres sí se propaga para poder reintentar", async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://usuario:clave@127.0.0.1:5432/pruebas";
  try {
    const pool = () => ({
      query: async () => {
        throw Object.assign(new Error("no se pudo conectar"), { code: "ECONNREFUSED" });
      },
    });
    await assert.rejects(() => purgeIssueReports("user-borrado", { pool }), /no se pudo conectar/);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
