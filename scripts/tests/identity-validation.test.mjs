import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectDocumentType,
  isValidCif,
  isValidCommunityNif,
  isValidDni,
  isValidDniNie,
  isValidIdentityDocument,
  isValidNie,
  isValidNif,
} from "../../public/js/utils.js";

test("DNI: 8 dígitos y letra de control módulo 23", () => {
  for (const value of ["12345678Z", "00000000T", "11111111H", "77777777B"]) {
    assert.equal(isValidDni(value), true, value);
  }
  for (const value of ["12345678A", "1234567Z", "123456789Z", "12345678", "12345678ZZ"]) {
    assert.equal(isValidDni(value), false, value);
  }
});

test("NIE: X/Y/Z + 7 dígitos y letra de control", () => {
  for (const value of ["X0000000T", "Y6943305X", "Z1234567R", "X9999999J"]) {
    assert.equal(isValidNie(value), true, value);
  }
  for (const value of ["X0000000A", "Y1111111J", "W1234567R", "X123456R"]) {
    assert.equal(isValidNie(value), false, value);
  }
  assert.equal(isValidDniNie("12345678Z"), true);
  assert.equal(isValidDniNie("X0000000T"), true);
});

test("CIF: letra inicial, 7 dígitos y control dígito/letra según el tipo", () => {
  for (const value of ["A58818501", "B12345674", "H12345674", "P1234567D", "Q1234567D", "C12345674", "C1234567D"]) {
    assert.equal(isValidCif(value), true, value);
  }
  for (const value of [
    "B12345678",
    "H12345678",
    "P12345674", // P exige letra de control
    "A1234567D", // A exige dígito de control
    "O12345674", // letra inicial no válida
    "B1234567",  // falta el control
  ]) {
    assert.equal(isValidCif(value), false, value);
  }
});

test("NIF y NIF de comunidad", () => {
  assert.equal(isValidNif("12345678Z"), true);
  assert.equal(isValidNif("X0000000T"), true);
  assert.equal(isValidNif("B12345674"), true);
  assert.equal(isValidNif("B12345678"), false);
  assert.equal(isValidCommunityNif("H12345674"), true);
  assert.equal(isValidCommunityNif("H12345678"), false);
  assert.equal(isValidCommunityNif("B12345674"), false);
});

test("detección de tipo y validación por tipo declarado", () => {
  assert.equal(detectDocumentType("12345678Z"), "DNI");
  assert.equal(detectDocumentType("X0000000T"), "NIE");
  assert.equal(detectDocumentType("B12345674"), "CIF");
  assert.equal(detectDocumentType("H12345674"), "CIF");
  assert.equal(isValidIdentityDocument("12345678Z", "DNI"), true);
  assert.equal(isValidIdentityDocument("12345678Z", "NIE"), false);
  assert.equal(isValidIdentityDocument("X0000000T", "NIE"), true);
  assert.equal(isValidIdentityDocument("B12345674", "CIF"), true);
  assert.equal(isValidIdentityDocument("B12345674", "NIF"), true);
  assert.equal(isValidIdentityDocument("12345678Z", "NIF"), true);
});
