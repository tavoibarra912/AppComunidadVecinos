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
