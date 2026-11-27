import assert from "node:assert/strict";
import test from "node:test";
import {
  cadastralReferenceProblem,
  normalizeCadastralReference,
} from "../../src/cadastral-reference.js";

test("referencia catastral: comprueba formato y los dos caracteres de control", () => {
  for (const reference of [
    "9872023VH5797S0001WX",
    "06011A012002450000QE",
    "7837301VG8173B0001TT",
    "4A08169P03PRAT0001LR",
    "9872023ÑH5797S0001WP",
  ]) {
    assert.equal(cadastralReferenceProblem(reference), "", reference);
  }
  assert.equal(cadastralReferenceProblem("9872023VH5797S0001AA"), "checksum");
  assert.equal(cadastralReferenceProblem("123"), "format");
  assert.equal(cadastralReferenceProblem("9872023VH5797S000100"), "format");
  assert.equal(cadastralReferenceProblem(""), "missing");
});

test("referencia catastral: normaliza separadores y mayúsculas conservando el control", () => {
  assert.equal(normalizeCadastralReference(" 7837301-vg8173b 0001 tt "), "7837301VG8173B0001TT");
  assert.equal(cadastralReferenceProblem(" 7837301-vg8173b 0001 tt "), "");
  assert.equal(cadastralReferenceProblem("7837301/VG8173B0001TT"), "format");
});
