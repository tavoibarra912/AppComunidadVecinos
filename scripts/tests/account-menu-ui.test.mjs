import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { accountView } from "../../public/js/account-view.js";

const source = (file) =>
  readFileSync(`public/js/${file}`, "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
    .replace(/\bexport (?=(async )?function)/g, "");
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

function fixture(existingSession) {
  const dom = new JSDOM(readFileSync("public/index.html", "utf8"), {
    url: "http://localhost/",
    runScripts: "outside-only",
  });
  const w = dom.window,
    listeners = [],
    requests = [];
  const user = { id: "me", usuario: "ana", nombre: "Ana", email: "ana@example.test", rol: "user" };
  let authenticated = existingSession;
  const state = {
    currentUserId: null,
    activeRole: "owner",
    users: [],
    roles: [],
    owners: [],
    tenants: [],
    communities: [],
    properties: [],
    settings: {},
    loading: {},
  };
  const noop = () => {};
  Object.assign(w, {
    state,
    accountView,
    ROLE_LABELS: { owner: "Propietario" },
    hasPermission: () => true,
    getCurrentUser: () => state.users.find((entry) => entry.id === state.currentUserId),
    api: {
      getCurrentUser: async () => {
        if (!authenticated) throw Object.assign(new Error("Sin sesión"), { status: 401 });
        return user;
      },
      auth: async (operation) => {
        requests.push(operation);
        if (operation === "signin") authenticated = true;
        if (operation === "logout") authenticated = false;
        return user;
      },
    },
    refreshState: async () => {
      state.users = [user];
      state.currentUserId = user.id;
      await Promise.all(listeners.map((listener) => listener()));
    },
    clearSession: () => {
      state.users = [];
      state.currentUserId = null;
    },
    onDataChanged: (listener) => listeners.push(listener),
    subscribe: noop,
    loadLocations: noop,
    intentarCerrar: noop,
    limpiarGuardia: noop,
    toast: noop,
    installSearchableSelects: noop,
    installTooltips: noop,
    installSidebarCollapse: noop,
    applyBrand: noop,
    applyPublicSettings: noop,
    effectiveBrand: noop,
    readInjectedBrand: noop,
    renderHomeDashboard: noop,
    applyRoleUI: noop,
    renderUserSelector: noop,
    handleRouting: noop,
    navigateToSection: noop,
    openOwnerDetail: noop,
    openTenantDetail: noop,
  });
  const context = dom.getInternalVMContext();
  Object.assign(
    w,
    vm.runInContext(
      `(()=>{${source("features/auth.js")}\nreturn {showLoginView,hideLoginScreen,showRecoveryFromLink};})()`,
      context,
    ),
  );
  w.__importFeature = async (path) =>
    path === "./features/account-menu.js"
      ? vm.runInContext(
          `(()=>{${source("features/account-menu.js")}\nreturn {renderAccountMenu};})()`,
          context,
        )
      : {};
  vm.runInContext(source("main.js").replace(/\bimport\(/g, "__importFeature("), context);
  return { dom, w, requests, state };
}

for (const existingSession of [false, true])
  test(`menú de cuenta: abre y cierra sesión desde el arranque ${existingSession ? "con sesión existente" : "sin sesión"}`, async () => {
    const f = fixture(existingSession);
    try {
      await flush();
      const { document, Event, KeyboardEvent } = f.w;
      if (!existingSession) {
        const form = document.querySelector("#login-signin-form");
        form.elements.usuario.value = "ana";
        form.elements.password.value = "password-de-prueba";
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await flush();
      }
      assert.equal(document.querySelector("#login-screen").hidden, true);
      const toggle = document.querySelector("#user-menu-toggle");
      const menu = document.querySelector("#user-menu");
      toggle.click();
      assert.equal(menu.hidden, false);
      assert.equal(toggle.getAttribute("aria-expanded"), "true");
      assert.equal(document.querySelector("#user-menu-name").textContent, "Ana");
      assert.equal(document.activeElement.id, "account-menu-profile");
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      assert.equal(menu.hidden, true);
      assert.equal(document.activeElement, toggle);
      toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      assert.equal(menu.hidden, false);
      assert.equal(document.activeElement.id, "user-logout-btn");
      document.querySelector("#user-logout-btn").click();
      await flush();
      assert.ok(f.requests.includes("logout"));
      assert.equal(f.state.currentUserId, null);
      assert.equal(menu.hidden, true);
      assert.equal(document.querySelector("#login-screen").hidden, false);
    } finally {
      f.dom.window.close();
    }
  });
