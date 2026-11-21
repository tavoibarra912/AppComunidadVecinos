// Configuración jurídica por comunidad.
//
// Las reglas de cobro, certificados, traslados y votaciones dependen del
// régimen de cada entidad (LPH o asociación) y de sus estatutos. Esta capa
// guarda esos criterios como datos versionables y deja valores por defecto
// conservadores, alineados con la LPH y el Código Civil.
//
// Referencias orientativas (no sustituyen la revisión de estatutos y títulos):
// - LPH arts. 9.1.e, 15 y 17: afección del inmueble, cómputo de propietarios y
//   cuotas, mayorías y representación de la copropiedad.
// - Código Civil arts. 393, 1195-1196 y 1526 y ss.: reparto interno entre
//   cotitulares, compensación y cesión de créditos.
// - Ley Orgánica 1/2002 (Asociaciones) art. 21: censo de socios y derechos
//   estatutarios de voto.

export const LEGAL_REGIMES = Object.freeze({
  lph: "Comunidad de propietarios (LPH)",
  asociacion: "Asociación",
});

export const DEBT_EXPRESSIONS = Object.freeze({
  inmueble: "Deuda del inmueble (recomendado)",
  cuota: "Cuota individual proporcional",
});

export const HISTORICAL_SHARE_POLICIES = Object.freeze({
  no_consta: "Indicar «no consta»",
  ultimo_conocido: "Usar el último porcentaje conocido",
  omitir: "Omitir el reparto interno",
});

export const CREDIT_POLICIES = Object.freeze({
  bloquear: "Bloquear hasta conciliar el saldo (recomendado)",
  advertir: "Advertir y dejar constancia",
  permitir: "Permitir sin conciliación previa",
});

export const CREDIT_DESTINATIONS = Object.freeze({
  devolucion: "Devolución al titular",
  compensacion: "Compensación con deudas vencidas, líquidas y exigibles",
  cesion: "Cesión documentada a un tercero",
  fondo_reserva: "Aportación al fondo de reserva",
  otro: "Otro destino documentado",
});

export const TRANSFER_DEBT_POLICIES = Object.freeze({
  conservar_origen: "Dejar constancia: conservar la deuda en origen (recomendado)",
  trasladar: "Dejar constancia: trasladar la deuda al destino",
});

export const VOTING_UNITS = Object.freeze({
  coeficiente: "Por coeficiente de participación",
  inmueble: "Un voto por inmueble",
  propietario: "Un voto por propietario",
  cuenta: "Una respuesta por cuenta de acceso",
});

export const COOWNERSHIP_RULES = Object.freeze({
  representante: "Un voto por inmueble (representante común)",
  todos: "Voto separado de cada cotitular según su cuota",
});

export const MAJORITIES = Object.freeze({
  simple: "Mayoría simple de los asistentes",
  absoluta: "Mayoría absoluta de propietarios y cuotas",
  tres_quintos: "Tres quintos de propietarios y cuotas",
  unanimidad: "Unanimidad",
});

export const DEFAULT_LEGAL_CONFIG = Object.freeze({
  regimen: "lph",
  deudaCopropietarios: Object.freeze({
    expresion: "inmueble",
    mostrarRepartoInterno: true,
    porcentajesHistoricos: "no_consta",
  }),
  creditoTitular: Object.freeze({
    politica: "bloquear",
    destinoPorDefecto: "devolucion",
  }),
  traslados: Object.freeze({
    deuda: "conservar_origen",
    exigirDocumento: true,
  }),
  votaciones: Object.freeze({
    unidad: "coeficiente",
    copropiedad: "representante",
    mayoriaOrdinaria: "simple",
  }),
  estatutos: Object.freeze({
    referencia: "",
    fechaAprobacion: "",
  }),
});

const pick = (value, allowed, fallback) =>
  Object.hasOwn(allowed, value) ? value : fallback;

