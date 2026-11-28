import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

const directory = mkdtempSync(path.join(tmpdir(), "penarrubia-api-test-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db, UPLOADS_DIR } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
const { default: router } = await import("../../src/routes/index.js");
let server, base, admin, owner, tenant;

function client() {
  let cookie = "";
  return async (route, method = "GET", body, extra = {}) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const type = response.headers.get("content-type") || "";
    return {
      status: response.status,
      data: type.includes("application/json") ? await response.json() : await response.text(),
      cookie: setCookie,
      headers: response.headers,
    };
  };
}
before(async () => {
  const app = express();
  app.use(express.json({ limit: "60mb" }));
  app.use("/api", router);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  admin = client();
  owner = client();
  tenant = client();
  for (const [request, usuario] of [
    [admin, "super_admin"],
    [owner, "urucp1"],
    [tenant, "uruci1"],
  ]) {
    const login = await request("/auth/signin", "POST", {
      usuario,
      password: usuario,
    });
    assert.equal(login.status, 200, JSON.stringify(login.data));
  }
});
after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  db.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("penarrubia-api-test-"));
  rmSync(directory, { recursive: true, force: true });
});

test("API privada: sin sesión no se pueden leer ni modificar registros", async () => {
  const anonymous = client();
  for (const route of ["/bootstrap", "/owners", "/admin/users"])
    assert.equal((await anonymous(route)).status, 401);
  assert.equal((await anonymous("/owners/own-seed-1", "DELETE")).status, 401);
});
test("login: cookie HttpOnly, contraseña incorrecta y origen ajeno", async () => {
  const request = client();
  assert.equal(
    (
      await request("/auth/signin", "POST", {
        usuario: "super_admin",
        password: "incorrecta",
      })
    ).status,
    401,
  );
  const login = await request("/auth/signin", "POST", {
    usuario: "super_admin",
    password: "super_admin",
  });
  assert.match(login.cookie, /HttpOnly/i);
  assert.match(login.cookie, /SameSite=Strict/i);
  assert.equal(
    (await request("/admin/settings", "PUT", {}, { Origin: "https://example.invalid" })).status,
    403,
  );
});
test("bootstrap: propietario e inquilino solo reciben datos de sus perfiles", async () => {
  const own = await owner("/bootstrap");
  assert.deepEqual(
    own.data.owners.map((o) => o.id),
    ["own-seed-1"],
  );
  assert.deepEqual(
    own.data.users.map((u) => u.id),
    ["user-urucp1"],
  );
  assert.equal((await owner("/owners/own-seed-2")).status, 403);
  assert.equal((await owner("/admin/users")).status, 403);
  const rent = await tenant("/bootstrap");
  assert.deepEqual(
    rent.data.tenants.map((t) => t.id),
    ["tenant-seed-1"],
  );
  assert.ok(rent.data.owners.every((o) => !o.iban && !o.dni));
});
test("bootstrap: las parcelas se limitan a los inmuebles visibles de cada cuenta", async () => {
  db.prepare(
    "INSERT INTO communities(id,name,nif,legalConfig) VALUES('com-parcel-privacy','Parcelas Privadas','G00000003','{\"regimen\":\"lph\"}')",
  ).run();
  const insertParcel = db.prepare(
    "INSERT INTO parcels(id,communityId,cadastralRef,name) VALUES(?,?,?,'Finca de prueba')",
  );
  insertParcel.run("parcel-privacy-mine", "com-parcel-privacy", "06011A012002450000QE");
  insertParcel.run("parcel-privacy-neighbor", "com-parcel-privacy", "06011A012002460000QF");
  insertParcel.run("parcel-privacy-other", "com-seed-2", "06011A012002470000QG");
  const insertProperty = db.prepare(
    `INSERT INTO properties(id,communityId,communityName,plot,propertyType,address,city,ownerIds,ownerPercentages,participationCoef,cadastralRef,parcelId)
     VALUES(?,?,?,?,'vivienda','Calle Privacidad 1','Madrid',?,'{}','1.0000',?,?)`,
  );
  insertProperty.run(
    "prop-privacy-mine",
    "com-parcel-privacy",
    "Parcelas Privadas",
    "Unidad propia",
    JSON.stringify(["own-seed-1"]),
    "06011A012002450000QE",
    "parcel-privacy-mine",
  );
  insertProperty.run(
    "prop-privacy-neighbor",
    "com-parcel-privacy",
    "Parcelas Privadas",
    "Unidad vecina",
    JSON.stringify(["own-seed-2"]),
    "06011A012002460000QF",
    "parcel-privacy-neighbor",
  );
  insertProperty.run(
    "prop-privacy-other",
    "com-seed-2",
    "Edificio Los Olivos",
    "Unidad externa",
    JSON.stringify(["own-seed-3"]),
    "06011A012002470000QG",
    "parcel-privacy-other",
  );
  try {
    const parcelIdsOfVisibleProperties = (boot) =>
      boot.properties.map((property) => property.parcelId).filter(Boolean);
    const adminBoot = (await admin("/bootstrap")).data;
    const ownerBoot = (await owner("/bootstrap")).data;
    const tenantBoot = (await tenant("/bootstrap")).data;
    // La respuesta no puede contener parcelas ajenas a los inmuebles visibles.
    for (const boot of [adminBoot, ownerBoot, tenantBoot])
      assert.deepEqual(
        boot.parcels.map((parcel) => parcel.id).sort(),
        parcelIdsOfVisibleProperties(boot).sort(),
      );
    // El administrador ve todas las fincas del censo.
    assert.ok(adminBoot.parcels.some((parcel) => parcel.id === "parcel-privacy-neighbor"));
    assert.ok(adminBoot.parcels.some((parcel) => parcel.id === "parcel-privacy-other"));
    // El propietario solo abre su unidad: nada de la finca vecina ni de otra comunidad.
    assert.ok(ownerBoot.properties.some((property) => property.id === "prop-privacy-mine"));
    assert.ok(!ownerBoot.properties.some((property) => property.id === "prop-privacy-neighbor"));
    const ownerParcels = ownerBoot.parcels.map((parcel) => parcel.id);
    assert.ok(ownerParcels.includes("parcel-privacy-mine"));
    assert.ok(!ownerParcels.includes("parcel-privacy-neighbor"));
    assert.ok(!ownerParcels.includes("parcel-privacy-other"));
  } finally {
    db.prepare("DELETE FROM properties WHERE id LIKE 'prop-privacy-%'").run();
    db.prepare("DELETE FROM parcels WHERE id LIKE 'parcel-privacy-%'").run();
    db.prepare("DELETE FROM communities WHERE id='com-parcel-privacy'").run();
  }
});
test("copropietarios: el alta conserva titulares y porcentajes coherentes", async () => {
  const originalProperty = (await admin("/properties/prop-seed-1")).data;
  const reserved = await admin("/properties/prop-seed-1", "PUT", {
    ...originalProperty,
    ownerPercentages: { ...originalProperty.ownerPercentages, "own-seed-1": 60 },
  });
  assert.equal(reserved.status, 200, JSON.stringify(reserved.data));
  const result = await admin("/owners", "POST", {
    name: "Copropietario",
    surname: "Prueba",
    dni: "00000000T",
    email: "copropietario@example.test",
    phone: "612345678",
    address: "Calle de prueba 1",
    city: "Madrid",
    propertyIds: ["prop-seed-1"],
    propertyShares: [{ propertyId: "prop-seed-1", percentage: 40, version: reserved.data.version }],
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const property = (await admin("/properties/prop-seed-1")).data;
  assert.ok(property.ownerIds.includes("own-seed-1"));
  assert.ok(property.ownerIds.includes(result.data.id));
  assert.equal(
    Object.values(property.ownerPercentages).reduce((sum, n) => sum + n, 0),
    100,
  );
});
test("socios: la comunidad de censo se guarda aunque no tenga inmueble", async () => {
  const created = await admin("/owners", "POST", {
    name: "Socia",
    surname: "Censo",
    dni: "99999999R",
    phone: "600000000",
    email: "socia.censo@example.test",
    address: "Calle del Censo 1",
    city: "Madrid",
    isMember: true,
    communityId: "com-seed-1",
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.communityId, "com-seed-1");
  assert.equal(created.data.communityName, "Residencial Peñarrubia");
  const updated = await admin(`/owners/${created.data.id}`, "PUT", {
    ...created.data,
    isMember: true,
    communityId: "com-seed-1",
    propertyIds: [],
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.communityId, "com-seed-1");
  assert.equal(updated.data.communityName, "Residencial Peñarrubia");
});
test("socios: la comunidad es obligatoria para asociados", async () => {
  const created = await admin("/owners", "POST", {
    name: "Socia",
    surname: "Sin Comunidad",
    dni: "00000000T",
    phone: "600000001",
    email: "socia.sin.comunidad@example.test",
    address: "Calle del Censo 2",
    city: "Madrid",
    isMember: true,
  });
  assert.equal(created.status, 400, JSON.stringify(created.data));
  assert.match(created.data.error, /comunidad es obligatoria/i);
});
test("inquilinos: varios contratos no se sobrescriben y se conserva userId", async () => {
  const payload = {
    ownerId: "own-seed-1",
    propertyId: "prop-seed-1",
    name: "Inquilino",
    surname: "Prueba",
    phone: "600000000",
    email: "tenant@example.test",
    documentId: "11111111H",
    contractStart: "2020-01-01",
    contractEnd: "",
  };
  for (const id of ["api-tenant-1", "api-tenant-2"])
    assert.equal((await admin("/tenants", "POST", { ...payload, id })).status, 201);
  let property = (await admin("/properties/prop-seed-1")).data;
  assert.ok(property.tenantIds.includes("api-tenant-1"));
  assert.ok(property.tenantIds.includes("api-tenant-2"));
  await admin("/tenants/api-tenant-1", "PUT", {
    ...payload,
    userId: "user-urusp1",
    version: (await admin("/tenants/api-tenant-1")).data.version,
  });
  assert.equal(
    (
      await admin("/tenants/api-tenant-1", "PUT", {
        ...payload,
        version: (await admin("/tenants/api-tenant-1")).data.version,
      })
    ).data.userId,
    "user-urusp1",
  );
  assert.equal((await admin("/tenants/api-tenant-2", "DELETE")).status, 200);
  property = (await admin("/properties/prop-seed-1")).data;
  assert.ok(!property.tenantIds.includes("api-tenant-2"));
  assert.ok(property.tenantIds.includes("api-tenant-1"));
});
test("inmuebles: coeficiente obligatorio y referencia catastral única", async () => {
  const property = (await admin("/properties/prop-seed-2")).data;
  const withoutCoef = await admin("/properties/prop-seed-2", "PUT", {
    ...property,
    participationCoef: "",
  });
  assert.equal(withoutCoef.status, 400);
  assert.match(withoutCoef.data.error, /coeficiente de participación/i);

  const first = (await admin("/properties/prop-seed-1")).data;
  const duplicate = await admin("/properties/prop-seed-2", "PUT", {
    ...property,
    cadastralRef: ` ${first.cadastralRef.toLowerCase()} `,
  });
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.data.error, /referencia catastral/i);
});
test("inmuebles: en una asociación el coeficiente de participación es opcional", async () => {
  db.prepare(
    "INSERT INTO communities(id,name,nif,legalConfig) VALUES('com-assoc-coef','Asociación Coef','G00000001','{\"regimen\":\"asociacion\"}')",
  ).run();
  db.prepare(
    "INSERT INTO properties(id,communityId,communityName,plot,propertyType,address,city,ownerIds,ownerPercentages,participationCoef) VALUES('prop-assoc-coef','com-assoc-coef','Asociación Coef','Parcela 1','vivienda','Calle Única 1','Madrid','[]','{}','')",
  ).run();
  try {
    const property = (await admin("/properties/prop-assoc-coef")).data;
    const updated = await admin("/properties/prop-assoc-coef", "PUT", {
      ...property,
      participationCoef: "",
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.participationCoef, "");
  } finally {
    db.prepare("DELETE FROM properties WHERE communityId='com-assoc-coef'").run();
    db.prepare("DELETE FROM communities WHERE id='com-assoc-coef'").run();
  }
});
test("inmuebles: estado de recibos y cuota se calculan desde los recibos", async () => {
  db.prepare(
    "INSERT INTO properties(id,communityId,communityName,plot,propertyType,address,city,ownerIds,ownerPercentages,participationCoef) VALUES('prop-computed-status','com-seed-2','Edificio Los Olivos','Piso calculado','vivienda','Calle Calculada 1','Madrid','[]','{}','1.0000')",
  ).run();
  try {
    const created = (await admin("/properties/prop-computed-status")).data;
    assert.equal(created.receiptStatus, "none");
    assert.equal(created.communityFee, "");
    // El cliente no puede marcar el estado ni inventar la cuota desde la ficha.
    const updated = await admin("/properties/prop-computed-status", "PUT", {
      ...created,
      receiptStatus: "pending",
      communityFee: "99.99",
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.receiptStatus, "none");
    assert.equal(updated.data.communityFee, "");
  } finally {
    db.prepare("DELETE FROM properties WHERE id='prop-computed-status'").run();
  }
});
test("inmuebles: el guardado ajusta el residuo de redondeo de los coeficientes", async () => {
  db.prepare(
    "INSERT INTO communities(id,name,nif) VALUES('com-coef-adjust','Comunidad Ajuste','H00000001')",
  ).run();
  db.prepare(
    "INSERT INTO properties(id,communityId,communityName,plot,propertyType,address,city,ownerIds,ownerPercentages,participationCoef) VALUES('prop-coef-a','com-coef-adjust','Comunidad Ajuste','A','vivienda','Calle A 1','Madrid','[]','{}','50.0000'),('prop-coef-b','com-coef-adjust','Comunidad Ajuste','B','vivienda','Calle B 1','Madrid','[]','{}','49.9999')",
  ).run();
  db.prepare(
    "INSERT INTO communities(id,name,nif) VALUES('com-coef-gap','Comunidad Brecha','H00000002')",
  ).run();
  db.prepare(
    "INSERT INTO properties(id,communityId,communityName,plot,propertyType,address,city,ownerIds,ownerPercentages,participationCoef) VALUES('prop-gap-a','com-coef-gap','Comunidad Brecha','A','vivienda','Calle A 1','Madrid','[]','{}','50.0000'),('prop-gap-b','com-coef-gap','Comunidad Brecha','B','vivienda','Calle B 1','Madrid','[]','{}','49.0000')",
  ).run();
  try {
    // 50,0000 + 49,9999: el residuo de 0,0001 pasa al coeficiente mayor.
    const property = (await admin("/properties/prop-coef-a")).data;
    assert.equal((await admin("/properties/prop-coef-a", "PUT", { ...property })).status, 200);
    assert.deepEqual(
      db
        .prepare(
          "SELECT participationCoef FROM properties WHERE communityId='com-coef-adjust' ORDER BY id",
        )
        .all()
        .map((row) => row.participationCoef),
      ["50.0001", "49.9999"],
    );
    // Una diferencia de un punto no es redondeo: el censo se deja intacto.
    const gap = (await admin("/properties/prop-gap-a")).data;
    assert.equal((await admin("/properties/prop-gap-a", "PUT", { ...gap })).status, 200);
    assert.equal(
      db.prepare("SELECT participationCoef FROM properties WHERE id='prop-gap-a'").get()
        .participationCoef,
      "50.0000",
    );
    // El exceso de decimales se redondea a cuatro, no se rechaza.
    const gapB = (await admin("/properties/prop-gap-b")).data;
    const rounded = await admin("/properties/prop-gap-b", "PUT", {
      ...gapB,
      participationCoef: "49.12346",
    });
    assert.equal(rounded.status, 200, JSON.stringify(rounded.data));
    assert.equal(rounded.data.participationCoef, "49.1235");
  } finally {
    for (const communityId of ["com-coef-adjust", "com-coef-gap"])
      db.prepare("DELETE FROM properties WHERE communityId = ?").run(communityId);
    db.prepare("DELETE FROM communities WHERE id IN ('com-coef-adjust','com-coef-gap')").run();
  }
});
test("inmuebles: titularidad N:M y contratos dentro de su comunidad", async () => {
  const property = (await admin("/properties/prop-seed-3")).data;
  const crossOwner = await admin("/properties/prop-seed-3", "PUT", {
    ...property,
    ownerIds: ["own-seed-3"],
    ownerPercentages: { "own-seed-3": 100 },
    tenantIds: [],
    participationCoef: "1.0000",
    cadastralRef: "",
  });
  assert.equal(crossOwner.status, 200);
  assert.deepEqual(crossOwner.data.ownerIds, ["own-seed-3"]);
  assert.ok(
    JSON.parse(
      db.prepare("SELECT propertyIds FROM owners WHERE id=?").get("own-seed-3").propertyIds,
    ).includes(property.id),
  );
  db.prepare(
    "INSERT INTO tenants (id, ownerId, propertyId, name, surname) VALUES (?, ?, ?, ?, ?)",
  ).run("tenant-cross-community", "own-seed-1", "prop-seed-4", "Inquilino", "Otra comunidad");
  try {
    const target = (await admin("/properties/prop-seed-1")).data;
    const crossTenant = await admin("/properties/prop-seed-1", "PUT", {
      ...target,
      tenantIds: [...(target.tenantIds || []), "tenant-cross-community"],
    });
    assert.equal(crossTenant.status, 400);
    assert.match(crossTenant.data.error, /inquilinos.*comunidad del inmueble/i);
  } finally {
    db.prepare("DELETE FROM tenants WHERE id = ?").run("tenant-cross-community");
  }
});
test("administración: contraseñas explícitas y respuestas sin secretos", async () => {
  assert.equal(
    (
      await admin("/admin/users", "POST", {
        usuario: "missing-password",
        rol: "user",
      })
    ).status,
    400,
  );
  const created = await admin("/admin/users", "POST", {
    usuario: "new-user",
    email: "new-user@example.test",
    rol: "user",
    password: "temporary-password",
  });
  assert.equal(created.status, 201);
  assert.ok(!("passwordHash" in created.data));
  const changed = await admin(`/admin/users/${created.data.id}`, "PUT", {
    nombre: "Nombre editado",
  });
  assert.ok(!("resetToken" in changed.data));
  assert.ok(!("passwordHash" in changed.data));
  const login = client();
  assert.equal(
    (
      await login("/auth/signin", "POST", {
        usuario: "new-user",
        password: "temporary-password",
      })
    ).status,
    200,
  );
});
test("protección del último superadministrador y del último administrador general", async () => {
  const users = (await admin("/admin/users")).data;
  for (const role of ["super_admin", "administrator"]) {
    const target = users.find((u) => u.rol === role);
    assert.ok(target, `falta la cuenta ${role}`);
    assert.equal((await admin(`/admin/users/${target.id}`, "DELETE")).status, 409);
    assert.equal((await admin(`/admin/users/${target.id}`, "PUT", { activo: false })).status, 409);
    assert.equal((await admin(`/admin/users/${target.id}`, "PUT", { rol: "user" })).status, 409);
  }
});
test("no se puede borrar un usuario con perfil de propietario o inquilino", async () => {
  const created = await admin("/admin/users", "POST", {
    usuario: "perfil-vinculado",
    rol: "user",
    password: "temporary-password",
  });
  assert.equal(created.status, 201);
  const userId = created.data.id;
  const owner = db.prepare("SELECT id FROM owners WHERE userId = '' LIMIT 1").get();
  const property = db.prepare("SELECT id FROM properties LIMIT 1").get();
  assert.ok(owner);
  assert.ok(property);
  db.prepare(
    "INSERT INTO tenants (id, ownerId, propertyId, name, surname, userId) VALUES (?, ?, ?, ?, ?, '')",
  ).run("ten-perfil-vinculado", owner.id, property.id, "Inquilino", "Prueba");
  assert.equal(
    (await admin(`/admin/users/${userId}/link-owner`, "PUT", { ownerId: owner.id })).status,
    200,
  );
  const ownerBlocked = await admin(`/admin/users/${userId}`, "DELETE");
  assert.equal(ownerBlocked.status, 409);
  assert.match(ownerBlocked.data.error, /propietario/);
  await admin(`/admin/users/${userId}/link-owner`, "PUT", { ownerId: "" });
  assert.equal(
    (await admin(`/admin/users/${userId}/link-tenant`, "PUT", { tenantId: "ten-perfil-vinculado" }))
      .status,
    200,
  );
  const tenantBlocked = await admin(`/admin/users/${userId}`, "DELETE");
  assert.equal(tenantBlocked.status, 409);
  assert.match(tenantBlocked.data.error, /inquilino/);
  await admin(`/admin/users/${userId}/link-tenant`, "PUT", { tenantId: "" });
  assert.equal((await admin(`/admin/users/${userId}`, "DELETE")).status, 200);
  db.prepare("DELETE FROM tenants WHERE id = 'ten-perfil-vinculado'").run();
});
test("permisos granulares: community:edit permite editar pero no crear", async () => {
  const role = await admin("/admin/roles", "POST", {
    nombre: "Editor de comunidades",
    permisos: ["community:read", "community:edit"],
  });
  assert.equal(role.status, 201);
  const user = await admin("/admin/users", "POST", {
    usuario: "editor-comunidad",
    rol: role.data.id,
    password: "temporary-password",
  });
  assert.equal(user.status, 201);
  const request = client();
  assert.equal(
    (
      await request("/auth/signin", "POST", {
        usuario: "editor-comunidad",
        password: "temporary-password",
      })
    ).status,
    200,
  );
  const community = (await request("/communities")).data[0];
  assert.ok(community);
  assert.equal(
    (
      await request(`/communities/${community.id}`, "PUT", {
        ...community,
        name: `${community.name} (editada)`,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/communities", "POST", {
        name: "No permitida",
        nif: "H12345674",
      })
    ).status,
    403,
  );
});
test("permisos granulares: community:brand permite personalizar el estilo sin editar datos", async () => {
  const role = await admin("/admin/roles", "POST", {
    nombre: "Personalizador de marca",
    permisos: ["community:read", "community:brand"],
  });
  assert.equal(role.status, 201, JSON.stringify(role.data));
  const user = await admin("/admin/users", "POST", {
    usuario: "brand-designer",
    rol: role.data.id,
    password: "temporary-password",
  });
  assert.equal(user.status, 201, JSON.stringify(user.data));
  const request = client();
  assert.equal(
    (
      await request("/auth/signin", "POST", {
        usuario: "brand-designer",
        password: "temporary-password",
      })
    ).status,
    200,
  );
  const community = (await request("/communities")).data[0];
  assert.ok(community);
  const originalAddress = community.address;
  const edited = await request(`/communities/${community.id}`, "PUT", {
    ...community,
    name: "Comunidad con estilo",
    address: "CALLE FALSA 123",
    marca: {
      colorPrimario: "#0b6b3a",
      colorAcento: "#f2a900",
      tipografia: "georgia",
      tamanoBase: 16,
      radioBordes: 10,
      densidad: "amplia",
    },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assert.equal(edited.data.name, "Comunidad con estilo");
  assert.equal(edited.data.address, originalAddress, "no puede cambiar campos que no son de marca");
  assert.equal(edited.data.marca.colorPrimario, "#0b6b3a");
  assert.equal(edited.data.marca.tipografia, "georgia");
  // No puede crear ni eliminar comunidades.
  assert.equal(
    (await request("/communities", "POST", { name: "Nueva", nif: "H12345699" })).status,
    403,
  );
  assert.equal((await request(`/communities/${community.id}`, "DELETE")).status, 403);
});

test("permisos granulares: admin:branding guarda solo el estilo sin tocar el resto de la configuración", async () => {
  const original = (await admin("/admin/settings")).data;
  const role = await admin("/admin/roles", "POST", {
    nombre: "Diseñador de plataforma",
    permisos: ["admin:branding"],
  });
  assert.equal(role.status, 201, JSON.stringify(role.data));
  const user = await admin("/admin/users", "POST", {
    usuario: "platform-designer",
    rol: role.data.id,
    password: "temporary-password",
  });
  assert.equal(user.status, 201, JSON.stringify(user.data));
  const request = client();
  assert.equal(
    (
      await request("/auth/signin", "POST", {
        usuario: "platform-designer",
        password: "temporary-password",
      })
    ).status,
    200,
  );
  try {
    const saved = await request("/admin/settings", "PUT", {
      nombreAsociacion: "NOMBRE INyectado",
      marca: { nombre: "Asociación con estilo", colorPrimario: "#0b6b3a" },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.marca.nombre, "Asociación con estilo");
    assert.equal(saved.data.marca.colorPrimario, "#0b6b3a");
    // El resto de la configuración no cambia: solo se guardó la marca.
    assert.equal(saved.data.nombreAsociacion, original.nombreAsociacion);
    // No accede a secciones ajenas al estilo.
    assert.equal((await request("/admin/users")).status, 403);
    assert.equal((await request("/admin/roles")).status, 403);
    assert.equal((await request("/admin/providers")).status, 403);
  } finally {
    // Restaurar la marca global para no afectar a otros tests.
    await admin("/admin/settings", "PUT", { marca: original.marca });
  }
});

test("notificaciones: eliminar avisos y notificaciones con permiso", async () => {
  // Aviso de propietario: lo elimina su destinatario (rol user, con permiso).
  const created = await admin("/notifications/owner-notifications", "POST", {
    ownerId: "own-seed-1",
    title: "Aviso borrable",
    message: "Para eliminar",
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const ownerClient = client();
  assert.equal(
    (await ownerClient("/auth/signin", "POST", { usuario: "urucp1", password: "urucp1" })).status,
    200,
  );
  assert.ok(
    (await ownerClient("/notifications/owner-notifications")).data.some(
      (n) => n.id === created.data.id,
    ),
  );
  assert.equal(
    (await ownerClient(`/notifications/owner-notifications/${created.data.id}`, "DELETE")).status,
    200,
  );
  assert.ok(
    !(await ownerClient("/notifications/owner-notifications")).data.some(
      (n) => n.id === created.data.id,
    ),
  );

  // Notificación del buzón del administrador: la elimina super_admin.
  const email = await admin("/notifications/admin-emails", "POST", {
    ownerId: "own-seed-1",
    ownerName: "Urucp1",
    subject: "Notificación borrable",
  });
  assert.equal(email.status, 201, JSON.stringify(email.data));
  assert.equal((await admin(`/notifications/admin-emails/${email.data.id}`, "DELETE")).status, 200);

  // Sin permiso de borrado: 403; tras concederlo, 200.
  const role = await admin("/admin/roles", "POST", {
    nombre: "Aviso solo lectura",
    permisos: ["owner_notification:read"],
  });
  assert.equal(role.status, 201, JSON.stringify(role.data));
  const user = await admin("/admin/users", "POST", {
    usuario: "aviso-readonly",
    rol: role.data.id,
    password: "temporary-password",
  });
  assert.equal(user.status, 201, JSON.stringify(user.data));
  const readonly = client();
  assert.equal(
    (
      await readonly("/auth/signin", "POST", {
        usuario: "aviso-readonly",
        password: "temporary-password",
      })
    ).status,
    200,
  );
  const created2 = await admin("/notifications/owner-notifications", "POST", {
    ownerId: "own-seed-1",
    title: "Aviso con permiso",
    message: "x",
  });
  assert.equal(
    (await readonly(`/notifications/owner-notifications/${created2.data.id}`, "DELETE")).status,
    403,
  );
  assert.equal(
    (
      await admin(`/admin/roles/${role.data.id}`, "PUT", {
        permisos: ["owner_notification:read", "owner_notification:delete"],
      })
    ).status,
    200,
  );
  assert.equal(
    (await readonly(`/notifications/owner-notifications/${created2.data.id}`, "DELETE")).status,
    200,
  );
});

test("cuotas: el vecino consulta solo sus recibos y el inquilino sigue sin acceso", async () => {
  const mine = await owner("/fees/mine");
  assert.equal(mine.status, 200, JSON.stringify(mine.data));
  assert.equal(mine.data.canManage, false);
  const ownIds = db
    .prepare("SELECT id FROM owners WHERE userId='user-urucp1'")
    .all()
    .map((row) => row.id);
  for (const receipt of mine.data.receipts) {
    const snapshot = JSON.parse(
      db.prepare("SELECT snapshot FROM fee_receipts WHERE id=?").get(receipt.id).snapshot,
    );
    assert.ok(
      snapshot.owners.some((o) => ownIds.includes(o.id)),
      "el recibo debe pertenecer a un perfil del propio vecino",
    );
  }
  // El inquilino no recibe cuotas por ser inquilino.
  assert.equal((await tenant("/fees/mine")).status, 403);
  // Y el vecino no puede gestionar la comunidad.
  const communityId = (await owner("/bootstrap")).data.communities[0].id;
  assert.equal((await owner(`/fees/communities/${communityId}/preview`, "POST", {})).status, 403);
});

test("avisos y documentos: el propietario no puede borrar lo que solo puede subir", async () => {
  // Acuse en su propio buzón al enviar documentación: se admite, pero el
  // servidor fuerza el tipo informativo porque no tiene document:approve.
  const self = await owner("/notifications/owner-notifications", "POST", {
    ownerId: "own-seed-1",
    title: "Documentación enviada para aprobación",
    type: "warning",
    message: "Acuse del envío",
  });
  assert.equal(self.status, 201, JSON.stringify(self.data));
  assert.equal(self.data.type, "info");
  assert.ok(
    (await owner("/notifications/owner-notifications")).data.some((n) => n.id === self.data.id),
  );
  // No puede escribir en el buzón de otro propietario.
  const ajeno = await owner("/notifications/owner-notifications", "POST", {
    ownerId: "own-seed-2",
    title: "Aviso ajeno",
    message: "No debería crearse",
  });
  assert.equal(ajeno.status, 403);

  // En su expediente puede subir y renombrar, pero no eliminar.
  const form = new FormData();
  form.append("entityType", "owner");
  form.append("entityId", "own-seed-1");
  form.append("category", "document");
  form.append("files", new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }), "recibo.pdf");
  const uploaded = await owner("/documents", "POST", form);
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const id = uploaded.data[0].id;
  assert.equal((await owner(`/documents/${id}`, "PATCH", { name: "recibo-2.pdf" })).status, 200);
  assert.equal((await owner(`/documents/${id}`, "DELETE")).status, 403);
  assert.equal((await admin(`/documents/${id}`, "DELETE")).status, 200);
});

test("roles personalizados: permisos efectivos, sin borrar roles asignados por ID", async () => {
  const role = await admin("/admin/roles", "POST", {
    nombre: "Lectura personalizada",
    permisos: ["community:read"],
  });
  const user = await admin("/admin/users", "POST", {
    usuario: "role-user",
    rol: role.data.id,
    password: "temporary-password",
  });
  assert.equal(user.data.rol, "Lectura personalizada");
  const request = client();
  await request("/auth/signin", "POST", {
    usuario: "role-user",
    password: "temporary-password",
  });
  assert.equal((await request("/communities")).data.length, 7);
  assert.equal(
    (
      await request("/communities", "POST", {
        name: "No permitido",
        nif: "H12345674",
      })
    ).status,
    403,
  );
  assert.equal((await admin(`/admin/roles/${role.data.id}`, "DELETE")).status, 409);
  await admin(`/admin/roles/${role.data.id}`, "PUT", {
    nombre: "Renombrado",
    permisos: ["community:read", "community:create"],
  });
  assert.equal(
    (
      await request("/communities", "POST", {
        name: "Permitido",
        nif: "H12345674",
        address: "Calle de prueba 1",
        city: "Madrid",
      })
    ).status,
    201,
  );
});
test("propietario: no puede cambiar perfiles, titularidad ni aprobar sus documentos", async () => {
  const before = (await owner("/owners/own-seed-1")).data;
  const changed = await owner("/owners/own-seed-1", "PUT", {
    ...before,
    userId: "user-admin",
    isMember: false,
    votingRights: "suspended",
    legalRepresentative: "Representante no autorizado",
    notificationPreference: "postal",
    propertyIds: ["prop-seed-2"],
    documents: {
      ...before.documents,
      dni: { ...before.documents.dni, adminApproval: { status: "approved" } },
    },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.userId, "user-urucp1");
  assert.equal(changed.data.isMember, before.isMember);
  assert.equal(changed.data.votingRights, before.votingRights);
  assert.equal(changed.data.legalRepresentative, before.legalRepresentative);
  assert.equal(changed.data.notificationPreference, before.notificationPreference);
  assert.notEqual(changed.data.documents.dni.adminApproval?.status, "approved");
  assert.equal((await owner("/owners/own-seed-1")).data.propertyId, before.propertyId);
});
test("propietario: la administración persiste los datos LPH en la ficha", async () => {
  const before = (await admin("/owners/own-seed-2")).data;
  try {
    const changed = await admin("/owners/own-seed-2", "PUT", {
      ...before,
      votingRights: "suspended",
      legalRepresentative: "Apoderado de Prueba · 12345678Z",
      notificationPreference: "email,postal,phone",
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.data));
    assert.equal(changed.data.votingRights, "suspended");
    assert.equal(changed.data.legalRepresentative, "Apoderado de Prueba · 12345678Z");
    assert.equal(changed.data.notificationPreference, "email,postal,phone");
    const saved = (await admin("/owners/own-seed-2")).data;
    assert.equal(saved.votingRights, "suspended");
    assert.equal(saved.legalRepresentative, "Apoderado de Prueba · 12345678Z");
    assert.equal(saved.notificationPreference, "email,postal,phone");
  } finally {
    await admin("/owners/own-seed-2", "PUT", {
      ...before,
      votingRights: before.votingRights,
      legalRepresentative: before.legalRepresentative,
      notificationPreference: before.notificationPreference,
    });
  }
});
test("buzones: marcar todas sin ownerId se rechaza (400)", async () => {
  const sinOwner = await owner("/notifications/owner-notifications", "PATCH", {
    read: true,
  });
  assert.ok(
    sinOwner.status === 400 || sinOwner.status === 403,
    "sin ownerId debe rechazarse (400/403)",
  );
  const conOwner = await owner("/notifications/owner-notifications", "PATCH", {
    ownerId: "own-seed-1",
    read: true,
  });
  assert.equal(conOwner.status, 200);
});

test("buzones: avisos persisten y solo el destinatario los puede marcar leídos", async () => {
  const n = await admin("/notifications/owner-notifications", "POST", {
    ownerId: "own-seed-1",
    title: "Aviso",
    message: "Prueba persistente",
  });
  assert.equal(n.status, 201);
  assert.ok(
    (await owner("/notifications/owner-notifications")).data.some((row) => row.id === n.data.id),
  );
  assert.equal(
    (
      await tenant(`/notifications/owner-notifications/${n.data.id}`, "PATCH", {
        read: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await owner(`/notifications/owner-notifications/${n.data.id}`, "PATCH", {
        read: true,
      })
    ).data.read,
    true,
  );
  assert.equal((await admin("/notifications/admin-emails")).status, 200);
});
test("subidas: errores no dejan archivos, entidades inexistentes y contenido falso se rechazan", async () => {
  const before = readdirSync(UPLOADS_DIR).sort();
  for (const [entityType, entityId, content] of [
    ["invalid", "x", "%PDF-1.4"],
    ["property", "missing", "%PDF-1.4"],
    ["property", "prop-seed-1", "fake"],
  ]) {
    const form = new FormData();
    form.append("entityType", entityType);
    form.append("entityId", entityId);
    form.append("files", new Blob([content], { type: "application/pdf" }), "file.pdf");
    assert.equal((await admin("/documents", "POST", form)).status, 400);
    assert.deepEqual(readdirSync(UPLOADS_DIR).sort(), before);
  }
  const form = new FormData();
  form.append("entityType", "property");
  form.append("entityId", "prop-seed-1");
  form.append("files", new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }), "valid.pdf");
  const uploaded = await admin("/documents", "POST", form);
  assert.equal(uploaded.status, 201);
  assert.equal((await admin(`/documents/${uploaded.data[0].id}`, "DELETE")).status, 200);
  assert.deepEqual(readdirSync(UPLOADS_DIR).sort(), before);
});
test("validaciones de servidor rechazan NIF y contacto inválidos", async () => {
  assert.equal(
    (
      await admin("/communities", "POST", {
        name: "Inválida",
        nif: "NO-VALIDO",
        address: "Calle de prueba 1",
        city: "Madrid",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await admin("/communities", "POST", {
        name: "Inválida",
        nif: "H99999997",
        email: "no-email",
        address: "Calle de prueba 1",
        city: "Madrid",
      })
    ).status,
    400,
  );
});
test("R01/R02: el servidor rechaza campos vacíos o solo espacios", async () => {
  // Comunidad con dirección vacía → 400
  const sinDir = await admin("/communities", "POST", {
    name: "Comunidad sin dirección",
    nif: "H12345674",
    address: "  ",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28001",
  });
  assert.equal(sinDir.status, 400);
  assert.match(sinDir.data.error, /dirección/);

  // Propietario con teléfono vacío → 400
  const sinTel = await admin("/owners", "POST", {
    name: "Juan",
    surname: "Sin Teléfono",
    dni: "12345678Z",
    email: "juan.sintel@example.test",
    phone: "",
    address: "Calle 1",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28001",
  });
  assert.equal(sinTel.status, 400);
  assert.match(sinTel.data.error, /teléfono/);

  // Propietario con apellido solo espacios → 400
  const soloEspacios = await admin("/owners", "POST", {
    name: "María",
    surname: "   ",
    dni: "47895231P",
    email: "maria.espacios@example.test",
    phone: "612333444",
    address: "Calle 2",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28002",
  });
  assert.equal(soloEspacios.status, 400);
  assert.match(soloEspacios.data.error, /apellidos/);

  // PUT de community existente con teléfono vacío → 400
  const original = (await admin("/communities/com-seed-1")).data;
  const putVacio = await admin("/communities/com-seed-1", "PUT", {
    ...original,
    phone: "",
    address: "  ",
  });
  assert.equal(putVacio.status, 400);
  assert.match(putVacio.data.error, /teléfono|dirección/);
});

test("issue 191: el NIF de comunidad admite DNI, NIE y CIF con cualquier letra", async () => {
  // CIF con letra distinta de H: B12345674 (empresas), G12345674 (asociación)…
  const c = await admin("/communities", "POST", {
    name: "Comunidad CIF B",
    nif: "B12345674",
    address: "Calle 1",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28001",
  });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  assert.equal(c.data.nif, "B12345674");
  await admin("/communities/" + c.data.id, "DELETE");

  // DNI en el campo NIF
  const d = await admin("/communities", "POST", {
    name: "Comunidad DNI",
    nif: "47895231P",
    address: "Calle 2",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28001",
  });
  assert.equal(d.status, 201, JSON.stringify(d.data));
  await admin("/communities/" + d.data.id, "DELETE");

  // NIE en el campo NIF
  const n = await admin("/communities", "POST", {
    name: "Comunidad NIE",
    nif: "Y6943305X",
    address: "Calle 3",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28001",
  });
  assert.equal(n.status, 201, JSON.stringify(n.data));
  await admin("/communities/" + n.data.id, "DELETE");

  // Un identificador inválido se sigue rechazando
  const malo = await admin("/communities", "POST", {
    name: "Comunidad inválida",
    nif: "H99999999",
    address: "Calle 4",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28001",
  });
  assert.equal(malo.status, 400);
  assert.match(malo.data.error, /identificador español/i);
});

test("comunidades: el logo se valida, persiste y llega al bootstrap", async () => {
  const logo = `data:image/png;base64,${Buffer.from("logo-comunidad").toString("base64")}`;
  const original = (await admin("/communities/com-seed-1")).data;
  for (const [payload, pattern] of [
    [{ logoDataUrl: "https://example.test/logo.png" }, /logo de la comunidad/i],
    [{ logoDataUrl: "data:text/plain;base64,SG9sYQ==" }, /logo de la comunidad/i],
    [{ logoDataUrl: 42 }, /logo de la comunidad/i],
  ]) {
    const response = await admin("/communities/com-seed-1", "PUT", { ...original, ...payload });
    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.match(response.data.error, pattern);
  }
  const saved = await admin("/communities/com-seed-1", "PUT", { ...original, logoDataUrl: logo });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.logoDataUrl, logo);
  const bootstrap = await admin("/bootstrap");
  assert.equal(
    bootstrap.data.communities.find((community) => community.id === "com-seed-1").logoDataUrl,
    logo,
  );
  const cleared = await admin("/communities/com-seed-1", "PUT", {
    ...saved.data,
    logoDataUrl: "",
  });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.data));
  assert.equal(cleared.data.logoDataUrl, "");

  const created = await admin("/communities", "POST", {
    name: "Comunidad con logo",
    nif: "H10000008",
    address: "Calle de prueba 1",
    city: "Madrid",
    logoDataUrl: logo,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.logoDataUrl, logo);
  await admin(`/communities/${created.data.id}`, "DELETE");
});

test("comunidades: el NIF se normaliza aunque venga con espacios, guiones o minúsculas", async () => {
  const created = await admin("/communities", "POST", {
    name: "Comunidad normalizada",
    nif: " h-33333337 ",
    address: "Calle de prueba 1",
    city: "Madrid",
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.nif, "H33333337");
  assert.equal(
    (
      await admin("/communities", "POST", {
        name: "Duplicada",
        nif: "H 33333337",
        address: "Calle de prueba 1",
        city: "Madrid",
      })
    ).status,
    409,
  );
  assert.equal((await admin(`/communities/${created.data.id}`, "DELETE")).status, 200);
  // Un dígito de control incorrecto se sigue rechazando.
  assert.equal(
    (
      await admin("/communities", "POST", {
        name: "Control incorrecto",
        nif: "H33333331",
        address: "Calle de prueba 1",
        city: "Madrid",
      })
    ).status,
    400,
  );
});
test("comunidades: el régimen jurídico se configura, se valida y sobrevive a ediciones parciales", async () => {
  const original = (await admin("/communities/com-seed-1")).data;
  try {
    const saved = await admin("/communities/com-seed-1", "PUT", {
      ...original,
      legalConfig: {
        regimen: "asociacion",
        deudaCopropietarios: {
          expresion: "cuota",
          mostrarRepartoInterno: false,
          porcentajesHistoricos: "ultimo_conocido",
        },
        creditoTitular: { politica: "advertir", destinoPorDefecto: "compensacion" },
        traslados: { deuda: "trasladar", exigirDocumento: false },
        votaciones: {
          unidad: "propietario",
          copropiedad: "todos",
          mayoriaOrdinaria: "tres_quintos",
        },
        estatutos: { referencia: "Estatutos 2018, art. 12", fechaAprobacion: "2018-06-15" },
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.legalConfig.regimen, "asociacion");
    assert.equal(saved.data.legalConfig.deudaCopropietarios.expresion, "cuota");
    assert.equal(saved.data.legalConfig.creditoTitular.politica, "advertir");
    assert.equal(saved.data.legalConfig.traslados.exigirDocumento, false);
    assert.equal(saved.data.legalConfig.votaciones.unidad, "propietario");
    assert.equal(saved.data.legalConfig.estatutos.fechaAprobacion, "2018-06-15");

    // Un parche parcial no borra el resto de la configuración.
    const partial = await admin("/communities/com-seed-1", "PUT", {
      ...saved.data,
      legalConfig: { regimen: "lph" },
    });
    assert.equal(partial.status, 200, JSON.stringify(partial.data));
    assert.equal(partial.data.legalConfig.regimen, "lph");
    assert.equal(partial.data.legalConfig.creditoTitular.politica, "advertir");
    assert.equal(partial.data.legalConfig.votaciones.unidad, "propietario");

    for (const legalConfig of [
      { regimen: "otro" },
      { votaciones: { unidad: "acciones" } },
      { creditoTitular: { politica: "ignorar" } },
      { estatutos: { fechaAprobacion: "15/06/2018" } },
    ]) {
      const invalid = await admin("/communities/com-seed-1", "PUT", {
        ...partial.data,
        legalConfig,
      });
      assert.equal(invalid.status, 400, JSON.stringify(legalConfig));
    }
  } finally {
    const latest = (await admin("/communities/com-seed-1")).data;
    await admin("/communities/com-seed-1", "PUT", {
      ...latest,
      legalConfig: original.legalConfig,
    });
  }
});

test("comunidades: el servidor rechaza importes y años inválidos y conserva el cero", async () => {
  const original = (await admin("/communities/com-seed-1")).data;
  for (const patch of [
    { reserveFund: "letras" },
    { reserveFund: "1e3" },
    { reserveFund: "-5" },
    { reserveFund: "20.123" },
    { constitutionYear: "texto" },
    { constitutionYear: String(new Date().getFullYear() + 1) },
  ]) {
    assert.equal(
      (await admin("/communities/com-seed-1", "PUT", { ...original, ...patch })).status,
      400,
    );
  }
  const valid = await admin("/communities/com-seed-1", "PUT", {
    ...original,
    constitutionYear: "1996",
    reserveFund: "3500.25",
  });
  assert.equal(valid.status, 200);
  assert.equal(valid.data.reserveFund, "3500.25");
  assert.equal(valid.data.constitutionYear, "1996");
  const zero = await admin("/communities/com-seed-1", "PUT", {
    ...original,
    reserveFund: 0,
    version: valid.data.version,
  });
  assert.equal(zero.status, 200);
  assert.equal(zero.data.reserveFund, "0");
  assert.equal(
    (await admin("/communities/com-seed-1", "PUT", { ...original, version: zero.data.version }))
      .status,
    200,
  );
});
test("observaciones de comunidad: el servidor conserva formato y sanea el HTML", async () => {
  const original = (await admin("/communities/com-seed-1")).data;
  try {
    const formatted = await admin("/communities/com-seed-1", "PUT", {
      ...original,
      notes:
        '<p>Hola <strong>vecinos</strong></p><script>alert(1)</script><a href="javascript:alert(1)">mal</a>',
    });
    assert.equal(formatted.status, 200);
    assert.match(formatted.data.notes, /<strong>vecinos<\/strong>/);
    assert.ok(!formatted.data.notes.includes("<script"));
    assert.ok(!formatted.data.notes.includes("javascript:"));
    const plain = await admin("/communities/com-seed-1", "PUT", {
      ...original,
      notes: "Texto plano",
      version: formatted.data.version,
    });
    assert.equal(plain.status, 200);
    assert.equal(plain.data.notes, "Texto plano");
  } finally {
    await admin("/communities/com-seed-1", "PUT", {
      ...original,
      version: (await admin("/communities/com-seed-1")).data.version,
    });
  }
});

test("SSO y recuperación sin configurar no autentican ni filtran tokens", async () => {
  const request = client();
  const sso = await request("/auth/sso", "POST", {
    provider: "gmail",
    email: "admin@penarrubia.es",
  });
  assert.equal(sso.status, 503);
  const reset = await request("/auth/forgot-password", "POST", {
    email: "admin@penarrubia.es",
  });
  assert.equal(reset.status, 200);
  assert.ok(reset.data.mensaje && !reset.data.token);
});
test("auditoría: tab y API responden al permiso audit:read del rol", async () => {
  assert.equal(
    (
      await admin("/admin/roles", "POST", {
        nombre: "auditor-tab",
        descripcion: "solo auditoría",
        permisos: ["audit:read"],
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await admin("/admin/roles", "POST", {
        nombre: "sin-audit-tab",
        descripcion: "sin auditoría",
        permisos: ["community:read"],
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await admin("/admin/users", "POST", {
        nombre: "Auditor",
        apellido: "Tab",
        usuario: "auditor-tab-1",
        password: "clave-auditoria-1",
        rol: "auditor-tab",
        activo: true,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await admin("/admin/users", "POST", {
        nombre: "Sin",
        apellido: "Audit",
        usuario: "sin-audit-tab-1",
        password: "clave-sinaudito-1",
        rol: "sin-audit-tab",
        activo: true,
      })
    ).status,
    201,
  );
  const con = client();
  const sin = client();
  assert.equal(
    (await con("/auth/signin", "POST", { usuario: "auditor-tab-1", password: "clave-auditoria-1" }))
      .status,
    200,
  );
  assert.equal(
    (
      await sin("/auth/signin", "POST", {
        usuario: "sin-audit-tab-1",
        password: "clave-sinaudito-1",
      })
    ).status,
    200,
  );
  assert.equal((await con("/audit")).status, 200);
  assert.equal((await sin("/audit")).status, 403);
  assert.equal((await sin("/admin/users")).status, 403);
});

test("proveedores de comunicación: visible solo con el permiso admin:providers", async () => {
  assert.equal(
    (
      await admin("/admin/roles", "POST", {
        nombre: "proveedor-tab",
        descripcion: "solo proveedores",
        permisos: ["admin:providers"],
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await admin("/admin/roles", "POST", {
        nombre: "sin-proveedores",
        descripcion: "sin proveedores",
        permisos: ["community:read"],
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await admin("/admin/users", "POST", {
        nombre: "Proveedor",
        apellido: "Tab",
        usuario: "proveedor-tab-1",
        password: "clave-proveedores-1",
        rol: "proveedor-tab",
        activo: true,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await admin("/admin/users", "POST", {
        nombre: "Sin",
        apellido: "Proveedor",
        usuario: "sin-proveedor-1",
        password: "clave-sinprovee-1",
        rol: "sin-proveedores",
        activo: true,
      })
    ).status,
    201,
  );
  const con = client();
  const sin = client();
  assert.equal(
    (
      await con("/auth/signin", "POST", {
        usuario: "proveedor-tab-1",
        password: "clave-proveedores-1",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await sin("/auth/signin", "POST", {
        usuario: "sin-proveedor-1",
        password: "clave-sinprovee-1",
      })
    ).status,
    200,
  );
  assert.equal((await con("/communications/providers")).status, 200);
  assert.equal((await sin("/communications/providers")).status, 403);
  assert.equal((await sin("/communications/providers", "PUT", {})).status, 403);
});

test("propietario con inmueble con inquilino no se puede eliminar", async () => {
  const owners = (await admin("/owners")).data;
  const properties = (await admin("/properties")).data;
  const tenants = (await admin("/tenants")).data || [];
  const conInquilino = owners.find((o) =>
    properties.some(
      (p) => (p.ownerIds || []).includes(o.id) && tenants.some((t) => t.propertyId === p.id),
    ),
  );
  if (conInquilino) {
    const res = await admin("/owners/" + conInquilino.id, "DELETE");
    assert.equal(res.status, 409);
    assert.match(res.data.error, /inquilino/i);
  }
  const sinVinculos = owners.find(
    (o) =>
      !properties.some((p) => (p.ownerIds || []).includes(o.id)) &&
      !tenants.some((t) => t.ownerId === o.id),
  );
  if (sinVinculos) {
    const res = await admin("/owners/" + sinVinculos.id, "DELETE");
    assert.equal(res.status, 200);
  }
});

test("propietario sin inmuebles con inquilino antiguo se puede eliminar", async () => {
  const ownerId = "own-stale-test";
  const propertyId = "prop-stale-test";
  const tenantId = "ten-stale-test";
  db.prepare(
    "INSERT INTO owners (id, name, surname, documentType, dni) VALUES (?, 'Sin', 'Inmuebles', 'DNI', '12345678Z')",
  ).run(ownerId);
  db.prepare("INSERT INTO properties (id, ownerIds, tenantIds) VALUES (?, '[]', '[]')").run(
    propertyId,
  );
  db.prepare(
    "INSERT INTO tenants (id, ownerId, propertyId, name, surname) VALUES (?, ?, ?, 'Inquilino', 'Antiguo')",
  ).run(tenantId, ownerId, propertyId);

  const res = await admin("/owners/" + ownerId, "DELETE");
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(db.prepare("SELECT ownerId FROM tenants WHERE id = ?").get(tenantId).ownerId, "");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM owners WHERE id = ?").get(ownerId).n, 0);
  db.prepare("DELETE FROM tenants WHERE id = ?").run(tenantId);
  db.prepare("DELETE FROM properties WHERE id = ?").run(propertyId);
});

test("logout invalida la sesión en el servidor", async () => {
  const request = client();
  await request("/auth/signin", "POST", {
    usuario: "super_admin",
    password: "super_admin",
  });
  assert.equal((await request("/auth/logout", "POST")).status, 200);
  assert.equal((await request("/bootstrap")).status, 401);
});

test("administrador de comunidad: no puede leer ni mover datos a otra comunidad", async () => {
  const request = client();
  await request("/auth/signin", "POST", {
    usuario: "ca1",
    password: "ca1",
  });
  const visible = await request("/bootstrap");
  assert.deepEqual(
    visible.data.communities.map((c) => c.id),
    ["com-seed-1"],
  );
  assert.equal((await request("/communities/com-seed-2")).status, 403);
  const community = visible.data.communities[0];
  const { documents, statutes, documentFolders, ...communityPayload } = community;
  const logoDataUrl = `data:image/png;base64,${Buffer.from("logo comunidad propia").toString("base64")}`;
  const branded = await request(`/communities/${community.id}`, "PUT", {
    ...communityPayload,
    logoDataUrl,
  });
  assert.equal(branded.status, 200, JSON.stringify(branded.data));
  assert.equal(branded.data.logoDataUrl, logoDataUrl);
  assert.equal(
    (await request("/admin/settings", "PUT", { marca: { nombre: "Marca ajena" } })).status,
    403,
  );
  const otherCommunity = (await admin("/communities/com-seed-2")).data;
  assert.equal(
    (await request("/communities/com-seed-2", "PUT", { ...otherCommunity, logoDataUrl })).status,
    403,
  );
  const restored = await request(`/communities/${community.id}`, "PUT", {
    ...branded.data,
    logoDataUrl: community.logoDataUrl,
  });
  assert.equal(restored.status, 200, JSON.stringify(restored.data));
  const property = (await request("/properties/prop-seed-1")).data;
  assert.equal(
    (
      await request("/properties/prop-seed-1", "PUT", {
        ...property,
        communityId: "com-seed-2",
      })
    ).status,
    403,
  );
});

test("contraseña nueva revoca las sesiones y sustituye la contraseña anterior", async () => {
  const request = client();
  await request("/auth/signin", "POST", {
    usuario: "new-user",
    password: "temporary-password",
  });
  const user = (await request("/auth/me")).data;
  assert.equal(
    (
      await admin(`/admin/users/${user.id}`, "PUT", {
        password: "replacement-password",
      })
    ).status,
    200,
  );
  assert.equal((await request("/bootstrap")).status, 401);
  assert.equal(
    (
      await request("/auth/signin", "POST", {
        usuario: "new-user",
        password: "temporary-password",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/signin", "POST", {
        usuario: "new-user",
        password: "replacement-password",
      })
    ).status,
    200,
  );
});

test("la API rechaza perfiles inexistentes, listas inválidas y aprobaciones sin archivo", async () => {
  const payload = (await admin("/owners/own-seed-1")).data;
  assert.equal(
    (
      await admin("/owners/own-seed-1", "PUT", {
        ...payload,
        userId: "missing-user",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await admin("/owners/own-seed-1", "PUT", {
        ...payload,
        propertyIds: "invalid",
      })
    ).status,
    400,
  );
  const documents = structuredClone(payload.documents);
  documents.dni.adminApproval = { status: "approved" };
  assert.equal((await admin("/owners/own-seed-1", "PUT", { ...payload, documents })).status, 400);
});

test("registro nuevo: sesión propia sin perfiles ni comunidades de otra cuenta", async () => {
  const request = client();
  const created = await request("/auth/signup", "POST", {
    nombre: "Usuario",
    apellido: "Nuevo",
    usuario: "fresh-account",
    email: "fresh-account@example.test",
    password: "initial-password",
  });
  assert.equal(created.status, 201);
  const bootstrap = (await request("/bootstrap")).data;
  assert.equal(bootstrap.currentUser.id, created.data.id);
  assert.deepEqual(bootstrap.owners, []);
  assert.deepEqual(bootstrap.tenants, []);
  assert.deepEqual(bootstrap.communities, []);
  assert.deepEqual(
    bootstrap.users.map((user) => user.id),
    [created.data.id],
  );
});

test("cambio de contraseña propio: valida la actual y cierra solo las sesiones de esa cuenta", async () => {
  const created = await admin("/admin/users", "POST", {
    usuario: "self-password",
    rol: "user",
    password: "initial-password",
  });
  assert.equal(created.status, 201);
  const request = client();
  await request("/auth/signin", "POST", {
    usuario: "self-password",
    password: "initial-password",
  });
  assert.equal(
    (
      await request("/auth/change-password", "POST", {
        currentPassword: "incorrect-password",
        newPassword: "changed-password",
      })
    ).status,
    401,
  );
  assert.equal((await request("/auth/me")).status, 200);
  assert.equal(
    (
      await request("/auth/change-password", "POST", {
        userId: "user-admin",
        currentPassword: "initial-password",
        newPassword: "changed-password",
      })
    ).status,
    200,
  );
  assert.equal((await request("/auth/me")).status, 401);
  assert.equal((await admin("/auth/me")).status, 200);
  assert.equal(
    (
      await request("/auth/signin", "POST", {
        usuario: "self-password",
        password: "initial-password",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/signin", "POST", {
        usuario: "self-password",
        password: "changed-password",
      })
    ).status,
    200,
  );
});

test("configuración: valida rangos y tipos antes de guardar", async () => {
  for (const [payload, pattern] of [
    [{ documentosMaxSizeMb: 0 }, /1 y 50 MB/],
    [{ documentosMaxArchivos: 51 }, /máximo de archivos/],
    [{ duracionSesionHoras: 0 }, /duración de la sesión/],
    [{ otpExpiraMinutos: 0 }, /expiración del código OTP/],
    [{ filasPorPagina: 7 }, /5, 10, 25 o 50/],
    [{ documentosTiposPermitidos: [] }, /al menos un tipo/],
    [{ documentosTiposPermitidos: ["exe"] }, /al menos un tipo/],
    [{ mantenimiento: "si" }, /booleana/],
    [{ mensajeMantenimiento: "x".repeat(301) }, /300 caracteres/],
    [{ nombreAsociacion: "   " }, /nombre de la asociación/],
  ]) {
    const response = await admin("/admin/settings", "PUT", payload);
    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.match(response.data.error, pattern);
  }
  const settings = await admin("/admin/settings");
  assert.equal(settings.data.documentosMaxArchivos, 20);
  assert.equal(settings.data.duracionSesionHoras, 8);
  assert.equal(settings.data.nombreAsociacion, "Asociación de Propietarios");
});
test("configuración: autorizaciones de inquilinos y avisos por tipo de recibo", async () => {
  for (const [payload, pattern] of [
    [{ tenantAuthorizations: [] }, /no son válidas/],
    [{ tenantAuthorizations: { "com-seed-1": [] } }, /al menos una autorización/],
    [
      {
        tenantAuthorizations: {
          "com-seed-1": [
            { id: "zona", label: "Zona" },
            { id: "zona", label: "Otra" },
          ],
        },
      },
      /duplicadas/,
    ],
    [
      { tenantAuthorizations: { "com-seed-1": [{ id: "id inválido", label: "Zona" }] } },
      /identificador/,
    ],
    [{ tenantAuthorizations: { "com-seed-1": [{ id: "zona", label: " " }] } }, /nombre/],
    [
      {
        tenantAuthorizations: {
          "com-seed-1": [{ id: "zona", label: "Zona", description: "x".repeat(201) }],
        },
      },
      /descripción de hasta 200 caracteres/,
    ],
    [{ assessmentBeforeDays: -1 }, /assessmentBeforeDays/],
    [{ serviceRepeatDays: 1.5 }, /serviceRepeatDays/],
    [{ serviceEmail: "yes" }, /booleanos/],
  ]) {
    const response = await admin("/admin/settings", "PUT", payload);
    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.match(response.data.error, pattern);
  }
  const saved = await admin("/admin/settings", "PUT", {
    tenantAuthorizations: {
      "com-seed-1": [
        {
          id: "common_areas",
          label: "Acceso a zonas comunes",
          description: "Permite usar jardines y zonas compartidas.",
        },
        { id: "custom_piscina", label: "Uso de la piscina", description: "   " },
      ],
    },
    assessmentBeforeDays: 5,
    assessmentEmail: true,
    serviceBeforeDays: 4,
    serviceRepeatDays: 2,
    serviceEmail: true,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual(saved.data.tenantAuthorizations, {
    "com-seed-1": [
      {
        id: "common_areas",
        label: "Acceso a zonas comunes",
        description: "Permite usar jardines y zonas compartidas.",
      },
      { id: "custom_piscina", label: "Uso de la piscina" },
    ],
  });
  assert.equal(saved.data.assessmentBeforeDays, 5);
  assert.equal(saved.data.assessmentEmail, true);
  assert.equal(saved.data.serviceBeforeDays, 4);
  assert.equal(saved.data.serviceRepeatDays, 2);
  assert.equal(saved.data.serviceEmail, true);
  assert.equal(
    (
      await admin("/admin/settings", "PUT", {
        tenantAuthorizations: {},
        assessmentBeforeDays: 3,
        assessmentEmail: false,
        serviceBeforeDays: 3,
        serviceRepeatDays: 0,
        serviceEmail: false,
      })
    ).status,
    200,
  );
});
test("configuración: registro y recuperación se pueden deshabilitar", async () => {
  assert.equal(
    (
      await admin("/admin/settings", "PUT", {
        permitirRegistro: false,
        permitirRecuperacion: false,
      })
    ).status,
    200,
  );
  const signup = await client()("/auth/signup", "POST", {
    nombre: "Nuevo",
    apellido: "Vecino",
    usuario: "nuevo-vecino",
    email: "nuevo@example.test",
    password: "clave-segura-123",
  });
  assert.equal(signup.status, 403);
  assert.match(signup.data.error, /registro/i);
  const forgot = await client()("/auth/forgot-password", "POST", { email: "urucp1@example.test" });
  assert.equal(forgot.status, 403);
  assert.match(forgot.data.error, /recuperación/i);
  assert.equal(
    (await admin("/admin/settings", "PUT", { permitirRegistro: true, permitirRecuperacion: true }))
      .status,
    200,
  );
  const reset = await admin("/admin/settings");
  assert.equal(reset.data.permitirRegistro, true);
  assert.equal(reset.data.permitirRecuperacion, true);
});
test("configuración: la duración de sesión define la caducidad de la cookie", async () => {
  assert.equal((await admin("/admin/settings", "PUT", { duracionSesionHoras: 2 })).status, 200);
  const session = await client()("/auth/signin", "POST", { usuario: "urucp1", password: "urucp1" });
  assert.equal(session.status, 200);
  const maxAge = Number(/Max-Age=(\d+)/i.exec(session.cookie)?.[1]);
  assert.ok(maxAge >= 7190 && maxAge <= 7200, `Max-Age inesperado: ${session.cookie}`);
  assert.equal((await admin("/admin/settings", "PUT", { duracionSesionHoras: 8 })).status, 200);
});
test("configuración: los tipos y el máximo de archivos se aplican a las subidas", async () => {
  const before = readdirSync(UPLOADS_DIR).sort();
  const saved = await admin("/admin/settings", "PUT", {
    documentosTiposPermitidos: ["pdf"],
    documentosMaxArchivos: 1,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual(saved.data.documentosTiposPermitidos, ["pdf"]);
  const png = new FormData();
  png.append("entityType", "property");
  png.append("entityId", "prop-seed-1");
  png.append(
    "files",
    new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }),
    "imagen.png",
  );
  const rejected = await admin("/documents", "POST", png);
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /Formato no permitido.*PDF/i);
  const many = new FormData();
  many.append("entityType", "property");
  many.append("entityId", "prop-seed-1");
  for (const name of ["uno.pdf", "dos.pdf"])
    many.append("files", new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }), name);
  assert.equal((await admin("/documents", "POST", many)).status, 400);
  assert.deepEqual(readdirSync(UPLOADS_DIR).sort(), before);
  const single = new FormData();
  single.append("entityType", "property");
  single.append("entityId", "prop-seed-1");
  single.append("files", new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }), "valido.pdf");
  const uploaded = await admin("/documents", "POST", single);
  assert.equal(uploaded.status, 201);
  assert.equal((await admin(`/documents/${uploaded.data[0].id}`, "DELETE")).status, 200);
  assert.equal(
    (
      await admin("/admin/settings", "PUT", {
        documentosTiposPermitidos: ["pdf", "jpg", "jpeg", "png", "webp"],
        documentosMaxArchivos: 20,
      })
    ).status,
    200,
  );
  assert.deepEqual(readdirSync(UPLOADS_DIR).sort(), before);
});
test("configuración: el modo mantenimiento bloquea vecinos y deja pasar a administración", async () => {
  const saved = await admin("/admin/settings", "PUT", {
    mantenimiento: true,
    mensajeMantenimiento: "Mantenimiento programado para hoy.",
  });
  assert.equal(saved.status, 200);
  const blocked = await owner("/bootstrap");
  assert.equal(blocked.status, 503);
  assert.equal(blocked.data.mantenimiento, true);
  assert.equal(blocked.data.error, "Mantenimiento programado para hoy.");
  assert.equal((await tenant("/bootstrap")).status, 503);
  assert.equal((await admin("/bootstrap")).status, 200);
  assert.equal(
    (
      await admin("/admin/settings", "PUT", {
        mantenimiento: false,
        mensajeMantenimiento:
          "La plataforma está en mantenimiento. Vuelve a intentar en unos minutos.",
      })
    ).status,
    200,
  );
  assert.equal((await owner("/bootstrap")).status, 200);
});
test("roles de plataforma: editar super_admin no exige perfiles y desvincular no se bloquea", async () => {
  const platformAdmin = db.prepare("SELECT id FROM users WHERE usuario = 'super_admin'").get();
  const ownerRow = db.prepare("SELECT id FROM owners WHERE id = 'own-seed-1'").get();
  // Vincular un perfil a un rol de plataforma sigue rechazado.
  assert.equal(
    (await admin(`/admin/users/${platformAdmin.id}/link-owner`, "PUT", { ownerId: ownerRow.id }))
      .status,
    409,
  );
  // Desvincular (aunque no tenga perfil) permite guardar el usuario sin error.
  assert.equal(
    (await admin(`/admin/users/${platformAdmin.id}/link-owner`, "PUT", { ownerId: "" })).status,
    200,
  );
  assert.equal(
    (await admin(`/admin/users/${platformAdmin.id}/link-tenant`, "PUT", { tenantId: "" })).status,
    200,
  );
  const edited = await admin(`/admin/users/${platformAdmin.id}`, "PUT", {
    nombre: "super_admin",
    apellido: "",
    usuario: "super_admin",
    email: "super_admin@super_admin.com",
    rol: "super_admin",
    activo: true,
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assert.equal(edited.data.rol, "super_admin");
});

function pdfForm(entityType, entityId, name, { folderId = "", category = "" } = {}) {
  const form = new FormData();
  form.append("entityType", entityType);
  form.append("entityId", entityId);
  if (folderId) form.append("folderId", folderId);
  if (category) form.append("category", category);
  form.append("files", new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }), name);
  return form;
}

test("biblioteca documental: iconos ampliados y colores persisten y se normalizan", async () => {
  const created = await admin("/documents/folders", "POST", {
    entityType: "community",
    entityId: "com-seed-1",
    name: "Colores e iconos",
    icon: "calendar",
    color: "violet",
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.color, "violet");
  assert.equal(created.data.icon, "calendar");
  const changed = await admin(`/documents/folders/${created.data.id}`, "PATCH", {
    color: "blue",
    icon: "legal",
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(changed.data.color, "blue");
  assert.equal(changed.data.icon, "legal");
  const listing = await admin("/documents?entityType=community&entityId=com-seed-1");
  assert.equal(listing.data.folders.find((f) => f.id === created.data.id).color, "blue");
  const safe = await admin(`/documents/folders/${created.data.id}`, "PATCH", {
    color: "red; background:url(evil)",
    icon: "unknown",
  });
  assert.equal(safe.data.color, "teal");
  assert.equal(safe.data.icon, "folder");
  await admin(`/documents/folders/${created.data.id}?confirm=1`, "DELETE");
});

test("biblioteca documental: carpetas, duplicados, mudanza y borrado en cascada", async () => {
  const before = readdirSync(UPLOADS_DIR).sort();
  const target = { entityType: "community", entityId: "com-seed-1" };
  const root = await admin("/documents/folders", "POST", {
    ...target,
    name: "Actas",
  });
  assert.equal(root.status, 201, JSON.stringify(root.data));
  assert.equal(root.data.parentId, "");
  const child = await admin("/documents/folders", "POST", {
    ...target,
    parentId: root.data.id,
    name: "2026",
  });
  assert.equal(child.status, 201, JSON.stringify(child.data));
  assert.equal(child.data.parentId, root.data.id);
  // Duplicado por nombre (sin distinguir mayúsculas ni acentos) en el mismo nivel.
  assert.equal(
    (
      await admin("/documents/folders", "POST", {
        ...target,
        parentId: root.data.id,
        name: "2026",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await admin("/documents/folders", "POST", {
        ...target,
        name: "Áctas",
      })
    ).status,
    409,
  );
  // Un documento no puede repetir nombre en la misma carpeta.
  const inside = await admin(
    "/documents",
    "POST",
    pdfForm("community", "com-seed-1", "Acta enero.pdf", {
      folderId: child.data.id,
    }),
  );
  assert.equal(inside.status, 201, JSON.stringify(inside.data));
  assert.equal(inside.data[0].folderId, child.data.id);
  const duplicate = await admin(
    "/documents",
    "POST",
    pdfForm("community", "com-seed-1", "acta enero.pdf", {
      folderId: child.data.id,
    }),
  );
  assert.equal(duplicate.status, 409);
  // El mismo nombre en la raíz sí está permitido.
  const rootDocument = await admin(
    "/documents",
    "POST",
    pdfForm("community", "com-seed-1", "Acta enero.pdf"),
  );
  assert.equal(rootDocument.status, 201, JSON.stringify(rootDocument.data));
  // Renombrar exige conservar la extensión.
  assert.equal(
    (
      await admin(`/documents/${rootDocument.data[0].id}`, "PATCH", {
        name: "Acta enero.txt",
      })
    ).status,
    400,
  );
  const renamed = await admin(`/documents/${rootDocument.data[0].id}`, "PATCH", {
    name: "Acta enero 2026.pdf",
  });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.equal(renamed.data.fileName, "Acta enero 2026.pdf");
  // Mover a una carpeta y de vuelta a la raíz.
  const moved = await admin(`/documents/${rootDocument.data[0].id}`, "PATCH", {
    folderId: child.data.id,
  });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.folderId, child.data.id);
  const movedRoot = await admin(`/documents/${rootDocument.data[0].id}`, "PATCH", {
    folderId: "",
  });
  assert.equal(movedRoot.status, 200);
  assert.equal(movedRoot.data.folderId, "");
  // La carpeta no se puede mover dentro de su propia subcarpeta.
  assert.equal(
    (
      await admin(`/documents/folders/${root.data.id}`, "PATCH", {
        parentId: child.data.id,
      })
    ).status,
    400,
  );
  // Listado con jerarquía.
  const listing = await admin("/documents?entityType=community&entityId=com-seed-1");
  assert.equal(listing.status, 200);
  assert.deepEqual(listing.data.folders.map((folder) => folder.name).sort(), ["2026", "Actas"]);
  assert.equal(listing.data.documents.length, 2);
  // Sin confirmación no se borra nada y se informan los recuentos.
  const blocked = await admin(`/documents/folders/${root.data.id}`, "DELETE");
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.requiresConfirmation, true);
  assert.deepEqual(blocked.data.counts, { folders: 2, documents: 1 });
  const deleted = await admin(`/documents/folders/${root.data.id}?confirm=1`, "DELETE");
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
  assert.equal(deleted.data.deletedFolders, 2);
  assert.equal(deleted.data.deletedDocuments, 1);
  // El documento que quedó en la raíz se elimina aparte.
  assert.equal((await admin(`/documents/${rootDocument.data[0].id}`, "DELETE")).status, 200);
  assert.deepEqual(readdirSync(UPLOADS_DIR).sort(), before);
  assert.equal(
    (await admin("/documents?entityType=community&entityId=com-seed-1")).data.documents.length,
    0,
  );
});

test("biblioteca documental: cinco niveles como máximo", async () => {
  const target = { entityType: "property", entityId: "prop-seed-1" };
  let parentId = "";
  const created = [];
  for (let level = 1; level <= 5; level += 1) {
    const folder = await admin("/documents/folders", "POST", {
      ...target,
      parentId,
      name: `Nivel ${level}`,
    });
    assert.equal(folder.status, 201, JSON.stringify(folder.data));
    parentId = folder.data.id;
    created.push(parentId);
  }
  assert.equal(
    (
      await admin("/documents/folders", "POST", {
        ...target,
        parentId,
        name: "Nivel 6",
      })
    ).status,
    400,
  );
  // Mover una carpeta con subárbol tampoco puede superar el límite.
  const other = await admin("/documents/folders", "POST", {
    ...target,
    name: "Destino",
  });
  assert.equal(other.status, 201);
  assert.equal(
    (
      await admin(`/documents/folders/${created[0]}`, "PATCH", {
        parentId: other.data.id,
      })
    ).status,
    400,
  );
  const deleted = await admin(`/documents/folders/${created[0]}?confirm=1`, "DELETE");
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.deletedFolders, 5);
  assert.equal(
    (await admin(`/documents/folders/${other.data.id}?confirm=1`, "DELETE")).status,
    200,
  );
});

test("estatutos: sólo comunidades, carpetas propias y consulta para residentes", async () => {
  const before = readdirSync(UPLOADS_DIR).sort();
  const target = { entityType: "community", entityId: "com-seed-1" };
  const folder = await admin("/documents/folders", "POST", {
    ...target,
    name: "Temporal estatutos",
  });
  assert.equal(folder.status, 201);
  assert.equal(folder.data.category, "document");
  // Los estatutos tienen su propio árbol de carpetas, independiente del documental.
  const statuteFolder = await admin("/documents/folders", "POST", {
    ...target,
    category: "statutes",
    name: "Temporal estatutos",
    icon: "shield",
  });
  assert.equal(statuteFolder.status, 201, JSON.stringify(statuteFolder.data));
  assert.equal(statuteFolder.data.category, "statutes");
  assert.equal(statuteFolder.data.icon, "shield");
  // Una carpeta de documentos no clasifica estatutos.
  assert.equal(
    (
      await admin(
        "/documents",
        "POST",
        pdfForm("community", "com-seed-1", "Estatutos.pdf", {
          folderId: folder.data.id,
          category: "statutes",
        }),
      )
    ).status,
    400,
  );
  // Sólo las comunidades tienen estatutos.
  assert.equal(
    (
      await admin(
        "/documents",
        "POST",
        pdfForm("property", "prop-seed-1", "Estatutos.pdf", {
          category: "statutes",
        }),
      )
    ).status,
    400,
  );
  const uploaded = await admin(
    "/documents",
    "POST",
    pdfForm("community", "com-seed-1", "Estatutos vigentes.pdf", {
      category: "statutes",
      folderId: statuteFolder.data.id,
    }),
  );
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const statute = uploaded.data[0];
  assert.equal(statute.category, "statutes");
  assert.equal(statute.folderId, statuteFolder.data.id);
  assert.match(statute.url, /\/download$/);
  assert.match(statute.previewUrl, /\/preview$/);
  // Los residentes de la comunidad pueden consultarlos y descargarlos.
  const ownerListing = await owner(
    "/documents?entityType=community&entityId=com-seed-1&category=statutes",
  );
  assert.equal(ownerListing.status, 200);
  assert.ok(ownerListing.data.documents.some((doc) => doc.id === statute.id));
  assert.deepEqual(
    ownerListing.data.folders.map((item) => item.id),
    [statuteFolder.data.id],
  );
  const ownerPreview = await owner(`/documents/${statute.id}/preview`);
  assert.equal(ownerPreview.status, 200);
  assert.match(String(ownerPreview.data), /%PDF/);
  assert.equal((await owner(`/documents/${statute.id}/download`)).status, 200);
  const tenantListing = await tenant(
    "/documents?entityType=community&entityId=com-seed-1&category=statutes",
  );
  assert.equal(tenantListing.status, 200);
  assert.ok(tenantListing.data.documents.some((doc) => doc.id === statute.id));
  // Sólo lectura: un propietario no puede subir ni borrar.
  const denied = await owner(
    "/documents",
    "POST",
    pdfForm("community", "com-seed-1", "Ajeno.pdf", { category: "statutes" }),
  );
  assert.equal(denied.status, 403);
  assert.equal((await owner(`/documents/${statute.id}`, "DELETE")).status, 403);
  // El bootstrap los expone en su propia colección y no en documentación general.
  const boot = await owner("/bootstrap");
  const community = boot.data.communities.find((c) => c.id === "com-seed-1");
  assert.ok(community.statutes.some((doc) => doc.id === statute.id));
  assert.ok(!community.documents.some((doc) => doc.id === statute.id));
  assert.ok(
    community.documentFolders.some(
      (item) => item.id === statuteFolder.data.id && item.category === "statutes",
    ),
  );
  // Limpieza.
  assert.equal((await admin(`/documents/${statute.id}`, "DELETE")).status, 200);
  assert.equal(
    (await admin(`/documents/folders/${statuteFolder.data.id}?confirm=1`, "DELETE")).status,
    200,
  );
  assert.equal(
    (await admin(`/documents/folders/${folder.data.id}?confirm=1`, "DELETE")).status,
    200,
  );
  assert.deepEqual(readdirSync(UPLOADS_DIR).sort(), before);
});

test("biblioteca documental: alcance de administradores de comunidad", async () => {
  const communityAdmin = client();
  const login = await communityAdmin("/auth/signin", "POST", {
    usuario: "ca1",
    password: "ca1",
  });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  const ownFolder = await communityAdmin("/documents/folders", "POST", {
    entityType: "community",
    entityId: "com-seed-1",
    name: "Permitida",
  });
  assert.equal(ownFolder.status, 201, JSON.stringify(ownFolder.data));
  assert.equal(
    (
      await communityAdmin("/documents/folders", "POST", {
        entityType: "community",
        entityId: "com-seed-2",
        name: "Ajena",
      })
    ).status,
    403,
  );
  assert.equal(
    (await communityAdmin("/documents", "POST", pdfForm("community", "com-seed-2", "Ajeno.pdf")))
      .status,
    403,
  );
  assert.equal(
    (await communityAdmin(`/documents/folders/${ownFolder.data.id}?confirm=1`, "DELETE")).status,
    200,
  );
});

test("vista previa: la CSP permite encuadrar el documento en el mismo origen", async () => {
  const before = readdirSync(UPLOADS_DIR).sort();
  const uploaded = await admin(
    "/documents",
    "POST",
    pdfForm("property", "prop-seed-1", "Vista previa.pdf"),
  );
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const preview = await admin(`/documents/${uploaded.data[0].id}/preview`);
  assert.equal(preview.status, 200);
  assert.match(String(preview.data), /%PDF/);
  assert.equal(preview.headers.get("content-security-policy"), "frame-ancestors 'self'");
  assert.equal((await admin(`/documents/${uploaded.data[0].id}`, "DELETE")).status, 200);
  assert.deepEqual(readdirSync(UPLOADS_DIR).sort(), before);
});

test("documentos Word: sólo descarga, sin vista previa", async () => {
  assert.equal(
    (
      await admin("/admin/settings", "PUT", {
        documentosTiposPermitidos: ["pdf", "doc", "docx"],
        documentosMaxArchivos: 20,
      })
    ).status,
    200,
  );
  const form = new FormData();
  form.append("entityType", "property");
  form.append("entityId", "prop-seed-1");
  form.append(
    "files",
    new Blob([Buffer.from("PK\u0003\u0004[Content_Types].xml")], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    "Escritura.docx",
  );
  const uploaded = await admin("/documents", "POST", form);
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  assert.equal(
    uploaded.data[0].fileType,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  assert.equal(uploaded.data[0].previewUrl, undefined);
  assert.equal((await admin(`/documents/${uploaded.data[0].id}/preview`)).status, 415);
  assert.equal((await admin(`/documents/${uploaded.data[0].id}/download`)).status, 200);
  assert.equal((await admin(`/documents/${uploaded.data[0].id}`, "DELETE")).status, 200);
  assert.equal(
    (
      await admin("/admin/settings", "PUT", {
        documentosTiposPermitidos: ["pdf", "jpg", "jpeg", "png", "webp"],
        documentosMaxArchivos: 20,
      })
    ).status,
    200,
  );
});

function roleByName(roles, name) {
  return roles.find((role) => role.nombre === name);
}

test("F03 · inquilino: contrato finalizado o futuro no da acceso a la comunidad", async () => {
  const original = (await admin("/tenants/tenant-seed-1")).data;
  const request = client();
  assert.equal(
    (await request("/auth/signin", "POST", { usuario: "uruci1", password: "uruci1" })).status,
    200,
  );
  const setContract = async (contractStart, contractEnd) =>
    assert.equal(
      (
        await admin("/tenants/tenant-seed-1", "PUT", {
          ...original,
          version: (await admin("/tenants/tenant-seed-1")).data.version,
          contractStart,
          contractEnd,
        })
      ).status,
      200,
    );
  try {
    // Contrato finalizado: pierde comunidad, inmueble, ficha y documentación.
    await setContract("2000-01-01", "2001-01-01");
    let boot = (await request("/bootstrap")).data;
    assert.deepEqual(boot.communities, []);
    assert.deepEqual(boot.properties, []);
    assert.deepEqual(boot.tenants, []);
    assert.equal((await request("/communities/com-seed-1")).status, 403);
    assert.equal((await request("/properties/prop-seed-1")).status, 403);
    assert.equal((await request("/tenants/tenant-seed-1")).status, 403);
    assert.equal(
      (await request("/documents?entityType=community&entityId=com-seed-1&category=document"))
        .status,
      403,
    );

    // Contrato futuro: tampoco concede pertenencia antes de su inicio.
    await setContract("2099-01-01", "");
    boot = (await request("/bootstrap")).data;
    assert.deepEqual(boot.communities, []);
    assert.deepEqual(boot.properties, []);
    assert.deepEqual(boot.tenants, []);

    // Permiso configurable: conserva solo su ficha e historial propio.
    await setContract("2000-01-01", "2001-01-01");
    const roles = (await admin("/admin/roles")).data;
    const userRole = roleByName(roles, "user");
    assert.equal(
      (
        await admin(`/admin/roles/${userRole.id}`, "PUT", {
          permisos: [...userRole.permisos, "tenant:history:read"],
        })
      ).status,
      200,
    );
    try {
      boot = (await request("/bootstrap")).data;
      assert.deepEqual(
        boot.tenants.map((t) => t.id),
        ["tenant-seed-1"],
      );
      assert.deepEqual(boot.communities, []);
      assert.deepEqual(boot.properties, []);
      assert.equal((await request("/tenants/tenant-seed-1")).status, 200);
      assert.equal((await request("/communities/com-seed-1")).status, 403);
      assert.equal((await request("/properties/prop-seed-1")).status, 403);
    } finally {
      await admin(`/admin/roles/${userRole.id}`, "PUT", { permisos: userRole.permisos });
    }

    // Un segundo contrato vigente conserva únicamente su propio ámbito.
    const second = await admin("/tenants", "POST", {
      id: "api-tenant-f03",
      ownerId: "own-seed-3",
      propertyId: "prop-seed-4",
      name: "Inquilino",
      surname: "Segundo Vigente",
      documentId: "12345678Z",
      phone: "600000000",
      email: "segundo.vigente@example.test",
      contractStart: "2026-01-01",
      contractEnd: "",
      userId: "user-uruci1",
    });
    assert.equal(second.status, 201, JSON.stringify(second.data));
    try {
      boot = (await request("/bootstrap")).data;
      assert.deepEqual(
        boot.communities.map((c) => c.id),
        ["com-seed-2"],
      );
      assert.deepEqual(
        boot.properties.map((p) => p.id),
        ["prop-seed-4"],
      );
      assert.deepEqual(
        boot.tenants.map((t) => t.id),
        ["api-tenant-f03"],
      );
      assert.equal((await request("/tenants/tenant-seed-1")).status, 403);
      assert.equal((await request("/tenants/api-tenant-f03")).status, 200);
    } finally {
      await admin("/tenants/api-tenant-f03", "DELETE");
    }
  } finally {
    await admin("/tenants/tenant-seed-1", "PUT", {
      ...original,
      version: (await admin("/tenants/tenant-seed-1")).data.version,
    });
  }
});

test("F04 · document:read protege los expedientes embebidos y la edición no los borra", async () => {
  const roles = (await admin("/admin/roles")).data;
  const communityAdminRole = roleByName(roles, "community_admin");
  const originalPermissions = [...communityAdminRole.permisos];
  const withoutDocumentRead = originalPermissions.filter((p) => p !== "document:read");
  const file = {
    fileName: "expediente-sintetico.pdf",
    dataUrl: "data:application/pdf;base64,JVBERi0xLjQK",
    adminApproval: { status: "pending" },
  };
  const ownerDocs = { dni: { ...file, fileName: "dni-own-seed-1.pdf" } };
  const tenantDocs = { dni: { ...file, fileName: "dni-tenant-seed-1.pdf" } };
  db.prepare("UPDATE owners SET documents = ? WHERE id = 'own-seed-1'").run(
    JSON.stringify(ownerDocs),
  );
  db.prepare("UPDATE tenants SET documents = ? WHERE id = 'tenant-seed-1'").run(
    JSON.stringify(tenantDocs),
  );
  const communityAdmin = client();
  assert.equal(
    (await communityAdmin("/auth/signin", "POST", { usuario: "ca1", password: "ca1" })).status,
    200,
  );
  try {
    await admin(`/admin/roles/${communityAdminRole.id}`, "PUT", {
      permisos: withoutDocumentRead,
    });
    // Sin document:read ni la ficha, ni los listados, ni bootstrap entregan bytes.
    assert.equal(
      (
        await communityAdmin(
          "/documents?entityType=tenant&entityId=tenant-seed-1&category=document",
        )
      ).status,
      403,
    );
    const ownerDetail = await communityAdmin("/owners/own-seed-1");
    assert.equal(ownerDetail.status, 200);
    assert.deepEqual(ownerDetail.data.documents, {});
    const tenantDetail = await communityAdmin("/tenants/tenant-seed-1");
    assert.equal(tenantDetail.status, 200);
    assert.deepEqual(tenantDetail.data.documents, {});
    const ownerList = (await communityAdmin("/owners")).data;
    assert.deepEqual(ownerList.find((o) => o.id === "own-seed-1").documents, {});
    const tenantList = (await communityAdmin("/tenants")).data;
    assert.deepEqual(tenantList.find((t) => t.id === "tenant-seed-1").documents, {});
    let boot = (await communityAdmin("/bootstrap")).data;
    assert.deepEqual(boot.owners.find((o) => o.id === "own-seed-1").documents, {});
    assert.deepEqual(boot.tenants.find((t) => t.id === "tenant-seed-1").documents, {});

    // Guardar la ficha con la copia redactada no debe borrar el expediente.
    assert.equal(
      (
        await communityAdmin("/owners/own-seed-1", "PUT", {
          ...ownerDetail.data,
          documents: {},
        })
      ).status,
      200,
    );
    const storedDocs = JSON.parse(
      db.prepare("SELECT documents FROM owners WHERE id = 'own-seed-1'").get().documents,
    );
    assert.equal(storedDocs.dni.dataUrl, ownerDocs.dni.dataUrl);

    // El mismo rol con document:read recupera el acceso previsto.
    await admin(`/admin/roles/${communityAdminRole.id}`, "PUT", {
      permisos: [...withoutDocumentRead, "document:read"],
    });
    const restored = await communityAdmin("/owners/own-seed-1");
    assert.equal(restored.status, 200);
    assert.equal(restored.data.documents.dni.dataUrl, ownerDocs.dni.dataUrl);
    boot = (await communityAdmin("/bootstrap")).data;
    assert.equal(
      boot.owners.find((o) => o.id === "own-seed-1").documents.dni.dataUrl,
      ownerDocs.dni.dataUrl,
    );
    assert.equal(
      boot.tenants.find((t) => t.id === "tenant-seed-1").documents.dni.dataUrl,
      tenantDocs.dni.dataUrl,
    );
  } finally {
    await admin(`/admin/roles/${communityAdminRole.id}`, "PUT", {
      permisos: originalPermissions,
    });
    db.prepare("UPDATE owners SET documents = '{}' WHERE id = 'own-seed-1'").run();
    db.prepare("UPDATE tenants SET documents = '{}' WHERE id = 'tenant-seed-1'").run();
  }
});

test("F06 · editar un propietario en una comunidad no altera sus vínculos en otra", async () => {
  const ownerBefore = (await admin("/owners/own-seed-1")).data;
  const propertyBefore = (await admin("/properties/prop-seed-6")).data;
  try {
    const reserved = await admin("/properties/prop-seed-6", "PUT", {
      ...propertyBefore,
      ownerPercentages: Object.fromEntries(
        propertyBefore.ownerIds.map((id) => [id, 50 / propertyBefore.ownerIds.length]),
      ),
    });
    assert.equal(reserved.status, 200, JSON.stringify(reserved.data));
    assert.equal(
      (
        await admin("/owners/own-seed-1", "PUT", {
          ...ownerBefore,
          version: (await admin("/owners/own-seed-1")).data.version,
          propertyIds: [...new Set([...(ownerBefore.propertyIds || []), "prop-seed-6"])],
          propertyShares: [
            { propertyId: "prop-seed-6", percentage: 50, version: reserved.data.version },
          ],
        })
      ).status,
      200,
    );
    const propertyLinked = (await admin("/properties/prop-seed-6")).data;
    assert.ok(propertyLinked.ownerIds.includes("own-seed-1"));
    const percentagesBefore = propertyLinked.ownerPercentages;
    // Contrato de la comunidad B cuyo titular es el propietario compartido.
    const foreignTenant = await admin("/tenants", "POST", {
      id: "api-tenant-f06",
      ownerId: "own-seed-1",
      propertyId: "prop-seed-6",
      name: "Inquilino",
      surname: "Comunidad B",
      documentId: "12345678Z",
      phone: "600000001",
      email: "inquilino.b@example.test",
      contractStart: "2026-01-01",
      contractEnd: "",
    });
    assert.equal(foreignTenant.status, 201, JSON.stringify(foreignTenant.data));

    const communityAdmin = client();
    assert.equal(
      (await communityAdmin("/auth/signin", "POST", { usuario: "ca1", password: "ca1" })).status,
      200,
    );
    const visibleOwner = (await communityAdmin("/owners/own-seed-1")).data;
    assert.ok(visibleOwner.propertyIds.includes("prop-seed-6"));
    // Solo envía el inmueble visible de su comunidad: el de com-seed-3 se conserva.
    const saved = await communityAdmin("/owners/own-seed-1", "PUT", {
      ...visibleOwner,
      propertyIds: ["prop-seed-1"],
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.ok(saved.data.propertyIds.includes("prop-seed-6"));
    const propertyAfter = (await admin("/properties/prop-seed-6")).data;
    assert.ok(propertyAfter.ownerIds.includes("own-seed-1"));
    assert.deepEqual(propertyAfter.ownerPercentages, percentagesBefore);
    assert.equal((await admin("/tenants/api-tenant-f06")).data.ownerId, "own-seed-1");
    assert.deepEqual((await admin("/owners/own-seed-1")).data.propertyIds.sort(), [
      "prop-seed-1",
      "prop-seed-6",
    ]);

    // Tampoco puede crear un vínculo nuevo en otra comunidad.
    assert.equal(
      (
        await communityAdmin("/owners/own-seed-1", "PUT", {
          ...saved.data,
          propertyIds: [...saved.data.propertyIds, "prop-seed-7"],
        })
      ).status,
      403,
    );
    assert.ok(!(await admin("/properties/prop-seed-7")).data.ownerIds.includes("own-seed-1"));
  } finally {
    await admin("/tenants/api-tenant-f06", "DELETE");
    db.prepare(
      "UPDATE properties SET ownerIds = ?, ownerPercentages = ? WHERE id = 'prop-seed-6'",
    ).run(JSON.stringify(propertyBefore.ownerIds), JSON.stringify(propertyBefore.ownerPercentages));
    db.prepare("UPDATE owners SET propertyIds = ?, propertyId = ? WHERE id = 'own-seed-1'").run(
      JSON.stringify(ownerBefore.propertyIds),
      ownerBefore.propertyId,
    );
  }
});

test("F15 · cuotas por propietario no exponen servicios de una comunidad ajena", async () => {
  const propertyBefore = (await admin("/properties/prop-seed-6")).data;
  const { saveService, previewService, issueService } = await import("../../src/services.js");
  const actor = db.prepare("SELECT * FROM users WHERE usuario = 'super_admin'").get();
  try {
    db.prepare("UPDATE properties SET ownerIds = ? WHERE id = 'prop-seed-6'").run(
      JSON.stringify([...new Set([...propertyBefore.ownerIds, "own-seed-1"])]),
    );
    const service = saveService(
      "com-seed-3",
      {
        service: "agua",
        supplier: "Proveedor ajeno",
        invoiceNumber: "F15-1",
        period: "2026-11",
        issueDate: "2026-11-01",
        dueDate: "2026-11-20",
        totalAmount: "100",
        billing: "informative",
        method: "manual",
        propertyIds: ["prop-seed-6"],
        manual: { "prop-seed-6": "100" },
        legalBasis: "Acuerdo sintético",
        notes: "",
      },
      actor,
    );
    issueService(service.id, { token: previewService(service.id).token }, actor);

    const communityAdmin = client();
    assert.equal(
      (await communityAdmin("/auth/signin", "POST", { usuario: "ca1", password: "ca1" })).status,
      200,
    );
    const foreign = await communityAdmin("/fees/owners/own-seed-1");
    assert.equal(foreign.status, 200, JSON.stringify(foreign.data));
    assert.ok(
      !(foreign.data.informativeServices || []).some(
        (item) => item.id === service.id || item.communityId === "com-seed-3",
      ),
    );

    // El propio propietario sí conserva el reparto que le corresponde.
    const ownerClient = client();
    assert.equal(
      (await ownerClient("/auth/signin", "POST", { usuario: "urucp1", password: "urucp1" })).status,
      200,
    );
    const own = await ownerClient("/fees/owners/own-seed-1");
    assert.equal(own.status, 200, JSON.stringify(own.data));
    assert.ok((own.data.informativeServices || []).some((item) => item.id === service.id));
  } finally {
    db.prepare("DELETE FROM fee_receipts WHERE serviceBillId = ?").run(
      db.prepare("SELECT id FROM service_bills WHERE invoiceNumber = 'F15-1'").get()?.id || "",
    );
    db.prepare(
      "DELETE FROM service_attachments WHERE serviceBillId IN (SELECT id FROM service_bills WHERE invoiceNumber = 'F15-1')",
    ).run();
    db.prepare("DELETE FROM service_bills WHERE invoiceNumber = 'F15-1'").run();
    db.prepare("UPDATE properties SET ownerIds = ? WHERE id = 'prop-seed-6'").run(
      JSON.stringify(propertyBefore.ownerIds),
    );
  }
});

test("F05 · los documentos JSON rechazan los mismos tipos y tamaños que la biblioteca", async () => {
  const ownerClient = client();
  assert.equal(
    (await ownerClient("/auth/signin", "POST", { usuario: "urucp1", password: "urucp1" })).status,
    200,
  );
  const before = (await ownerClient("/owners/own-seed-1")).data;
  try {
    const fake = {
      fileName: "archivo.exe",
      fileType: "application/x-msdownload",
      dataUrl: "data:application/x-msdownload;base64,TVqQAAMAAAA=",
      size: 1,
      adminApproval: { status: "pending" },
    };
    const rejected = await ownerClient("/owners/own-seed-1", "PUT", {
      ...before,
      documents: { ...before.documents, dni: fake },
    });
    assert.equal(rejected.status, 400, JSON.stringify(rejected.data));
    assert.ok(
      !String(
        db.prepare("SELECT documents FROM owners WHERE id = 'own-seed-1'").get().documents,
      ).includes("archivo.exe"),
    );

    // Extensión permitida con bytes ejecutables: tampoco pasa.
    const spoofed = await ownerClient("/owners/own-seed-1", "PUT", {
      ...before,
      documents: {
        ...before.documents,
        dni: {
          ...fake,
          fileName: "falso.pdf",
          fileType: "application/pdf",
          dataUrl: "data:application/pdf;base64,TVqQAAMAAAA=",
        },
      },
    });
    assert.equal(spoofed.status, 400, JSON.stringify(spoofed.data));

    const validPdf = {
      fileName: "dni-valido.pdf",
      fileType: "application/pdf",
      dataUrl: "data:application/pdf;base64,JVBERi0xLjQKJSVFT0Y=",
      adminApproval: { status: "pending" },
    };
    const accepted = await ownerClient("/owners/own-seed-1", "PUT", {
      ...before,
      documents: { ...before.documents, dni: validPdf },
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
    assert.equal(accepted.data.documents.dni.fileName, "dni-valido.pdf");
    assert.equal(accepted.data.documents.dni.fileType, "application/pdf");
    assert.ok(accepted.data.documents.dni.fileSize > 0);
  } finally {
    db.prepare("UPDATE owners SET documents = ? WHERE id = 'own-seed-1'").run(
      JSON.stringify(before.documents || {}),
    );
  }
});

test("F11 · una verificación OTP confirmada sobrevive al guardar y no se falsifica", async () => {
  const ownerClient = client();
  assert.equal(
    (await ownerClient("/auth/signin", "POST", { usuario: "urucp1", password: "urucp1" })).status,
    200,
  );
  const original = (await ownerClient("/owners/own-seed-1")).data;
  const hash = (code) => crypto.createHash("sha256").update(code).digest("hex");
  const challengeId = crypto.randomUUID();
  const otherAccountChallenge = crypto.randomUUID();
  try {
    assert.equal(
      (
        await ownerClient("/owners/own-seed-1", "PUT", {
          ...original,
          phone: "600123499",
          phoneVerified: false,
          phoneVerifiedAt: "",
        })
      ).status,
      200,
    );
    const now = Date.now();
    db.prepare(
      "INSERT INTO contact_verification_challenges(id,tipo,destino,codigo,createdAt,expiresAt) VALUES (?,?,?,?,?,?)",
    ).run(challengeId, "phone", "600123499", hash("123456"), now, now + 60_000);
    const confirmed = await ownerClient("/owners/contact/phone/confirm", "POST", {
      challengeId,
      code: "123456",
    });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
    assert.equal(confirmed.data.verified, true);
    const saved = await ownerClient("/owners/own-seed-1", "PUT", {
      ...original,
      version: (await ownerClient("/owners/own-seed-1")).data.version,
      phone: "600123499",
      phoneVerified: true,
      phoneVerifiedAt: confirmed.data.verifiedAt,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.phoneVerified, true);
    assert.ok(saved.data.phoneVerifiedAt);
    assert.equal((await ownerClient("/owners/own-seed-1")).data.phoneVerified, true);

    // Cambiar el contacto invalida la verificación anterior.
    const invalidated = await ownerClient("/owners/own-seed-1", "PUT", {
      ...saved.data,
      phone: "600123488",
      phoneVerified: true,
      phoneVerifiedAt: saved.data.phoneVerifiedAt,
    });
    assert.equal(invalidated.status, 200, JSON.stringify(invalidated.data));
    assert.equal(invalidated.data.phoneVerified, false);

    // Un reto vinculado a otra cuenta no se puede confirmar desde esta sesión.
    db.prepare(
      "INSERT INTO contact_verification_challenges(id,tipo,destino,codigo,createdAt,expiresAt,userId) VALUES (?,?,?,?,?,?,?)",
    ).run(
      otherAccountChallenge,
      "phone",
      "600123488",
      hash("654321"),
      now,
      now + 60_000,
      "user-urucp1",
    );
    const foreignConfirm = await admin("/owners/contact/phone/confirm", "POST", {
      challengeId: otherAccountChallenge,
      code: "654321",
    });
    assert.equal(foreignConfirm.status, 403);
  } finally {
    db.prepare(
      "UPDATE owners SET phone = ?, phoneVerified = ?, phoneVerifiedAt = ? WHERE id = 'own-seed-1'",
    ).run(original.phone, original.phoneVerified ? 1 : 0, original.phoneVerifiedAt || "");
    db.prepare("DELETE FROM contact_verification_challenges WHERE id IN (?, ?)").run(
      challengeId,
      otherAccountChallenge,
    );
  }
});

test("F07 · los cuatro CRUD rechazan ediciones simultáneas y versiones ausentes", async () => {
  for (const [route, field] of [
    ["/communities/com-seed-1", "president"],
    ["/owners/own-seed-2", "name"],
    ["/properties/prop-seed-2", "plot"],
    ["/tenants/tenant-seed-2", "name"],
  ]) {
    const first = await admin(route);
    assert.equal(first.status, 200);
    assert.ok(Number.isSafeInteger(first.data.version));
    const a = { ...first.data, [field]: "Edición A" };
    const b = { ...first.data, [field]: "Edición B" };
    const results = await Promise.all([admin(route, "PUT", a), admin(route, "PUT", b)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409], route);
    const saved = results.find((r) => r.status === 200).data;
    assert.ok(saved.version > first.data.version);
    assert.equal(results.find((r) => r.status === 409).data.code, "EDIT_CONFLICT");
    assert.equal((await admin(route)).data[field], saved[field]);
    const { version, ...missing } = saved;
    assert.equal((await admin(route, "PUT", missing)).status, 428);
    assert.equal((await admin(route, "PUT", { ...saved, version: "1" })).status, 428);
    assert.equal(
      (await admin(route, "PUT", { ...first.data, version: saved.version })).status,
      200,
    );
  }
});

test("F07 · la edición propia y los cambios indirectos tampoco permiten pisar versiones", async () => {
  const request = client();
  assert.equal(
    (await request("/auth/signin", "POST", { usuario: "urucp1", password: "urucp1" })).status,
    200,
  );
  const before = (await request("/owners/own-seed-1")).data;
  db.prepare("UPDATE owners SET name=? WHERE id=?").run("Cambio externo", before.id);
  const stale = await request(`/owners/${before.id}`, "PUT", {
    ...before,
    name: "Formulario viejo",
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal((await request(`/owners/${before.id}`)).data.name, "Cambio externo");
  const missing = { ...before };
  delete missing.version;
  assert.equal((await request(`/owners/${before.id}`, "PUT", missing)).status, 428);
  const current = (await request(`/owners/${before.id}`)).data;
  assert.equal(
    (await request(`/owners/${before.id}`, "PUT", { ...before, version: current.version })).status,
    200,
  );
});

test("F07 · propietario y porcentajes se guardan juntos y rechazan inmuebles obsoletos", async () => {
  const before = (await admin("/owners/own-seed-2")).data;
  const property = (await admin(`/properties/${before.propertyIds[0]}`)).data;
  const share = { propertyId: property.id, version: property.version, percentage: 50 };
  db.prepare("UPDATE properties SET address=? WHERE id=?").run("Domicilio cambiado", property.id);
  const stale = await admin(`/owners/${before.id}`, "PUT", {
    ...before,
    name: "No guardar",
    propertyShares: [share],
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal((await admin(`/owners/${before.id}`)).data.name, before.name);
  const currentProperty = (await admin(`/properties/${property.id}`)).data;
  const saved = await admin(`/owners/${before.id}`, "PUT", {
    ...before,
    name: "Guardado atómico",
    propertyShares: [{ ...share, version: currentProperty.version }],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal((await admin(`/properties/${property.id}`)).data.ownerPercentages[before.id], 50);
  const invalid = await admin(`/owners/${before.id}`, "PUT", {
    ...saved.data,
    name: "No guardar",
    propertyShares: [
      {
        ...share,
        version: (await admin(`/properties/${property.id}`)).data.version,
        percentage: 101,
      },
    ],
  });
  assert.equal(invalid.status, 400);
  assert.equal((await admin(`/owners/${before.id}`)).data.name, "Guardado atómico");
});

test("F10 · más de 40 accesos válidos comparten IP sin agotar el cupo", async () => {
  const request = client();
  for (let i = 0; i < 45; i++) {
    const response = await request("/auth/signin", "POST", {
      usuario: "super_admin",
      password: "super_admin",
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
  }
  for (let i = 0; i < 15; i++)
    assert.equal(
      (
        await request("/auth/signin", "POST", {
          usuario: "vecino-inexistente-f10",
          password: "fallo",
        })
      ).status,
      401,
    );
  const limited = await request("/auth/signin", "POST", {
    usuario: "vecino-inexistente-f10",
    password: "fallo",
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  // Otra identidad y otra operación siguen funcionando desde la misma red.
  assert.equal(
    (await request("/auth/signin", "POST", { usuario: "urucp1", password: "urucp1" })).status,
    200,
  );
  assert.equal((await request("/auth/sso", "POST")).status, 503);
  assert.equal((await request("/auth/logout", "POST")).status, 200);
});

test("F07 · desvincular un inmueble comprueba su versión antes de modificar relaciones", async () => {
  const owner = (await admin("/owners/own-seed-2")).data;
  const property = (await admin(`/properties/${owner.propertyIds[0]}`)).data;
  db.prepare("UPDATE properties SET address=? WHERE id=?").run(
    "Cambio durante la edición",
    property.id,
  );
  const response = await admin(`/owners/${owner.id}`, "PUT", {
    ...owner,
    propertyIds: [],
    propertyShares: [],
    propertyVersions: { [property.id]: property.version },
  });
  assert.equal(response.status, 409, JSON.stringify(response.data));
  assert.deepEqual((await admin(`/owners/${owner.id}`)).data.propertyIds, owner.propertyIds);
  assert.ok((await admin(`/properties/${property.id}`)).data.ownerIds.includes(owner.id));
});

test("censo: contactos de comunidad verificados persisten, cambiar el valor exige un reto propio", async () => {
  const created = await admin("/communities", "POST", {
    id: "com-census-check",
    name: "Asociación censo",
    nif: "G00000000",
    address: "Calle de prueba 1",
    city: "Madrid",
    legalConfig: { regimen: "asociacion" },
    phone: "600123477",
    email: "censo@example.com",
    phoneVerified: true,
    emailVerified: true,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.phoneVerified, false);
  assert.equal(created.data.emailVerified, false);
  db.prepare(
    "UPDATE communities SET phoneVerified=1, emailVerified=1, phoneVerifiedAt='2026-11-26', emailVerifiedAt='2026-11-26' WHERE id=?",
  ).run(created.data.id);
  const original = (await admin("/communities/com-census-check")).data;
  const preserved = await admin("/communities/com-census-check", "PUT", {
    ...original,
    name: "Asociación actualizada",
  });
  assert.equal(preserved.status, 200, JSON.stringify(preserved.data));
  assert.equal(preserved.data.phoneVerified, true);
  assert.equal(preserved.data.emailVerified, true);
  const changed = await admin("/communities/com-census-check", "PUT", {
    ...preserved.data,
    phone: "600123466",
    phoneVerified: true,
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(changed.data.phoneVerified, false);
  assert.equal(changed.data.phoneVerifiedAt, "");
  assert.equal(changed.data.emailVerified, true);
  const challengeId = crypto.randomUUID(),
    now = Date.now();
  db.prepare(
    "INSERT INTO contact_verification_challenges(id,tipo,destino,codigo,createdAt,expiresAt) VALUES(?,?,?,?,?,?)",
  ).run(
    challengeId,
    "phone",
    "600123466",
    crypto.createHash("sha256").update("123456").digest("hex"),
    now,
    now + 60000,
  );
  const confirmed = await admin("/owners/contact/phone/confirm", "POST", {
    challengeId,
    code: "123456",
  });
  assert.equal(confirmed.status, 200);
  const verified = await admin("/communities/com-census-check", "PUT", {
    ...changed.data,
    phoneVerified: true,
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  assert.equal(verified.data.phoneVerified, true);
  assert.ok(verified.data.phoneVerifiedAt);
  assert.ok(
    db.prepare("SELECT consumedAt FROM contact_verification_challenges WHERE id=?").get(challengeId)
      .consumedAt,
  );
});

test("censo: una asociación conserva referencias catastrales compartidas entre subparcelas", async () => {
  for (const id of ["census-subplot-1", "census-subplot-2"]) {
    db.prepare(
      "INSERT INTO properties(id,communityId,plot,propertyType,address,city) VALUES(?, 'com-census-check', ?, 'vivienda', 'Camino de prueba', 'Madrid')",
    ).run(id, id);
    const property = (await admin("/properties/" + id)).data;
    const saved = await admin("/properties/" + id, "PUT", {
      ...property,
      cadastralRef: "28055A013000540001WL",
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.cadastralRef, "28055A013000540001WL");
  }
});

test("parcelas: agrupa unidades de la misma finca y bloquea referencias de otra comunidad", async () => {
  const reference = "06011A012002450000QE";
  db.prepare(
    "INSERT INTO communities(id,name,nif,legalConfig) VALUES('com-parcel-test','Parcelas Test','G00000002','{\"regimen\":\"lph\"}')",
  ).run();
  const insert = db.prepare(
    "INSERT INTO properties(id,communityId,communityName,plot,propertyType,address,city,participationCoef) VALUES(?,?,'Parcelas Test',?,'vivienda','Calle Parcela 1','Madrid','50')",
  );
  insert.run("prop-parcel-a", "com-parcel-test", "Unidad A");
  insert.run("prop-parcel-b", "com-parcel-test", "Unidad B");
  db.prepare(
    "INSERT INTO properties(id,communityId,communityName,plot,propertyType,address,city,participationCoef) VALUES('prop-parcel-other','com-seed-2','Edificio Los Olivos','Unidad ajena','vivienda','Calle Otra 1','Madrid','0.1000')",
  ).run();
  let relocatedParcelId = "";
  try {
    const a = (await admin("/properties/prop-parcel-a")).data;
    const savedA = await admin("/properties/prop-parcel-a", "PUT", {
      ...a,
      cadastralRef: reference,
    });
    assert.equal(savedA.status, 200, JSON.stringify(savedA.data));
    assert.ok(savedA.data.parcelId);

    const b = (await admin("/properties/prop-parcel-b")).data;
    const savedB = await admin("/properties/prop-parcel-b", "PUT", {
      ...b,
      cadastralRef: reference,
    });
    assert.equal(savedB.status, 200, JSON.stringify(savedB.data));
    assert.equal(savedB.data.parcelId, savedA.data.parcelId);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM parcels WHERE communityId='com-parcel-test'").get().n,
      1,
    );

    // Una unidad nueva puede colgar de una parcela existente sin repetir la
    // referencia: el servidor la deriva de la parcela.
    const reused = await admin("/properties/prop-parcel-b", "PUT", {
      ...savedB.data,
      cadastralRef: "",
      parcelId: savedA.data.parcelId,
    });
    assert.equal(reused.status, 200, JSON.stringify(reused.data));
    assert.equal(reused.data.cadastralRef, reference);
    assert.equal(reused.data.parcelId, savedA.data.parcelId);

    const other = (await admin("/properties/prop-parcel-other")).data;
    const crossCommunity = await admin("/properties/prop-parcel-other", "PUT", {
      ...other,
      cadastralRef: reference,
    });
    assert.equal(crossCommunity.status, 400);
    assert.match(crossCommunity.data.error, /otra comunidad/i);

    const invalidChecksum = await admin("/properties/prop-parcel-b", "PUT", {
      ...savedB.data,
      parcelId: "",
      cadastralRef: "9872023VH5797S0001AA",
    });
    assert.equal(invalidChecksum.status, 400);
    assert.match(invalidChecksum.data.error, /control/i);

    assert.equal((await admin("/properties/prop-parcel-a", "DELETE")).status, 200);
    assert.ok(
      db.prepare("SELECT 1 FROM parcels WHERE id=?").get(savedA.data.parcelId),
      "la parcela debe sobrevivir mientras tenga unidades",
    );
    assert.equal((await admin("/properties/prop-parcel-b", "DELETE")).status, 200);
    assert.equal(
      db.prepare("SELECT 1 FROM parcels WHERE id=?").get(savedA.data.parcelId),
      undefined,
      "la última unidad elimina la parcela",
    );

    // Un traslado con el objeto completo no arrastra la referencia de origen.
    db.prepare(
      "INSERT INTO properties(id,communityId,communityName,plot,propertyType,address,city,participationCoef) VALUES('prop-parcel-move','com-parcel-test','Parcelas Test','Unidad trasladada','vivienda','Calle Parcela 2','Madrid','50')",
    ).run();
    const moving = (await admin("/properties/prop-parcel-move")).data;
    const located = await admin("/properties/prop-parcel-move", "PUT", {
      ...moving,
      cadastralRef: "7837301VG8173B0001TT",
    });
    assert.equal(located.status, 200, JSON.stringify(located.data));
    const moved = await admin("/properties/prop-parcel-move", "PUT", {
      ...located.data,
      communityId: "com-seed-2",
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.data));
    assert.equal(moved.data.cadastralRef, "");
    assert.equal(moved.data.parcelId, "");
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM parcels WHERE communityId='com-parcel-test'").get().n,
      0,
      "el traslado no deja una parcela huérfana en el origen",
    );
    // Ya en la comunidad destino, la ficha adopta una referencia del censo nuevo
    // y su finca matriz se crea allí, no en el origen.
    const relocated = await admin("/properties/prop-parcel-move", "PUT", {
      ...moved.data,
      cadastralRef: "7837301VG8173B0001TT",
    });
    assert.equal(relocated.status, 200, JSON.stringify(relocated.data));
    relocatedParcelId = relocated.data.parcelId;
    assert.ok(relocatedParcelId);
    assert.equal(
      db.prepare("SELECT communityId FROM parcels WHERE id=?").get(relocatedParcelId).communityId,
      "com-seed-2",
    );
  } finally {
    db.prepare(
      "DELETE FROM properties WHERE id IN ('prop-parcel-a','prop-parcel-b','prop-parcel-other','prop-parcel-move')",
    ).run();
    db.prepare("DELETE FROM parcels WHERE communityId='com-parcel-test'").run();
    if (relocatedParcelId) db.prepare("DELETE FROM parcels WHERE id=?").run(relocatedParcelId);
    db.prepare("DELETE FROM communities WHERE id='com-parcel-test'").run();
  }
});
test("parcelas: un fallo a mitad del traslado revierte comunidad, referencia y parcela", async () => {
  db.prepare(
    "INSERT INTO communities(id,name,nif,legalConfig) VALUES('com-parcel-rollback','Parcelas Rollback','G00000004','{\"regimen\":\"lph\"}')",
  ).run();
  db.prepare(
    "INSERT INTO properties(id,communityId,communityName,plot,propertyType,address,city,participationCoef) VALUES('prop-parcel-rollback','com-parcel-rollback','Parcelas Rollback','Unidad con rollback','vivienda','Calle Rollback 1','Madrid','50')",
  ).run();
  try {
    const origin = (await admin("/properties/prop-parcel-rollback")).data;
    const located = await admin("/properties/prop-parcel-rollback", "PUT", {
      ...origin,
      cadastralRef: "06011A012002450000QE",
    });
    assert.equal(located.status, 200, JSON.stringify(located.data));
    assert.ok(located.data.parcelId);
    // Falla después de guardar la ficha: el traslado debe revertirse entero.
    db.exec(`CREATE TRIGGER parcel_transfer_failure AFTER UPDATE ON properties
      WHEN NEW.id='prop-parcel-rollback' AND NEW.communityId <> OLD.communityId
      BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END`);
    const failed = await admin("/properties/prop-parcel-rollback", "PUT", {
      ...located.data,
      communityId: "com-seed-2",
    });
    assert.equal(failed.status, 500, JSON.stringify(failed.data));
    const after = db
      .prepare("SELECT communityId,cadastralRef,parcelId FROM properties WHERE id='prop-parcel-rollback'")
      .get();
    assert.equal(after.communityId, "com-parcel-rollback");
    assert.equal(after.cadastralRef, "06011A012002450000QE");
    assert.equal(after.parcelId, located.data.parcelId);
    assert.ok(db.prepare("SELECT 1 FROM parcels WHERE id=?").get(located.data.parcelId));
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS n FROM parcels WHERE communityId='com-seed-2' AND cadastralRef=?")
        .get("06011A012002450000QE").n,
      0,
      "el fallo no deja una parcela en la comunidad destino",
    );
  } finally {
    db.exec("DROP TRIGGER IF EXISTS parcel_transfer_failure");
    db.prepare("DELETE FROM properties WHERE id='prop-parcel-rollback'").run();
    db.prepare("DELETE FROM parcels WHERE communityId='com-parcel-rollback'").run();
    db.prepare("DELETE FROM communities WHERE id='com-parcel-rollback'").run();
  }
});

test("censo: normaliza DNI sin ceros iniciales al guardar y conserva su letra", async () => {
  const created = await admin("/owners", "POST", {
    id: "owner-census-dni",
    name: "Prueba",
    surname: "Censo",
    dni: "2819736-M",
    documentType: "DNI",
    email: "dni@example.com",
    phone: "600123455",
    address: "Calle de prueba 1",
    city: "Madrid",
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.dni, "02819736M");
  const rejected = await admin("/owners/owner-census-dni", "PUT", {
    ...created.data,
    dni: "22462593X",
  });
  assert.equal(rejected.status, 400);
});
