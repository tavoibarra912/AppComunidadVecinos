import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { copyOwnerDataToTenantForm, ownerHasSameDocument } from "../../public/js/tenant-form.js";

test("copiar datos del propietario rellena los campos existentes y los deja editables", () => {
  const dom = new JSDOM(readFileSync("public/index.html", "utf8"));
  const form = dom.window.document.querySelector("#tenant-form");
  const button = dom.window.document.querySelector("#tenant-copy-owner-data");
  const owner = {
    name: "Ana",
    surname: "García",
    documentType: "NIE",
    dni: "X1234567L",
    phone: "612 345 678",
    email: "ana@example.test",
  };

  copyOwnerDataToTenantForm(owner, form);

  assert.equal(button.type, "button");
  assert.equal(form.elements.name.value, "Ana");
  assert.equal(form.elements.surname.value, "García");
  assert.equal(form.elements.documentType.value, "NIE");
  assert.equal(form.elements.documentId.value, "X1234567L");
  assert.equal(form.elements.phone.value, "612 345 678");
  assert.equal(form.elements.email.value, "ana@example.test");
  for (const name of ["name", "surname", "documentType", "documentId", "phone", "email"])
    assert.equal(form.elements[name].disabled, false);

  dom.window.close();
});

test("la copia limpia campos que el propietario no tenga y compara documentos normalizados", () => {
  const dom = new JSDOM(readFileSync("public/index.html", "utf8"));
  const form = dom.window.document.querySelector("#tenant-form");
  form.elements.phone.value = "612345678";
  form.elements.email.value = "anterior@example.test";

  copyOwnerDataToTenantForm({ name: "Luis", dni: "12.345.678-Z" }, form);

  assert.equal(form.elements.phone.value, "");
  assert.equal(form.elements.email.value, "");
  assert.equal(form.elements.documentType.value, "DNI");
  assert.equal(ownerHasSameDocument("12345678-z", { dni: "12.345.678-Z" }), true);
  assert.equal(ownerHasSameDocument("", { dni: "" }), false);
  assert.equal(ownerHasSameDocument("12345678A", { dni: "12345678-Z" }), false);

  dom.window.close();
});
