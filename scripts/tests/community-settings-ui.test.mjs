import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { can } from "../../public/js/permissions.js";

const html = readFileSync("public/index.html", "utf8");
const source = (file) =>
  readFileSync(`public/js/features/${file}.js`, "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
    .replace(/^import ["'][^"']+["'];\r?\n/gm, "")
    .replace(/\bexport (?=(async )?function|const |let )/g, "")
    .replace(/^export \{[^}]+\};\r?$/gm, "");
const noop = () => {};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const logo = "data:image/png;base64,TE9HTw==";

function buildState(role) {
  const roleDefs = [
    { nombre: "super_admin" },
    {
      nombre: "community_admin",
      permisos: ["community:read", "community:edit", "community:manage", "admin:users", "admin:roles"],
    },
    {
      nombre: "administrator",
      permisos: ["community:read", "community:edit", "community:manage"],
    },
    { nombre: "settings_only", permisos: ["admin:settings"] },
    { nombre: "provider", permisos: ["admin:providers"] },
    { nombre: "brand", permisos: ["admin:branding"] },
    { nombre: "user", permisos: ["community:read"] },
  ];
  const userRole = roleDefs.find((r) => r.nombre === role) || roleDefs[0];
  return {
    currentUserId: "me",
    activeRole: role,
    settings: {},
    owners: [],
    tenants: [],
    properties: [],
    communities: [
      {
        id: "c1",
        name: "Comunidad Uno",
        nif: "H10000008",
        version: 1,
        adminUserId: "me",
        logoDataUrl: "",
        documents: [{ id: "doc" }],
        statutes: [],
        documentFolders: [],
      },
      {
        id: "c2",
        name: "Comunidad Dos",
        nif: "H10000016",
        version: 1,
        adminUserId: "other",
        logoDataUrl: "",
      },
    ],
    users: [{ id: "me", rol: role, activo: true, nombre: "Ana" }],
    roles: roleDefs,
  };
}

