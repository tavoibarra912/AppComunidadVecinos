import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LEGAL_CONFIG,
  legalConfigFromValue,
  mergeLegalConfig,
  validateLegalConfig,
  votingRuleLabel,
  votingRuleOf,
} from "../../src/legal-config.js";

test("configuración jurídica: valores por defecto conservadores", () => {
  const config = legalConfigFromValue({});
  assert.deepEqual(config, DEFAULT_LEGAL_CONFIG);
  assert.equal(config.regimen, "lph");
  assert.equal(config.deudaCopropietarios.expresion, "inmueble");
  assert.equal(config.deudaCopropietarios.porcentajesHistoricos, "no_consta");
  assert.equal(config.creditoTitular.politica, "bloquear");
  assert.equal(config.traslados.deuda, "conservar_origen");
  assert.equal(config.votaciones.unidad, "coeficiente");
  assert.equal(config.votaciones.copropiedad, "representante");
});

test("configuración jurídica: normaliza texto y rechaza valores desconocidos", () => {
  const config = legalConfigFromValue({
    regimen: "otro",
    deudaCopropietarios: {
      expresion: "cuota",
      mostrarRepartoInterno: "sí",
      porcentajesHistoricos: "inventado",
    },
    creditoTitular: { politica: "ignorar", destinoPorDefecto: "compensacion" },
    traslados: { deuda: "trasladar", exigirDocumento: false },
    votaciones: { unidad: "propietario", copropiedad: "todos", mayoriaOrdinaria: "tres_quintos" },
    estatutos: { referencia: "  Estatutos 2018  ", fechaAprobacion: "15/06/2018" },
  });
  assert.equal(config.regimen, "lph");
  assert.equal(config.deudaCopropietarios.expresion, "cuota");
  assert.equal(config.deudaCopropietarios.mostrarRepartoInterno, false);
  assert.equal(config.deudaCopropietarios.porcentajesHistoricos, "no_consta");
  assert.equal(config.creditoTitular.politica, "bloquear");
  assert.equal(config.creditoTitular.destinoPorDefecto, "compensacion");
  assert.equal(config.traslados.deuda, "trasladar");
  assert.equal(config.traslados.exigirDocumento, false);
  assert.equal(config.votaciones.unidad, "propietario");
  assert.equal(config.votaciones.copropiedad, "todos");
  assert.equal(config.votaciones.mayoriaOrdinaria, "tres_quintos");
  assert.equal(config.estatutos.referencia, "Estatutos 2018");
  assert.equal(config.estatutos.fechaAprobacion, "");
});

test("configuración jurídica: la fusión parcial conserva el resto", () => {
  const base = legalConfigFromValue({
    regimen: "asociacion",
    creditoTitular: { politica: "advertir", destinoPorDefecto: "cesion" },
    estatutos: { referencia: "Acta fundacional" },
  });
  const merged = mergeLegalConfig(base, { votaciones: { unidad: "cuenta" } });
  assert.equal(merged.regimen, "asociacion");
  assert.equal(merged.creditoTitular.politica, "advertir");
  assert.equal(merged.creditoTitular.destinoPorDefecto, "cesion");
  assert.equal(merged.estatutos.referencia, "Acta fundacional");
  assert.equal(merged.votaciones.unidad, "cuenta");
  assert.equal(merged.votaciones.copropiedad, "representante");
});

test("configuración jurídica: valida sin lanzar y limita tamaños", () => {
  assert.equal(validateLegalConfig(undefined), null);
  assert.match(validateLegalConfig([]), /no es válida/i);
  assert.match(validateLegalConfig({ deudaCopropietarios: "inmueble" }), /no es válida/i);
  assert.match(validateLegalConfig({ votaciones: null }), /no es válida/i);
  assert.match(validateLegalConfig({ regimen: "otro" }), /régimen/i);
  assert.match(
    validateLegalConfig({ deudaCopropietarios: { expresion: "mitad" } }),
    /deuda de copropietarios/i,
  );
  assert.match(
    validateLegalConfig({ votaciones: { unidad: "acciones" } }),
    /unidad de voto/i,
  );
  assert.match(
    validateLegalConfig({ estatutos: { fechaAprobacion: "2026-13-40" } }),
    /fecha de aprobación/i,
  );
  assert.match(
    validateLegalConfig({ estatutos: { referencia: "x".repeat(201) } }),
    /200 caracteres/i,
  );
  assert.equal(
    validateLegalConfig({
      deudaCopropietarios: { mostrarRepartoInterno: true },
      traslados: { exigirDocumento: false },
    }),
    null,
  );
});

test("configuración jurídica: admite la mayoría de dos tercios", () => {
  const config = legalConfigFromValue({
    regimen: "asociacion",
    votaciones: { mayoriaOrdinaria: "dos_tercios" },
  });
  assert.equal(config.votaciones.mayoriaOrdinaria, "dos_tercios");
  assert.equal(
    validateLegalConfig({ votaciones: { mayoriaOrdinaria: "dos_tercios" } }),
    null,
  );
});

test("configuración jurídica: la regla de voto se congela y se etiqueta", () => {
  const community = {
    legalConfig: {
      votaciones: { unidad: "inmueble", copropiedad: "todos", mayoriaOrdinaria: "absoluta" },
    },
  };
  assert.deepEqual(votingRuleOf(community), {
    unidad: "inmueble",
    copropiedad: "todos",
    mayoriaOrdinaria: "absoluta",
    censo: "propietarios",
  });
  assert.match(votingRuleLabel(votingRuleOf(community)), /inmueble/i);
  assert.match(votingRuleLabel(votingRuleOf(community)), /cotitular/i);
  // Una comunidad sin configuración guardada usa los valores por defecto.
  assert.equal(votingRuleOf({ legalConfig: "{}" }).unidad, "coeficiente");
  assert.equal(votingRuleOf(null).unidad, "coeficiente");
  // En una asociación manda el censo de socios, no el coeficiente ni el inmueble.
  const association = votingRuleOf({
    legalConfig: {
      regimen: "asociacion",
      votaciones: { unidad: "coeficiente", copropiedad: "todos", mayoriaOrdinaria: "simple" },
    },
  });
  assert.equal(association.unidad, "propietario");
  assert.equal(association.censo, "socios");
  assert.equal(association.copropiedad, "representante");
  assert.match(votingRuleLabel(association), /socio/i);
  // La respuesta por cuenta sigue siendo una opción explícita de la asociación.
  const byAccount = votingRuleOf({
    legalConfig: { regimen: "asociacion", votaciones: { unidad: "cuenta" } },
  });
  assert.equal(byAccount.unidad, "cuenta");
  assert.match(votingRuleLabel(byAccount), /censo de socios/i);
});
