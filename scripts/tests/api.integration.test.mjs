import { test, before, after } from "node:test";
import assert from "node:assert/strict";
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
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const type = response.headers.get("content-type") || "";
    return {
      status: response.status,
      data: type.includes("application/json")
        ? await response.json()
        : await response.text(),
      cookie: setCookie,
    };
  };
}
before(async () => {
  const app = express();
  app.use(express.json({ limit: "60mb" }));
  app.use("/api", router);
  app.use((error, _req, res, _next) =>
    res.status(500).json({ error: error.message }),
  );
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
    (
      await request(
        "/admin/settings",
        "PUT",
        {},
        { Origin: "https://example.invalid" },
      )
    ).status,
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
test("copropietarios: el alta conserva titulares y porcentajes coherentes", async () => {
  const result = await admin("/owners", "POST", {
    name: "Copropietario",
    surname: "Prueba",
    dni: "00000000T",
    email: "copropietario@example.test",
    propertyIds: ["prop-seed-1"],
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
test("inquilinos: varios contratos no se sobrescriben y se conserva userId", async () => {
  const payload = {
    ownerId: "own-seed-1",
    propertyId: "prop-seed-1",
    name: "Inquilino",
    surname: "Prueba",
    phone: "600000000",
    email: "tenant@example.test",
    contractStart: "2020-01-01",
    contractEnd: "",
  };
  for (const id of ["api-tenant-1", "api-tenant-2"])
    assert.equal(
      (await admin("/tenants", "POST", { ...payload, id })).status,
      201,
    );
  let property = (await admin("/properties/prop-seed-1")).data;
  assert.ok(property.tenantIds.includes("api-tenant-1"));
  assert.ok(property.tenantIds.includes("api-tenant-2"));
  await admin("/tenants/api-tenant-1", "PUT", {
    ...payload,
    userId: "user-urusp1",
  });
  assert.equal(
    (await admin("/tenants/api-tenant-1", "PUT", payload)).data.userId,
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
test("inmuebles: propietarios e inquilinos deben pertenecer a la comunidad", async () => {
  const property = (await admin("/properties/prop-seed-3")).data;
  const crossOwner = await admin("/properties/prop-seed-3", "PUT", {
    ...property,
    ownerIds: ["own-seed-3"],
    ownerPercentages: { "own-seed-3": 100 },
    tenantIds: [],
    participationCoef: "1.0000",
    cadastralRef: "",
  });
  assert.equal(crossOwner.status, 400);
  assert.match(crossOwner.data.error, /comunidad del inmueble/i);

  db.prepare(
    "INSERT INTO tenants (id, ownerId, propertyId, name, surname) VALUES (?, ?, ?, ?, ?)"
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
    const target = users.find(u => u.rol === role);
    assert.ok(target, `falta la cuenta ${role}`);
    assert.equal((await admin(`/admin/users/${target.id}`, "DELETE")).status, 409);
    assert.equal(
      (await admin(`/admin/users/${target.id}`, "PUT", { activo: false })).status,
      409,
    );
    assert.equal(
      (await admin(`/admin/users/${target.id}`, "PUT", { rol: "user" })).status,
      409,
    );
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
    (await admin(`/admin/users/${userId}/link-tenant`, "PUT", { tenantId: "ten-perfil-vinculado" })).status,
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
  assert.equal(
    (await admin(`/admin/roles/${role.data.id}`, "DELETE")).status,
    409,
  );
  await admin(`/admin/roles/${role.data.id}`, "PUT", {
    nombre: "Renombrado",
    permisos: ["community:read", "community:create"],
  });
  assert.equal(
    (
      await request("/communities", "POST", {
        name: "Permitido",
        nif: "H12345674",
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
  assert.equal(
    (await owner("/owners/own-seed-1")).data.propertyId,
    before.propertyId,
  );
});
test("propietario: la administración persiste los datos LPH en la ficha", async () => {
  const before = (await admin("/owners/own-seed-2")).data;
  try {
    const changed = await admin("/owners/own-seed-2", "PUT", {
      ...before,
      votingRights: "suspended",
      legalRepresentative: "Apoderado de Prueba · 12345678Z",
      notificationPreference: "postal",
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.data));
    assert.equal(changed.data.votingRights, "suspended");
    assert.equal(
      changed.data.legalRepresentative,
      "Apoderado de Prueba · 12345678Z",
    );
    assert.equal(changed.data.notificationPreference, "postal");
    const saved = (await admin("/owners/own-seed-2")).data;
    assert.equal(saved.votingRights, "suspended");
    assert.equal(saved.legalRepresentative, "Apoderado de Prueba · 12345678Z");
    assert.equal(saved.notificationPreference, "postal");
  } finally {
    await admin("/owners/own-seed-2", "PUT", {
      ...before,
      votingRights: before.votingRights,
      legalRepresentative: before.legalRepresentative,
      notificationPreference: before.notificationPreference,
    });
  }
});
test("buzones: avisos persisten y solo el destinatario los puede marcar leídos", async () => {
  const n = await admin("/notifications/owner-notifications", "POST", {
    ownerId: "own-seed-1",
    title: "Aviso",
    message: "Prueba persistente",
  });
  assert.equal(n.status, 201);
  assert.ok(
    (await owner("/notifications/owner-notifications")).data.some(
      (row) => row.id === n.data.id,
    ),
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
    form.append(
      "files",
      new Blob([content], { type: "application/pdf" }),
      "file.pdf",
    );
    assert.equal((await admin("/documents", "POST", form)).status, 400);
    assert.deepEqual(readdirSync(UPLOADS_DIR).sort(), before);
  }
  const form = new FormData();
  form.append("entityType", "property");
  form.append("entityId", "prop-seed-1");
  form.append(
    "files",
    new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }),
    "valid.pdf",
  );
  const uploaded = await admin("/documents", "POST", form);
  assert.equal(uploaded.status, 201);
  assert.equal(
    (await admin(`/documents/${uploaded.data[0].id}`, "DELETE")).status,
    200,
  );
  assert.deepEqual(readdirSync(UPLOADS_DIR).sort(), before);
});
test("validaciones de servidor rechazan NIF y contacto inválidos", async () => {
  assert.equal(
    (
      await admin("/communities", "POST", {
        name: "Inválida",
        nif: "NO-VALIDO",
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
      })
    ).status,
    400,
  );
});
test("comunidades: el NIF se normaliza aunque venga con espacios, guiones o minúsculas", async () => {
  const created = await admin("/communities", "POST", {
    name: "Comunidad normalizada",
    nif: " h-33333337 ",
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.nif, "H33333337");
  assert.equal(
    (
      await admin("/communities", "POST", {
        name: "Duplicada",
        nif: "H 33333337",
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
      })
    ).status,
    400,
  );
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
      (await admin("/communities/com-seed-1", "PUT", { ...original, ...patch }))
        .status,
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
  });
  assert.equal(zero.status, 200);
  assert.equal(zero.data.reserveFund, "0");
  assert.equal(
    (await admin("/communities/com-seed-1", "PUT", original)).status,
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
    });
    assert.equal(plain.status, 200);
    assert.equal(plain.data.notes, "Texto plano");
  } finally {
    await admin("/communities/com-seed-1", "PUT", original);
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
  assert.equal((await admin("/admin/roles", "POST", { nombre: "auditor-tab", descripcion: "solo auditoría", permisos: ["audit:read"] })).status, 201);
  assert.equal((await admin("/admin/roles", "POST", { nombre: "sin-audit-tab", descripcion: "sin auditoría", permisos: ["community:read"] })).status, 201);
  assert.equal((await admin("/admin/users", "POST", { nombre: "Auditor", apellido: "Tab", usuario: "auditor-tab-1", password: "clave-auditoria-1", rol: "auditor-tab", activo: true })).status, 201);
  assert.equal((await admin("/admin/users", "POST", { nombre: "Sin", apellido: "Audit", usuario: "sin-audit-tab-1", password: "clave-sinaudito-1", rol: "sin-audit-tab", activo: true })).status, 201);
  const con = client();
  const sin = client();
  assert.equal((await con("/auth/signin", "POST", { usuario: "auditor-tab-1", password: "clave-auditoria-1" })).status, 200);
  assert.equal((await sin("/auth/signin", "POST", { usuario: "sin-audit-tab-1", password: "clave-sinaudito-1" })).status, 200);
  assert.equal((await con("/audit")).status, 200);
  assert.equal((await sin("/audit")).status, 403);
  assert.equal((await sin("/admin/users")).status, 403);
});

test("proveedores de comunicación: visible solo con el permiso admin:providers", async () => {
  assert.equal((await admin("/admin/roles", "POST", { nombre: "proveedor-tab", descripcion: "solo proveedores", permisos: ["admin:providers"] })).status, 201);
  assert.equal((await admin("/admin/roles", "POST", { nombre: "sin-proveedores", descripcion: "sin proveedores", permisos: ["community:read"] })).status, 201);
  assert.equal((await admin("/admin/users", "POST", { nombre: "Proveedor", apellido: "Tab", usuario: "proveedor-tab-1", password: "clave-proveedores-1", rol: "proveedor-tab", activo: true })).status, 201);
  assert.equal((await admin("/admin/users", "POST", { nombre: "Sin", apellido: "Proveedor", usuario: "sin-proveedor-1", password: "clave-sinprovee-1", rol: "sin-proveedores", activo: true })).status, 201);
  const con = client();
  const sin = client();
  assert.equal((await con("/auth/signin", "POST", { usuario: "proveedor-tab-1", password: "clave-proveedores-1" })).status, 200);
  assert.equal((await sin("/auth/signin", "POST", { usuario: "sin-proveedor-1", password: "clave-sinprovee-1" })).status, 200);
  assert.equal((await con("/communications/providers")).status, 200);
  assert.equal((await sin("/communications/providers")).status, 403);
  assert.equal((await sin("/communications/providers", "PUT", {})).status, 403);
});

test("propietario con inmueble con inquilino no se puede eliminar", async () => {
  const owners = (await admin("/owners")).data;
  const properties = (await admin("/properties")).data;
  const tenants = (await admin("/tenants")).data || [];
  const conInquilino = owners.find(o => properties.some(p => (p.ownerIds || []).includes(o.id) && tenants.some(t => t.propertyId === p.id)));
  if (conInquilino) {
    const res = await admin("/owners/" + conInquilino.id, "DELETE");
    assert.equal(res.status, 409);
    assert.match(res.data.error, /inquilino/i);
  }
  const sinVinculos = owners.find(o => !properties.some(p => (p.ownerIds || []).includes(o.id)) && !tenants.some(t => t.ownerId === o.id));
  if (sinVinculos) {
    const res = await admin("/owners/" + sinVinculos.id, "DELETE");
    assert.equal(res.status, 200);
  }
});

test("propietario sin inmuebles con inquilino antiguo se puede eliminar", async () => {
  const ownerId = "own-stale-test";
  const propertyId = "prop-stale-test";
  const tenantId = "ten-stale-test";
  db.prepare("INSERT INTO owners (id, name, surname, documentType, dni) VALUES (?, 'Sin', 'Inmuebles', 'DNI', '12345678Z')").run(ownerId);
  db.prepare("INSERT INTO properties (id, ownerIds, tenantIds) VALUES (?, '[]', '[]')").run(propertyId);
  db.prepare("INSERT INTO tenants (id, ownerId, propertyId, name, surname) VALUES (?, ?, ?, 'Inquilino', 'Antiguo')").run(tenantId, ownerId, propertyId);

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
  assert.equal(
    (await admin("/owners/own-seed-1", "PUT", { ...payload, documents }))
      .status,
    400,
  );
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
  assert.equal(settings.data.nombreAsociacion, "Asociación Peñarrubia");
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
    [
      { tenantAuthorizations: { "com-seed-1": [{ id: "zona", label: " " }] } },
      /nombre/,
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
        { id: "common_areas", label: "Acceso a zonas comunes" },
        { id: "custom_piscina", label: "Uso de la piscina" },
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
      { id: "common_areas", label: "Acceso a zonas comunes" },
      { id: "custom_piscina", label: "Uso de la piscina" },
    ],
  });
  assert.equal(saved.data.assessmentBeforeDays, 5);
  assert.equal(saved.data.assessmentEmail, true);
  assert.equal(saved.data.serviceBeforeDays, 4);
  assert.equal(saved.data.serviceRepeatDays, 2);
  assert.equal(saved.data.serviceEmail, true);
  assert.equal((await admin("/admin/settings", "PUT", {
    tenantAuthorizations: {},
    assessmentBeforeDays: 3,
    assessmentEmail: false,
    serviceBeforeDays: 3,
    serviceRepeatDays: 0,
    serviceEmail: false,
  })).status, 200);
});
test("configuración: registro y recuperación se pueden deshabilitar", async () => {
  assert.equal((await admin("/admin/settings", "PUT", { permitirRegistro: false, permitirRecuperacion: false })).status, 200);
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
  assert.equal((await admin("/admin/settings", "PUT", { permitirRegistro: true, permitirRecuperacion: true })).status, 200);
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
    many.append(
      "files",
      new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }),
      name,
    );
  assert.equal((await admin("/documents", "POST", many)).status, 400);
  assert.deepEqual(readdirSync(UPLOADS_DIR).sort(), before);
  const single = new FormData();
  single.append("entityType", "property");
  single.append("entityId", "prop-seed-1");
  single.append(
    "files",
    new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }),
    "valido.pdf",
  );
  const uploaded = await admin("/documents", "POST", single);
  assert.equal(uploaded.status, 201);
  assert.equal((await admin(`/documents/${uploaded.data[0].id}`, "DELETE")).status, 200);
  assert.equal((await admin("/admin/settings", "PUT", {
    documentosTiposPermitidos: ["pdf", "jpg", "jpeg", "png", "webp"],
    documentosMaxArchivos: 20,
  })).status, 200);
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
  assert.equal((await admin("/admin/settings", "PUT", {
    mantenimiento: false,
    mensajeMantenimiento: "La plataforma está en mantenimiento. Vuelve a intentar en unos minutos.",
  })).status, 200);
  assert.equal((await owner("/bootstrap")).status, 200);
});
test("roles de plataforma: editar super_admin no exige perfiles y desvincular no se bloquea", async () => {
  const platformAdmin = db.prepare("SELECT id FROM users WHERE usuario = 'super_admin'").get();
  const ownerRow = db.prepare("SELECT id FROM owners WHERE id = 'own-seed-1'").get();
  // Vincular un perfil a un rol de plataforma sigue rechazado.
  assert.equal(
    (await admin(`/admin/users/${platformAdmin.id}/link-owner`, "PUT", { ownerId: ownerRow.id })).status,
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
  form.append(
    "files",
    new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }),
    name,
  );
  return form;
}

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
  const listing = await admin(
    "/documents?entityType=community&entityId=com-seed-1",
  );
  assert.equal(listing.status, 200);
  assert.deepEqual(
    listing.data.folders.map((folder) => folder.name).sort(),
    ["2026", "Actas"],
  );
  assert.equal(listing.data.documents.length, 2);
  // Sin confirmación no se borra nada y se informan los recuentos.
  const blocked = await admin(
    `/documents/folders/${root.data.id}`,
    "DELETE",
  );
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.requiresConfirmation, true);
  assert.deepEqual(blocked.data.counts, { folders: 2, documents: 1 });
  const deleted = await admin(
    `/documents/folders/${root.data.id}?confirm=1`,
    "DELETE",
  );
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
  assert.equal(deleted.data.deletedFolders, 2);
  assert.equal(deleted.data.deletedDocuments, 1);
  // El documento que quedó en la raíz se elimina aparte.
  assert.equal(
    (await admin(`/documents/${rootDocument.data[0].id}`, "DELETE")).status,
    200,
  );
  assert.deepEqual(readdirSync(UPLOADS_DIR).sort(), before);
  assert.equal(
    (await admin("/documents?entityType=community&entityId=com-seed-1")).data
      .documents.length,
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
  const deleted = await admin(
    `/documents/folders/${created[0]}?confirm=1`,
    "DELETE",
  );
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.deletedFolders, 5);
  assert.equal(
    (await admin(`/documents/folders/${other.data.id}?confirm=1`, "DELETE"))
      .status,
    200,
  );
});

test("estatutos: sólo comunidades, sin carpetas y consulta para residentes", async () => {
  const before = readdirSync(UPLOADS_DIR).sort();
  const target = { entityType: "community", entityId: "com-seed-1" };
  const folder = await admin("/documents/folders", "POST", {
    ...target,
    name: "Temporal estatutos",
  });
  assert.equal(folder.status, 201);
  // Los estatutos no admiten carpetas.
  assert.equal(
    (
      await admin("/documents/folders", "POST", {
        ...target,
        category: "statutes",
        name: "Estatutos en carpeta",
      })
    ).status,
    400,
  );
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
    }),
  );
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const statute = uploaded.data[0];
  assert.equal(statute.category, "statutes");
  assert.equal(statute.folderId, "");
  assert.match(statute.url, /\/download$/);
  assert.match(statute.previewUrl, /\/preview$/);
  // Los residentes de la comunidad pueden consultarlos y descargarlos.
  const ownerListing = await owner(
    "/documents?entityType=community&entityId=com-seed-1&category=statutes",
  );
  assert.equal(ownerListing.status, 200);
  assert.ok(ownerListing.data.documents.some((doc) => doc.id === statute.id));
  assert.deepEqual(ownerListing.data.folders, []);
  const ownerPreview = await owner(`/documents/${statute.id}/preview`);
  assert.equal(ownerPreview.status, 200);
  assert.match(String(ownerPreview.data), /%PDF/);
  assert.equal(
    (await owner(`/documents/${statute.id}/download`)).status,
    200,
  );
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
  // Limpieza.
  assert.equal((await admin(`/documents/${statute.id}`, "DELETE")).status, 200);
  assert.equal(
    (await admin(`/documents/folders/${folder.data.id}?confirm=1`, "DELETE"))
      .status,
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
    (
      await communityAdmin(
        "/documents",
        "POST",
        pdfForm("community", "com-seed-2", "Ajeno.pdf"),
      )
    ).status,
    403,
  );
  assert.equal(
    (await communityAdmin(`/documents/folders/${ownFolder.data.id}?confirm=1`, "DELETE"))
      .status,
    200,
  );
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
  assert.equal(
    (await admin(`/documents/${uploaded.data[0].id}/preview`)).status,
    415,
  );
  assert.equal(
    (await admin(`/documents/${uploaded.data[0].id}/download`)).status,
    200,
  );
  assert.equal(
    (await admin(`/documents/${uploaded.data[0].id}`, "DELETE")).status,
    200,
  );
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
