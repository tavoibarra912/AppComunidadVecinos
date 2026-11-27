// Comprobación local de formato y caracteres de control. No consulta el Catastro.
// Estructura: https://www.catastro.hacienda.gob.es/es-ES/referencia_catastral.html
// Contraste del cálculo: python-stdnum, stdnum/es/referenciacatastral.py.
const WEIGHTS = [13, 15, 12, 5, 4, 17, 9, 21, 3, 7, 1];
const LETTERS = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
const CONTROLS = "MQWERTYUIOPASDFGHJKLBZX";

export function normalizeCadastralReference(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s.\-]/g, "");
}

function control(part) {
  const total = [...part].reduce((sum, char, index) => {
    const value = /^\d$/.test(char) ? Number(char) : LETTERS.indexOf(char) + 1;
    return sum + value * WEIGHTS[index];
  }, 0);
  return CONTROLS[total % 23];
}

export function cadastralReferenceProblem(value) {
  const reference = normalizeCadastralReference(value);
  if (!reference) return "missing";
  if (!/^[A-ZÑ0-9]{18}[A-Z]{2}$/.test(reference)) return "format";
  const unit = reference.slice(14, 18);
  const expected = control(reference.slice(0, 7) + unit) + control(reference.slice(7, 14) + unit);
  return expected === reference.slice(18) ? "" : "checksum";
}
