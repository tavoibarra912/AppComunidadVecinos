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
  cells[5] =
    extra.cadastralRef ??
    ({ 1: "9872023VH5797S0001WX", 2: "7837301VG8173B0001TT", 3: "4A08169P03PRAT0001LR" }[pcla] ||
      "06011A012002450000QE");
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
  assert.ok(plan.properties.every((property) => property.propertyType === "parcela"));
  assert.equal(plan.stats.propietarios, 1);
  assert.equal(plan.stats.usuarios, 1);
  assert.equal(plan.stats.inmueblesSinPropietario, 1);
  assert.equal(plan.stats.superficieTotal, 600);
  assert.equal(plan.owners[0].propertyIds.length, 2);
  assert.equal(plan.owners[0].phone, "600000000");
  assert.equal(plan.users[0].usuario, "11111111h");
  assert.equal(plan.users[0].password, "11111111h12345678");
  assert.equal(plan.properties[0].plot, "I1 Camino de la Barca, s/n");
  assert.equal(plan.properties[0].address, "Camino de la Barca, s/n");
  assert.equal(plan.properties[0].city, "Estremera");
  assert.equal(plan.properties[0].ownerIds[0], plan.owners[0].id);
  assert.deepEqual(plan.properties[2].ownerIds, []);
  assert.ok(plan.exclusions.some((item) => item.tipo === "documento_ausente"));
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
  assert.equal(plan.properties.length, 0);
  assert.equal(plan.owners.length, 1);
  assert.deepEqual(plan.owners[0].propertyIds, []);
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
    plan.settings = {
      nombreAsociacion: "Plataforma de prueba",
      emailContacto: "admin@example.com",
      telefonoContacto: "34600000000",
      marca: { nombre: "Plataforma de prueba" },
    };
    const statutesFile = path.join(outDir, "estatutos.pdf");
    fs.writeFileSync(statutesFile, "%PDF-1.4\nstatutes-test");
    plan.statutes = { file: statutesFile };
    plan.community = {
      ...plan.community,
      legalConfig: JSON.stringify({
        regimen: "asociacion",
        estatutos: { referencia: "Estatutos 2024", fechaAprobacion: "2024-05-12" },
      }),
    };
    const result = await writeDatabase(plan, outDir, { force: true });
    assert.equal(result.totals.comunidades, 1);
    assert.equal(result.totals.propietarios, 1);
    assert.equal(result.totals.inmuebles, 1);
    assert.equal(result.totals.inmueblesSinTitular, 0);
    assert.ok(fs.existsSync(result.dbFile));

    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(result.dbFile);
    const property = db.prepare("SELECT plot, address, ownerIds FROM properties").get();
    assert.equal(property.plot, "I1 Camino de la Barca, s/n");
    assert.match(property.ownerIds, /own-base26-44444444a/);
    const owner = db.prepare("SELECT dni, isMember, userId, propertyIds FROM owners").get();
    assert.equal(owner.dni, "44444444A");
    assert.equal(owner.isMember, 1);
    assert.match(owner.userId, /user-base26-/);
    assert.match(owner.propertyIds, /prop-base26-10/);
    const community = db
      .prepare("SELECT name, legalConfig, phoneVerified, emailVerified FROM communities")
      .get();
    assert.match(community.name, /Peña Rubia/);
    assert.equal(JSON.parse(community.legalConfig).regimen, "asociacion");
    assert.equal(community.phoneVerified, 1);
    assert.equal(community.emailVerified, 1);
    assert.equal(JSON.parse(community.legalConfig).estatutos.fechaAprobacion, "2024-05-12");
    const settings = JSON.parse(
      db.prepare("SELECT data FROM settings WHERE id='general'").get().data,
    );
    assert.equal(settings.nombreAsociacion, "Plataforma de prueba");
    assert.equal(settings.marca.nombre, settings.nombreAsociacion);
    assert.equal(settings.marca.colorPrimario, "#11273e");
    assert.equal(
      db.prepare("SELECT propertyType FROM properties LIMIT 1").get().propertyType,
      "parcela",
    );
    assert.equal(
      db.prepare("SELECT propertyType FROM owners LIMIT 1").get().propertyType,
      "parcela",
    );
    const document = db.prepare("SELECT * FROM documents WHERE category='statutes'").get();
    assert.equal(document.entityId, plan.community.id);
    assert.equal(document.folderId, "");
    assert.deepEqual(
      fs.readFileSync(path.join(result.uploadsDir, document.storedName)),
      fs.readFileSync(statutesFile),
    );
    db.close();
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("excluye todas las subparcelas con referencia repetida y conserva el propietario válido sin vínculos huérfanos", () => {
  const plan = buildPlan([
    header(),
    row({
      pcla: "179B",
      titular: "Ana Torres",
      document: "2819736M",
      cadastralRef: "28055A013000540001WL",
    }),
    row({
      pcla: "179C",
      titular: "Ana Torres",
      document: "02819736M",
      cadastralRef: "28055A013000540001WL",
    }),
  ]);
  assert.equal(plan.properties.length, 0);
  assert.equal(plan.owners.length, 1);
  assert.equal(plan.owners[0].document, "02819736M");
  assert.equal(plan.users[0].usuario, "2819736m");
  assert.deepEqual(plan.owners[0].propertyIds, []);
  assert.equal(plan.owners[0].cadastralRef, "");
  assert.equal(plan.exclusions.filter((item) => item.tipo === "referencia_repetida").length, 2);
});

