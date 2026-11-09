import fs from "node:fs";

const archivo = "scripts/seed-demo-comunidades.mjs";
let t = fs.readFileSync(archivo, "utf8");

// 1) Comunidad 3: Comunidad Los Pinos, administrada por user-admin (administrator)
const c2Fin = `    notes: "Segunda comunidad demo. Administrada también por comm_admin (multi-asignación).", documents: "[]", adminUserId: "user-comm_admin",
  },
];`;

const c3 = `    notes: "Segunda comunidad demo. Administrada también por comm_admin (multi-asignación).", documents: "[]", adminUserId: "user-comm_admin",
  },
  {
    id: "com-demo-3", name: "Comunidad Los Pinos", nif: "B55566677",
    phone: "933000333", otherPhone: "933000334", address: "Camino de los Pinos, 9",
    city: "Torrelodones", province: "Madrid", postalCode: "28250", email: "los.pinos.demo@comunidad.es",
    iban: "ES3344556677889900112233", president: "Rocío Pinar", administrator: "Admin Central",
    constitutionYear: "1996", reserveFund: "15000", currency: "EUR",
    notes: "Tercera comunidad demo. Administrada por admin (administrator), distinto de comm_admin.", documents: "[]", adminUserId: "user-admin",
  },
];`;

if (!t.includes(c2Fin)) {
  console.error("C2 NO ENCONTRADA");
  process.exit(1);
}
t = t.replace(c2Fin, c3);

// 2) Propietario sin cuenta de com-demo-3
const ownerAnchor = `  },
];

// ---------------------------------------------------------------------------
// 3) INMUEBLES`;

const ownerNuevo = `  },
  {
    id: "own-demo-7", userId: "", communityId: "com-demo-3", communityName: "Comunidad Los Pinos",
    name: "Fernando", surname: "Cabrera Ruiz", documentType: "DNI", dni: "77777777J", isMember: true,
    plot: "Chalet 3", propertyId: "prop-demo-7", propertyIds: ["prop-demo-7"],
    phone: "677777707", otherPhone: "917777707", email: "fernando.cabrera@demo.es",
    phoneVerified: 0, phoneVerifiedAt: "", emailVerified: 1, emailVerifiedAt: stamp,
    address: "Camino de los Pinos, 9, Chalet 3", province: "Madrid", city: "Torrelodones", postalCode: "28250",
    iban: "ES7777890123777777777777", currency: "EUR",
    notes: "Perfil propietario sin cuenta vinculada en la comunidad administrada por admin.",
    documents: createSeedDocsDemo({ dni: "77777777J", nombre: "Fernando Cabrera", plot: "Chalet 3", communityName: "Comunidad Los Pinos" }),
  },
];

// ---------------------------------------------------------------------------
// 3) INMUEBLES`;

if (!t.includes(ownerAnchor)) {
  console.error("OWNER ANCLA NO ENCONTRADA");
  process.exit(1);
}
t = t.replace(ownerAnchor, ownerNuevo);

// 3) Inmueble de com-demo-3
const propAnchor = `        <div id="trash"></div>
  },
];`.replace("        <div id=\"trash\"></div>\n  },\n];", "  },\n];");

const propReal = `    postalCode: "28223", city: "Pozuelo de Alarcón", province: "Madrid",
  },
];`;

const propNuevo = `    postalCode: "28223", city: "Pozuelo de Alarcón", province: "Madrid",
  },
  {
    id: "prop-demo-7", communityId: "com-demo-3", communityName: "Comunidad Los Pinos",
    ownerIds: ["own-demo-7"], tenantIds: ["ten-demo-4"], propertyType: "chalet",
    plot: "Chalet 3", address: "Camino de los Pinos, 9, Chalet 3",
    cadastralRef: "9872024VH7777S0007WX", registryNumber: "7777", floor: "", door: "",
    areaM2: "210", participationCoef: "14.0000", propertyUse: "residencial",
    receiptStatus: "current", notes: "Chalet con jardín, administrado por admin (administrator).",
    postalCode: "28250", city: "Torrelodones", province: "Madrid",
  },
];`;

if (!t.includes(propReal)) {
  console.error("PROP REAL NO ENCONTRADO");
  process.exit(1);
}
t = t.replace(propReal, propNuevo);

// 4) Inquilino de com-demo-3
const tenAnchor = `    notificationPreference: "email", currency: "EUR", userId: "",
  },
];`;

const tenNuevo = `    notificationPreference: "email", currency: "EUR", userId: "",
  },
  {
    id: "ten-demo-4", ownerId: "own-demo-7", propertyId: "prop-demo-7",
    name: "Julia", surname: "Blanco Serrano", documentType: "NIE", documentId: "Y1111111J",
    contractType: "vivienda_habitual", monthlyRent: "1400", deposit: "2800",
    emergencyPhone: "600555666", phone: "611111919", email: "julia.blanco@demo.es",
    contractStart: "2026-06-15", contractEnd: "2027-05-10",
    authorizations: JSON.stringify(["email", "sms"]), authorizationNotes: "Prefiere SMS.",
    phoneVerified: 1, phoneVerifiedAt: "12/10/2026, 09:00", emailVerified: 0, emailVerifiedAt: "",
    notificationPreference: "sms", currency: "EUR", userId: "",
  },
];`;

if (!t.includes(tenAnchor)) {
  console.error("TEN ANCLA NO ENCONTRADA");
  process.exit(1);
}
t = t.replace(tenAnchor, tenNuevo);

fs.writeFileSync(archivo, t);
console.log("OK");
