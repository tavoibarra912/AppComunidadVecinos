import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPlan,
  detectDocumentType,
  findHeaderRow,
  normalizeDocument,
  parseArea,
  parseDelimited,
  splitTitular,
  writeDatabase,
} from "../import-base-datos-26.mjs";

function header() {
  const row = Array(21).fill("");
  row[2] = "Pcla.";
  row[3] = "Nombre del Titular (Asociación)";
  row[5] = "Ref. Catastral";
  row[6] = "DNI/NIF";
  row[8] = "Superficie C.R.";
  row[14] = "Tipo de via";
  row[15] = "Direccion";
  row[16] = "Teléfono fijo";
  row[17] = "Teléfono móvil";
  row[18] = "E-mail";
  row[19] = "Codigo Postal";
  row[20] = "Localidad";
  return row;
}

function row({ pcla, titular, document, area, ...extra }) {
  const cells = Array(21).fill("");
  cells[0] = extra.ref || "";
  cells[2] = pcla;
  cells[3] = titular;
  cells[5] = extra.cadastralRef || "";
  cells[6] = document;
  cells[8] = area;
  cells[12] = extra.cuotaSuperficie || "";
  cells[14] = extra.tipoVia ?? "Camino";
  cells[15] = extra.direccion ?? "de la Barca, s/n";
  cells[16] = extra.telefonoFijo || "";
  cells[17] = extra.telefonoMovil || "";
  cells[18] = extra.email || "";
  cells[19] = extra.codigoPostal ?? "28595";
  cells[20] = extra.localidad ?? "Estremera";
  return cells;
}

test("normaliza documentos y detecta su tipo", () => {
  assert.equal(normalizeDocument(" 50035496-p "), "50035496P");
  assert.equal(detectDocumentType("50035496-P"), "DNI");
  assert.equal(detectDocumentType("X-4236505-Z"), "NIE");
  assert.equal(detectDocumentType("A12345678"), "CIF");
});

test("parte el titular y normaliza superficies", () => {
  assert.deepEqual(splitTitular("Jose Ramón Valverde Franco"), {
    name: "Jose",
    surname: "Ramón Valverde Franco",
  });
  assert.deepEqual(splitTitular(""), { name: "", surname: "" });
  assert.equal(parseArea("1051"), "1051");
  assert.equal(parseArea("1.051,5"), "1051.5");
  assert.equal(parseArea(""), "");
});

test("parsea CSV con comillas y comas dentro de celdas", () => {
  const table = parseDelimited('a,"Casino, 1, 2ºD",3\r\nb,,4\r\n');
  assert.deepEqual(table, [
    ["a", "Casino, 1, 2ºD", "3"],
    ["b", "", "4"],
  ]);
});

test("detecta el encabezado aunque haya filas de título arriba", () => {
  const table = [["BASE DE DATOS COMPLETA"], header()];
  assert.equal(findHeaderRow(table), 1);
  assert.equal(findHeaderRow([["sin encabezado"]]), -1);
});

test("arma el plan: unifica propietarios por DNI y vincula varios inmuebles", () => {
  const plan = buildPlan([
    header(),
    row({ pcla: "1", titular: "Ana Torres Gil", document: "11111111-H", area: 100, ref: "414" }),
    row({
      pcla: "2",
      titular: "Ana Torres Gil",
      document: "11111111-H",
      area: 200,
      email: "ana@example.com",
      telefonoMovil: "600000000",
    }),
    row({ pcla: "3", titular: "Luis Pérez", document: "", area: 300 }),
  ]);

  assert.equal(plan.stats.inmuebles, 3);
  assert.equal(plan.stats.propietarios, 1);
  assert.equal(plan.stats.usuarios, 1);
  assert.equal(plan.stats.inmueblesSinPropietario, 1);
  assert.equal(plan.stats.superficieTotal, 600);
  assert.equal(plan.owners[0].propertyIds.length, 2);
  assert.equal(plan.owners[0].phone, "600000000");
  assert.equal(plan.users[0].usuario, "11111111h");
  assert.equal(plan.users[0].password, "11111111h12345678");
  assert.equal(plan.properties[0].plot, "Parcela 1");
  assert.equal(plan.properties[0].address, "Camino de la Barca, s/n");
  assert.equal(plan.properties[0].city, "Estremera");
  assert.equal(plan.properties[0].ownerIds[0], plan.owners[0].id);
  assert.deepEqual(plan.properties[2].ownerIds, []);
  assert.ok(plan.warnings.some((warning) => warning.message.includes("sin propietario")));
});

test("usa la dirección de la parcela si la fila no tiene dirección", () => {
  const plan = buildPlan([
    header(),
    row({
      pcla: "7",
      titular: "Marta Ruiz",
      document: "22222222-J",
      area: 10,
      tipoVia: "",
      direccion: "",
    }),
  ]);
  assert.equal(plan.properties[0].address, "Parcela 7");
  assert.ok(plan.warnings.some((warning) => warning.message.includes("Fila sin dirección")));
});

test("descarta referencias catastrales inválidas y las reporta", () => {
  const plan = buildPlan([
    header(),
    row({
      pcla: "9",
      titular: "Pablo Soto",
      document: "33333333-P",
      area: 50,
      cadastralRef: "123",
    }),
  ]);
  assert.equal(plan.properties[0].cadastralRef, "");
  assert.ok(plan.warnings.some((warning) => warning.message.includes("catastral")));
});

test("escribe la base en una carpeta local aislada", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "base26-"));
  try {
    const plan = buildPlan([
      header(),
      row({
        pcla: "10",
        titular: "Elena Vidal Ruiz",
        document: "44444444-A",
        area: 120,
        telefonoMovil: "611111111",
        email: "elena@example.com",
      }),
    ]);
    const result = await writeDatabase(plan, outDir, { force: true });
    assert.equal(result.totals.comunidades, 1);
    assert.equal(result.totals.propietarios, 1);
    assert.equal(result.totals.inmuebles, 1);
    assert.equal(result.totals.inmueblesSinTitular, 0);
    assert.ok(fs.existsSync(result.dbFile));

    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(result.dbFile);
    const property = db.prepare("SELECT plot, address, ownerIds FROM properties").get();
    assert.equal(property.plot, "Parcela 10");
    assert.match(property.ownerIds, /own-base26-44444444a/);
    const owner = db.prepare("SELECT dni, isMember, userId, propertyIds FROM owners").get();
    assert.equal(owner.dni, "44444444A");
    assert.equal(owner.isMember, 1);
    assert.match(owner.userId, /user-base26-/);
    assert.match(owner.propertyIds, /prop-base26-10/);
    const community = db.prepare("SELECT name, legalConfig FROM communities").get();
    assert.match(community.name, /Peña Rubia/);
    assert.equal(JSON.parse(community.legalConfig).regimen, "asociacion");
    db.close();
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