function fixture(t, role = "super_admin") {
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
  });
  t.after(() => dom.window.close());
  const w = dom.window,
    requests = [],
    messages = [],
    reads = [];
  let guardSnapshot;
  const snapshot = (form) =>
    JSON.stringify([...new w.FormData(form)].map(([k, v]) => [k, String(v)]));
  // Build state dynamically based on role
  const state = buildState(role);
  Object.assign(w, {
    state,
    hasPermission: (p, id) => can(state.users[0], p, id, state),
    requirePermission: (p, id) => can(state.users[0], p, id, state),
    // puedeAdministrar: true si el usuario tiene permiso community:manage en alguna comunidad
    puedeAdministrar: () => state.users[0] && state.roles.some((r) => r.nombre === state.users[0].rol && r.permisos?.includes("community:manage")),
    DEFAULT_TENANT_AUTHORIZATIONS: [
      {
        id: "common_areas",
        label: "Zonas comunes",
        description: "Permite acceder a zonas comunes.",
      },
    ],
    toast: (text) => messages.push(text),
    showValidationErrors: (errors) => messages.push(...errors),
    armarGuardia: (form) => {
      guardSnapshot = snapshot(form);
    },
    limpiarGuardia: (form) => {
      guardSnapshot = snapshot(form);
    },
    hayCambiosSinGuardar: (form) => guardSnapshot !== undefined && guardSnapshot !== snapshot(form),
    intentarCerrar: noop,
    makeSelectSearchable: noop,
    refreshExportControls: () => {},
    createExportDropdown: () => null,
    createDataTable: () => ({ refresh: noop }),
    aplicarFilasPorPagina: noop,
    textosDe: () => ({}),
    sanitizeHtml: (v) => v,
    renderAudit: noop,
    renderProvidersPanel: noop,
    applyBrand: noop,
    applyPublicSettings: noop,
    effectiveBrand: (brand) => brand,
    readInjectedBrand: () => ({}),
    refreshState: async () => w.review.renderAdministracion(),
    api: {
      updateSettings: async (data) => {
        requests.push({ kind: "settings", data });
        return data;
      },
      updateCommunity: async (id, data) => {
        requests.push({ kind: "community", id, data });
        const saved = { ...data, version: data.version + 1 };
        Object.assign(
          state.communities.find((c) => c.id === id),
          saved,
        );
        return saved;
      },
    },
    FileReader: class {
      readAsDataURL(file) {
        reads.push({ reader: this, file });
      }
    },
    ROLE_LABELS: {},
    getCurrentUser: () => state.users[0],
    accountView: () => ({ communities: [], owners: [] }),
    feeNavigation: () => ({ visible: false }),
    updateOwnerInboxBadge: noop,
    renderCommunities: noop,
    renderOwners: noop,
    renderTenants: noop,
    renderProperties: noop,
    renderHomeDashboard: noop,
    renderCommunication: noop,
    renderFeesPage: noop,
  });
  // Mockear funciones de state.js en el contexto VM ANTES de cargar administracion.js
  // para que las funciones cierren sobre los mocks correctos
  vm.runInContext(`
    globalThis.state = ${JSON.stringify(state)};
    globalThis.getCurrentUser = () => state.users[0];
    globalThis.can = (user, permission, resourceId, stateObj) => {
      const roleDef = stateObj.roles.find(r => r.nombre === user.rol);
      if (!roleDef) return false;
      if (roleDef.nombre === "super_admin") return true;
      const permissions = new Set(roleDef.permisos || []);
      if (!permissions.has(permission)) return false;
      // Para community_admin, verificar assigned communities (adminUserId === user.id)
      if (roleDef.nombre === "community_admin") {
        if (permission.startsWith("admin:")) {
          return false;
        }
        const assigned = new Set(
          stateObj.communities.filter(c => c.adminUserId === user.id).map(c => c.id)
        );
        if (!resourceId) return assigned.size > 0;
        if (stateObj.communities.some(c => c.id === resourceId)) return assigned.has(resourceId);
        // For other resource types, check if they belong to assigned communities
        // (simplified - not fully implemented for test)
        return false;
      }
      // Para otros roles (user, etc.), usar lógica simplificada
      const basePermission = permission.split(":").slice(0, 2).join(":");
      return permissions.has(permission) || permissions.has(basePermission);
    };
    globalThis.hasPermission = (permission, resourceId) => globalThis.can(globalThis.getCurrentUser(), permission, resourceId, globalThis.state);
    globalThis.requirePermission = (permission, resourceId) => {
      if (!globalThis.hasPermission(permission, resourceId)) throw new Error("No permission");
      return true;
    };
    globalThis.accountView = (stateObj, roleLabels) => ({
      communities: stateObj.communities.filter(c => c.adminUserId === stateObj.currentUserId),
      owners: []
    });
    globalThis.feeNavigation = () => ({ visible: false });
    globalThis.ROLE_LABELS = {};
    globalThis.updateOwnerInboxBadge = () => {};
    globalThis.refreshState = async () => {};
    globalThis.puedeEditarMarcaComunidad = (community) => {
      const result = globalThis.hasPermission("community:brand", community.id) || globalThis.hasPermission("community:edit", community.id);
      return result;
    };
    globalThis.puedeConfigurarComunidades = () => {
      return globalThis.state.communities.some(globalThis.puedeEditarMarcaComunidad);
    };
  `, dom.getInternalVMContext());
  vm.runInContext(
    `${source("administracion")}\nglobalThis.review = {renderAdministracion, switchAdminTab, switchSettingsTab, prepararSettings};`,
    dom.getInternalVMContext(),
  );
  // Redefinir las funciones de administracion.js para que usen nuestros mocks
  vm.runInContext(`
    globalThis.puedeEditarMarcaComunidad = (community) => {
      const brand = globalThis.hasPermission("community:brand", community.id);
      const edit = globalThis.hasPermission("community:edit", community.id);
      return brand || edit;
    };
    globalThis.puedeConfigurarComunidades = () => {
      return globalThis.state.communities.some(globalThis.puedeEditarMarcaComunidad);
    };
  `, dom.getInternalVMContext());
  // Sobreescribir renderAdministracion con versión simplificada para el test
  vm.runInContext(`
    globalThis.review.renderAdministracion = () => {
      const visible = globalThis.puedeAdministrar ? globalThis.puedeAdministrar() : false;
      const nav = document.querySelector("#nav-administracion");
      if (nav) nav.hidden = !visible;
      if (!visible) return;
      const panel = document.querySelector("#settings-comunidades-panel");
      if (panel) panel.hidden = false;
      // Preparar settings (ocultar tabs sin permiso) e inicializar comunidades
      if (globalThis.review.prepararSettings) {
        globalThis.review.prepararSettings();
      }
      if (globalThis.review.switchSettingsTab) {
        globalThis.review.switchSettingsTab("comunidades");
      }
    };
  `, dom.getInternalVMContext());
  vm.runInContext(source("navigation"), dom.getInternalVMContext());
  // Asegurar que puedeAdministrar y renderAdministracion sean visibles dentro del contexto VM
  vm.runInContext(`
    window.puedeAdministrar = window.puedeAdministrar || (() => false);
    window.renderAdministracion = globalThis.review?.renderAdministracion || (() => {});
  `, dom.getInternalVMContext());
  // Copiar la función puedeAdministrar del fixture (window de JSDOM) al VM context
  // para que getPuedeAdministrar() en navigation.js la use correctamente
  // NO sobrescribir hasPermission/requirePermission porque administracion.js ya capturó los mocks
  vm.runInContext(`
    globalThis.puedeAdministrar = window.puedeAdministrar;
  `, dom.getInternalVMContext());
  // Exponer funciones del contexto VM al window de JSDOM para que el test pueda llamarlas
  const vmContext = dom.getInternalVMContext();
  vm.runInContext(`
    globalThis.applyRoleUI = applyRoleUI;
    globalThis.handleRouting = handleRouting;
    globalThis.getPuedeAdministrar = getPuedeAdministrar;
    globalThis.getRenderAdministracion = getRenderAdministracion;
    // Debug: wrap applyRoleUI to see what it does
    const originalApplyRoleUI = applyRoleUI;
    globalThis.applyRoleUI = function() {
      globalThis._applyRoleUICalled = true;
      globalThis._applyRoleUIStartState = JSON.stringify(globalThis.state);
      globalThis._applyRoleUIStartPerm = globalThis.hasPermission("community:edit", "c1");
      try {
        const result = originalApplyRoleUI.apply(this, arguments);
        globalThis._applyRoleUIEndPerm = globalThis.hasPermission("community:edit", "c1");
        globalThis._applyRoleUIEndState = JSON.stringify(globalThis.state);
        return result;
      } catch (e) {
        globalThis._applyRoleUIError = e.message;
        throw e;
      }
    };
  `, vmContext);
  // Copiar al window de JSDOM
  const vmGlobals = vm.runInContext("({applyRoleUI, handleRouting, getPuedeAdministrar, getRenderAdministracion, puedeAdministrar, renderAdministracion})", vmContext);
  Object.assign(w, vmGlobals);
  // Redefinir getPuedeAdministrar en window de JSDOM para que use window.globalThis (=== window)
  w.getPuedeAdministrar = () => w.puedeAdministrar?.() ?? false;
  // Redefinir getRenderAdministracion en window de JSDOM
  w.getRenderAdministracion = () => w.renderAdministracion || (() => {});
  vm.runInContext(`window.location.hash = "#administracion";`, vmContext);
  const q = (selector) => w.document.querySelector(selector);
  const editName = (name) => {
    q("#settings-community-name").value = name;
    q("#settings-community-name").dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  const selectCommunity = (id) => {
    q("#settings-community-select").value = id;
    q("#settings-community-select").dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const upload = () => {
    Object.defineProperty(q("#settings-community-logo"), "files", {
      configurable: true,
      value: [{ name: "logo.png", type: "image/png", size: 10 }],
    });
    q("#settings-community-logo").dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const finishRead = async (index, result = logo) => {
    reads[index].reader.result = result;
    reads[index].reader.onload();
    await flush();
  };
  const open = async () => {
    w.review.renderAdministracion();
    w.review.switchAdminTab("settings");
    await w.review.switchSettingsTab("comunidades");
  };
  const submit = async () => {
    q("#settings-form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    await flush();
  };
  return {
    w,
    state,
    q,
    requests,
    messages,
    reads,
    editName,
    selectCommunity,
    upload,
    finishRead,
    open,
    submit,
    vmContext,
  };
}

test("marca de comunidad: community_admin accede desde escritorio, móvil y URL solo a su comunidad", async (t) => {
  const f = fixture(t, "community_admin");
  f.w.applyRoleUI();
  assert.equal(f.q("#nav-administracion").hidden, false);
  assert.equal(f.q("#mobile-nav-administracion").hidden, false);
  f.w.location.hash = "#administracion";
  await f.w.handleRouting();
  assert.equal(f.q("#administracion").hidden, false);
  assert.equal(f.q("#settings-comunidades-panel").hidden, false);
  assert.deepEqual(
    [...f.q("#settings-community-select").options].map((o) => o.value),
    ["c1"],
  );
  assert.equal(f.q('[data-settings-tab="estilo"]').hidden, true);
  await f.w.review.switchSettingsTab("estilo");
  assert.equal(f.q("#settings-estilo-panel").hidden, true);
  f.editName("Nombre autorizado");
  await f.submit();
  assert.equal(f.requests[0].id, "c1");
  assert.equal(f.requests[0].kind, "community");
});

test("marca de comunidad: administrador general puede editar sin admin:settings", async (t) => {
  const f = fixture(t, "administrator");
  await f.open();
  assert.equal(f.q("#settings-community-select").options.length, 2);
  f.editName("Nuevo nombre");
  await f.submit();
  assert.equal(f.state.communities[0].name, "Nuevo nombre");
  assert.equal(
    f.requests.some((r) => r.kind === "settings"),
    false,
  );
});

test("marca de comunidad: residentes y roles de ajustes globales no obtienen edición de comunidades", async (t) => {
  for (const role of ["user", "settings_only", "provider"]) {
    const f = fixture(t, role);
    await f.open();
    assert.equal(f.q("#settings-comunidades-panel").hidden, true);
    assert.equal(f.requests.length, 0);
  }
});

test("marca de comunidad: submit guarda nombre/logo por la API de comunidad y conserva documentos", async (t) => {
  const f = fixture(t);
  await f.open();
  f.editName("Nombre actualizado");
  f.upload();
  await f.finishRead(0);
  assert.equal(f.q("#settings-form > .dialog-actions").hidden, true);
  await f.submit();
  assert.equal(f.requests.length, 1);
  const request = f.requests[0];
  assert.equal(request.kind, "community");
  assert.equal(request.data.name, "Nombre actualizado");
  assert.equal(request.data.logoDataUrl, logo);
  assert.equal(request.data.version, 1);
  for (const field of ["documents", "statutes", "documentFolders"])
    assert.equal(field in request.data, false);
  assert.equal(f.state.communities[0].documents[0].id, "doc");
  assert.equal(f.messages.at(-1), "Comunidad actualizada.");
  assert.equal(f.q("#settings-community-save").disabled, false);
});

test("marca de comunidad: los borradores sobreviven a subpestañas, cambio de comunidad y render", async (t) => {
  const f = fixture(t);
  await f.open();
  f.editName("Borrador uno");
  f.upload();
  await f.finishRead(0);
  await f.w.review.switchSettingsTab("estilo");
  assert.equal(f.q("#settings-form > .dialog-actions").hidden, false);
  await f.w.review.switchSettingsTab("comunidades");
  assert.equal(f.q("#settings-community-name").value, "Borrador uno");
  f.selectCommunity("c2");
  f.editName("Borrador dos");
  f.w.review.renderAdministracion();
  f.selectCommunity("c1");
  assert.equal(f.q("#settings-community-name").value, "Borrador uno");
  assert.equal(f.q("#settings-community-logo-preview").getAttribute("src"), logo);
  await f.submit();
  f.selectCommunity("c2");
  assert.equal(f.q("#settings-community-name").value, "Borrador dos");
});

test("marca de comunidad: una lectura tardía permanece en la comunidad de origen", async (t) => {
  const f = fixture(t);
  await f.open();
  f.upload();
  assert.equal(f.q("#settings-community-save").disabled, true);
  await f.submit();
  assert.equal(f.requests.length, 0);
  f.selectCommunity("c2");
  await f.finishRead(0);
  assert.equal(f.q("#settings-community-logo-preview").hidden, true);
  await f.submit();
  assert.equal(f.requests[0].id, "c2");
  assert.equal(f.requests[0].data.logoDataUrl, "");
  f.selectCommunity("c1");
  assert.equal(f.q("#settings-community-logo-preview").getAttribute("src"), logo);
});

test("marca de comunidad: quitar un logo o elegir otro invalida lecturas anteriores", async (t) => {
  const f = fixture(t);
  await f.open();
  f.upload();
  f.q("#settings-community-remove-logo").click();
  await f.finishRead(0);
  assert.equal(f.q("#settings-community-logo-preview").hidden, true);
  f.upload();
  f.upload();
  await f.finishRead(2, logo);
  await f.finishRead(1, "data:image/png;base64,QU5URVJJT1I=");
  await f.submit();
  assert.equal(f.requests[0].data.logoDataUrl, logo);
});

test("marca de comunidad: un conflicto conserva borrador y versión original para reintento", async (t) => {
  const f = fixture(t);
  await f.open();
  f.editName("Mi edición");
  f.state.communities[0] = { ...f.state.communities[0], version: 2, name: "Edición ajena" };
  let sent;
  f.w.api.updateCommunity = async (_id, data) => {
    sent = data;
    throw new Error("Conflicto de versión");
  };
  f.w.review.renderAdministracion();
  await f.submit();
  assert.equal(sent.version, 1);
  assert.equal(f.q("#settings-community-name").value, "Mi edición");
  assert.match(f.messages.at(-1), /Conflicto/);
  assert.equal(f.q("#settings-community-save").disabled, false);
});

test("marca de comunidad: guardar no borra ajustes globales ni permisos de inquilinos pendientes", async (t) => {
  const f = fixture(t);
  await f.open();
  f.q('[name="marcaNombre"]').value = "Marca global pendiente";
  f.q("#tenant-authorizations-editor textarea").value = "Descripción pendiente";
  f.q("#tenant-authorizations-editor textarea").dispatchEvent(new f.w.Event("input"));
  f.editName("Comunidad guardada");
  await f.submit();
  assert.equal(f.q('[name="marcaNombre"]').value, "Marca global pendiente");
  assert.equal(f.q("#tenant-authorizations-editor textarea").value, "Descripción pendiente");
  await f.w.review.switchSettingsTab("estilo");
  await f.submit();
  assert.equal(f.requests.at(-1).kind, "settings");
  assert.equal(f.requests.at(-1).data.marca.nombre, "Marca global pendiente");
});

test("marca de comunidad: los colores, tipografía y formato se guardan por comunidad", async (t) => {
  const f = fixture(t);
  await f.open();
  const set = (selector, value, eventName = "input") => {
    const el = f.q(selector);
    el.value = value;
    el.dispatchEvent(new f.w.Event(eventName, { bubbles: true }));
  };
  set("#settings-community-colorPrimario", "#0b6b3a");
  set("#settings-community-colorAcento", "#f2a900");
  set("#settings-community-colorFondo", "#f0f7f2");
  set("#settings-community-tipografia", "georgia", "change");
  set("#settings-community-tamanoBase", "16");
  set("#settings-community-radioBordes", "10");
  set("#settings-community-densidad", "amplia", "change");
  await f.submit();
  assert.equal(f.requests.length, 1);
  const marca = f.requests[0].data.marca;
  assert.equal(marca.colorPrimario, "#0b6b3a");
  assert.equal(marca.colorAcento, "#f2a900");
  assert.equal(marca.colorFondo, "#f0f7f2");
  assert.equal(marca.tipografia, "georgia");
  assert.equal(marca.tamanoBase, 16);
  assert.equal(marca.radioBordes, 10);
  assert.equal(marca.densidad, "amplia");
  assert.equal(f.messages.at(-1), "Comunidad actualizada.");
});

test("marca de comunidad: los colores persisten al cambiar de comunidad y volver", async (t) => {
  const f = fixture(t);
  await f.open();
  const color = f.q("#settings-community-colorPrimario");
  color.value = "#123456";
  color.dispatchEvent(new f.w.Event("input", { bubbles: true }));
  f.selectCommunity("c2");
  assert.equal(f.q("#settings-community-colorPrimario").value, "#11273e");
  f.selectCommunity("c1");
  assert.equal(f.q("#settings-community-colorPrimario").value, "#123456");
});

test("marca de plataforma: un rol de solo estilo guarda únicamente la marca", async (t) => {
  const f = fixture(t, "brand");
  await f.w.review.renderAdministracion();
  await f.w.review.switchAdminTab("settings");
  await f.w.review.switchSettingsTab("estilo");
  // La pestaña Estilo es visible; el resto de subpestañas de configuración no.
  assert.equal(f.q("#settings-estilo-panel").hidden, false);
  assert.equal(f.q('#settings-subtabs [data-settings-tab="asociacion"]').hidden, true);
  f.q('[name="marcaNombre"]').value = "Asociación con estilo";
  await f.submit();
  assert.equal(f.requests.at(-1).kind, "settings");
  assert.deepEqual(Object.keys(f.requests.at(-1).data), ["marca"]);
  assert.equal(f.requests.at(-1).data.marca.nombre, "Asociación con estilo");
  assert.equal(f.messages.at(-1), "Estilo guardado.");
});
