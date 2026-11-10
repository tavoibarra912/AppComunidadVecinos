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
    return {
      status: response.status,
      data: await response.json(),
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
test("bootstrap: propietario e inquilino sólo reciben datos de sus perfiles", async () => {
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
test("protección del último superadministrador en borrado, baja y cambio de rol", async () => {
  const superAdmin = (await admin("/admin/users")).data.find(u => u.rol === "super_admin");
  assert.equal((await admin(`/admin/users/${superAdmin.id}`, "DELETE")).status, 409);
  assert.equal(
    (await admin(`/admin/users/${superAdmin.id}`, "PUT", { activo: false })).status,
    409,
  );
  assert.equal(
    (await admin(`/admin/users/${superAdmin.id}`, "PUT", { rol: "user" })).status,
    409,
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
    propertyIds: ["prop-seed-2"],
    documents: {
      ...before.documents,
      dni: { ...before.documents.dni, adminApproval: { status: "approved" } },
    },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.userId, "user-urucp1");
  assert.equal(changed.data.isMember, before.isMember);
  assert.notEqual(changed.data.documents.dni.adminApproval?.status, "approved");
  assert.equal(
    (await owner("/owners/own-seed-1")).data.propertyId,
    before.propertyId,
  );
});
test("buzones: avisos persisten y sólo el destinatario los puede marcar leídos", async () => {
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

test("proveedores de comunicación: visible sólo con el permiso admin:providers", async () => {
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

test("cambio de contraseña propio: valida la actual y cierra sólo las sesiones de esa cuenta", async () => {
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