function text(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Fecha ISO real: rechaza meses o días imposibles, no solo el formato. */
function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Normaliza cualquier valor guardado o recibido de la API. Nunca lanza:
 * los valores desconocidos vuelven al criterio por defecto.
 */
export function legalConfigFromValue(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const deuda =
    source.deudaCopropietarios &&
    typeof source.deudaCopropietarios === "object" &&
    !Array.isArray(source.deudaCopropietarios)
      ? source.deudaCopropietarios
      : {};
  const credito =
    source.creditoTitular &&
    typeof source.creditoTitular === "object" &&
    !Array.isArray(source.creditoTitular)
      ? source.creditoTitular
      : {};
  const traslados =
    source.traslados && typeof source.traslados === "object" && !Array.isArray(source.traslados)
      ? source.traslados
      : {};
  const votaciones =
    source.votaciones && typeof source.votaciones === "object" && !Array.isArray(source.votaciones)
      ? source.votaciones
      : {};
  const estatutos =
    source.estatutos && typeof source.estatutos === "object" && !Array.isArray(source.estatutos)
      ? source.estatutos
      : {};
  return {
    regimen: pick(source.regimen, LEGAL_REGIMES, DEFAULT_LEGAL_CONFIG.regimen),
    deudaCopropietarios: {
      expresion: pick(
        deuda.expresion,
        DEBT_EXPRESSIONS,
        DEFAULT_LEGAL_CONFIG.deudaCopropietarios.expresion,
      ),
      mostrarRepartoInterno:
        deuda.mostrarRepartoInterno === undefined
          ? DEFAULT_LEGAL_CONFIG.deudaCopropietarios.mostrarRepartoInterno
          : deuda.mostrarRepartoInterno === true,
      porcentajesHistoricos: pick(
        deuda.porcentajesHistoricos,
        HISTORICAL_SHARE_POLICIES,
        DEFAULT_LEGAL_CONFIG.deudaCopropietarios.porcentajesHistoricos,
      ),
    },
    creditoTitular: {
      politica: pick(
        credito.politica,
        CREDIT_POLICIES,
        DEFAULT_LEGAL_CONFIG.creditoTitular.politica,
      ),
      destinoPorDefecto: pick(
        credito.destinoPorDefecto,
        CREDIT_DESTINATIONS,
        DEFAULT_LEGAL_CONFIG.creditoTitular.destinoPorDefecto,
      ),
    },
    traslados: {
      deuda: pick(traslados.deuda, TRANSFER_DEBT_POLICIES, DEFAULT_LEGAL_CONFIG.traslados.deuda),
      exigirDocumento:
        traslados.exigirDocumento === undefined
          ? DEFAULT_LEGAL_CONFIG.traslados.exigirDocumento
          : traslados.exigirDocumento === true,
    },
    votaciones: {
      unidad: pick(votaciones.unidad, VOTING_UNITS, DEFAULT_LEGAL_CONFIG.votaciones.unidad),
      copropiedad: pick(
        votaciones.copropiedad,
        COOWNERSHIP_RULES,
        DEFAULT_LEGAL_CONFIG.votaciones.copropiedad,
      ),
      mayoriaOrdinaria: pick(
        votaciones.mayoriaOrdinaria,
        MAJORITIES,
        DEFAULT_LEGAL_CONFIG.votaciones.mayoriaOrdinaria,
      ),
    },
    estatutos: {
      referencia: text(estatutos.referencia, 200),
      fechaAprobacion: isIsoDate(estatutos.fechaAprobacion) ? estatutos.fechaAprobacion : "",
    },
  };
}

/** Fusiona un parche parcial con la configuración vigente. */
export function mergeLegalConfig(base, patch) {
  const current = legalConfigFromValue(base);
  const incoming = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  const block = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return legalConfigFromValue({
    ...current,
    ...incoming,
    deudaCopropietarios: {
      ...current.deudaCopropietarios,
      ...block(incoming.deudaCopropietarios),
    },
    creditoTitular: { ...current.creditoTitular, ...block(incoming.creditoTitular) },
    traslados: { ...current.traslados, ...block(incoming.traslados) },
    votaciones: { ...current.votaciones, ...block(incoming.votaciones) },
    estatutos: { ...current.estatutos, ...block(incoming.estatutos) },
  });
}

/** Valida el bloque recibido por la API. Devuelve el mensaje o null. */
export function validateLegalConfig(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    return "La configuración jurídica no es válida.";
  for (const key of [
    "deudaCopropietarios",
    "creditoTitular",
    "traslados",
    "votaciones",
    "estatutos",
  ])
    if (
      value[key] !== undefined &&
      (value[key] === null || typeof value[key] !== "object" || Array.isArray(value[key]))
    )
      return "La configuración jurídica no es válida.";
  const normalized = legalConfigFromValue(value);
  const checks = [
    [value.regimen, LEGAL_REGIMES, "El régimen jurídico seleccionado no es válido."],
    [
      value.deudaCopropietarios?.expresion,
      DEBT_EXPRESSIONS,
      "La forma de expresar la deuda de copropietarios no es válida.",
    ],
    [
      value.deudaCopropietarios?.porcentajesHistoricos,
      HISTORICAL_SHARE_POLICIES,
      "El criterio para porcentajes históricos no es válido.",
    ],
    [
      value.creditoTitular?.politica,
      CREDIT_POLICIES,
      "La política de crédito al borrar un titular no es válida.",
    ],
    [
      value.creditoTitular?.destinoPorDefecto,
      CREDIT_DESTINATIONS,
      "El destino por defecto del crédito no es válido.",
    ],
    [value.traslados?.deuda, TRANSFER_DEBT_POLICIES, "La política de traslado de deuda no es válida."],
    [value.votaciones?.unidad, VOTING_UNITS, "La unidad de voto seleccionada no es válida."],
    [
      value.votaciones?.copropiedad,
      COOWNERSHIP_RULES,
      "La regla de copropiedad para votar no es válida.",
    ],
    [
      value.votaciones?.mayoriaOrdinaria,
      MAJORITIES,
      "La mayoría ordinaria seleccionada no es válida.",
    ],
  ];
  for (const [raw, allowed, message] of checks)
    if (raw !== undefined && !Object.hasOwn(allowed, raw)) return message;
  for (const key of ["mostrarRepartoInterno", "exigirDocumento"])
    if (
      (key === "mostrarRepartoInterno"
        ? value.deudaCopropietarios?.[key]
        : value.traslados?.[key]) !== undefined &&
      typeof (key === "mostrarRepartoInterno"
        ? value.deudaCopropietarios[key]
        : value.traslados[key]) !== "boolean"
    )
      return "La configuración booleana no es válida.";
  if (
    value.estatutos?.referencia !== undefined &&
    (typeof value.estatutos.referencia !== "string" || value.estatutos.referencia.length > 200)
  )
    return "La referencia de los estatutos no puede superar los 200 caracteres.";
  if (
    value.estatutos?.fechaAprobacion !== undefined &&
    value.estatutos.fechaAprobacion !== "" &&
    !isIsoDate(value.estatutos.fechaAprobacion)
  )
    return "La fecha de aprobación de los estatutos no es válida.";
  // La normalización es la fuente de verdad; evita guardar bloques gigantes.
  if (JSON.stringify(normalized).length > 6000)
    return "La configuración jurídica supera el tamaño permitido.";
  return null;
}

/** Devuelve la configuración de una comunidad ya normalizada. */
export function legalConfigOf(community) {
  if (!community) return legalConfigFromValue({});
  if (typeof community.legalConfig === "string") {
    try {
      return legalConfigFromValue(JSON.parse(community.legalConfig || "{}"));
    } catch {
      return legalConfigFromValue({});
    }
  }
  return legalConfigFromValue(community.legalConfig || {});
}

/**
 * Regla de voto que se congela en cada consulta al publicarse. En una
 * asociación el censo son los socios (isMember) y sus derechos estatutarios:
 * no se computan coeficientes ni inmuebles, sino una persona socia, salvo que
 * se haya elegido expresamente una respuesta por cuenta.
 */
export function votingRuleOf(community) {
  const config = legalConfigOf(community);
  const association = config.regimen === "asociacion";
  return {
    unidad: association
      ? config.votaciones.unidad === "cuenta"
        ? "cuenta"
        : "propietario"
      : config.votaciones.unidad,
    copropiedad: association ? "representante" : config.votaciones.copropiedad,
    mayoriaOrdinaria: config.votaciones.mayoriaOrdinaria,
    censo: association ? "socios" : "propietarios",
  };
}

/** Etiqueta legible de una regla de voto. */
export function votingRuleLabel(rule) {
  if (rule?.censo === "socios")
    return rule.unidad === "cuenta"
      ? "Una respuesta por cuenta (censo de socios)"
      : "Un voto por socio (censo de socios y derechos estatutarios)";
  const unidad = VOTING_UNITS[rule?.unidad] || VOTING_UNITS.cuenta;
  const copropiedad =
    rule?.unidad === "coeficiente" || rule?.unidad === "inmueble"
      ? ` · ${COOWNERSHIP_RULES[rule?.copropiedad] || COOWNERSHIP_RULES.representante}`
      : "";
  return `${unidad}${copropiedad}`;
}