test("excluye propietario y usuario con documento incorrecto y conserva el inmueble válido sin titular", () => {
  const plan = buildPlan([
    header(),
    row({ pcla: "1", titular: "Titular Prueba", document: "22462593X" }),
  ]);
  assert.equal(plan.owners.length, 0);
  assert.equal(plan.users.length, 0);
  assert.equal(plan.properties.length, 1);
  assert.deepEqual(plan.properties[0].ownerIds, []);
  assert.deepEqual(plan.properties[0].residentOwnerIds, []);
  assert.deepEqual(plan.properties[0].ownerPercentages, {});
  assert.equal(plan.properties[0].primaryResidentId, "");
  assert.equal(plan.properties[0].occupancy, "");
  assert.ok(plan.exclusions.some((item) => item.tipo === "documento_invalido"));
});

test("referencia ausente o con control incorrecto excluye el inmueble, sin descartar una identidad válida", () => {
  for (const cadastralRef of ["", "9872023VH5797S0001AA"]) {
    const plan = buildPlan([
      header(),
      row({ pcla: "1", titular: "Ana Torres", document: "11111111H", cadastralRef }),
    ]);
    assert.equal(plan.properties.length, 0);
    assert.equal(plan.owners.length, 1);
    assert.equal(plan.users.length, 1);
    assert.deepEqual(plan.owners[0].propertyIds, []);
    assert.equal(plan.exclusions[0].entidad, "inmueble");
  }
});

test("las exclusiones conservan la numeración de origen y los emails vacíos no generan incidencias", () => {
  const plan = buildPlan([
    header(),
    row({ pcla: "1", titular: "Ana Torres", document: "11111111H", cadastralRef: "" }),
    row({ pcla: "2", titular: "Ana Torres", document: "11111111H", email: "" }),
  ]);
  assert.equal(plan.properties[0].plot, "I2 Camino de la Barca, s/n");
  assert.deepEqual(plan.owners[0].propertyIds, ["prop-base26-2"]);
  assert.equal(plan.owners[0].plot, plan.properties[0].plot);
  assert.ok(!plan.warnings.some((warning) => /email/i.test(warning.message)));
});

test("una fila con DNI ausente no crea ni vincula identidades por coincidencia de nombre", () => {
  const plan = buildPlan([
    header(),
    row({ pcla: "1", titular: "Ana Torres", document: "11111111H" }),
    row({ pcla: "2", titular: "Ana Torres", document: "" }),
  ]);
  assert.equal(plan.owners.length, 1);
  assert.deepEqual(plan.properties[1].ownerIds, []);
  assert.equal(plan.stats.filasSinDocumento, 1);
});

test("rechaza un plan adulterado antes de tocar archivos de una base anterior", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "base26-invalid-"));
  try {
    fs.mkdirSync(path.join(outDir, "data"));
    const marker = path.join(outDir, "data", "sentinel.txt");
    fs.writeFileSync(marker, "preservar");
    const plan = buildPlan([
      header(),
      row({ pcla: "1", titular: "Ana Torres", document: "11111111H" }),
    ]);
    plan.owners[0].document = "22462593X";
    await assert.rejects(writeDatabase(plan, outDir, { force: true }), /inválido/);
    assert.equal(fs.readFileSync(marker, "utf8"), "preservar");
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
