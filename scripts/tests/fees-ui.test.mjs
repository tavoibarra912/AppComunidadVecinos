import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const html = readFileSync("public/index.html", "utf8");
const source = readFileSync("public/js/features/fees.js", "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/\bexport (?=(async )?function)/g, "");
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};
function fixture(manage = true) {
  const dom = new JSDOM(html, {
      url: "http://localhost/",
      runScripts: "outside-only",
    }),
    w = dom.window,
    calls = [];
  w.document.querySelector("#cuotas").hidden = false;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  const receipt = {
    id: "r1",
    communityId: "c1",
    propertyId: "p1",
    period: "2026-11",
    dueDate: "2026-11-05",
    amount: 5000,
    paid: 2000,
    outstanding: 3000,
    status: "partial",
    cancelledAt: "",
    payments: [],
    proofs: [],
    snapshot: {
      community: "Comunidad <img src=x onerror=alert(1)>",
      property: "Parcela 1",
      owners: [{ id: "o1", name: "Titular" }],
      agreement: "Junta",
    },
  };
  const data = {
    canManage: manage,
    receipts: [receipt],
    payments: [],
    plans: [
      {
        id: "plan",
        effectiveFrom: "2026-01-01",
        annualAmount: 60000,
        months: 1,
        reminders: {
          internal: true,
          email: false,
          beforeDays: 3,
          afterDays: 7,
          repeatDays: 0,
        },
      },
    ],
    defaults: {},
    properties: [{ id: "p1", plot: "Parcela 1", coefficient: "100" }],
  };
  Object.assign(w, {
    state: {
      roles: [
        { id: "admin-role", nombre: "administrator" },
        { id: "user-role", nombre: "user" },
      ],
      owners: [{ id: "o1", userId: "u1", name: "Titular", surname: "Prueba" }],
      communities: [{ id: "c1", name: "Comunidad" }],
      properties: [{ id: "p1", communityId: "c1", ownerIds: ["o1"] }],
    },
    getCurrentUser: () => ({
      id: "u1",
      rol: manage ? "administrator" : "user",
    }),
    hasPermission: (permission) =>
      permission === "fee:read" || (manage && permission === "fee:manage"),
    hayCambiosSinGuardar: () => false,
    refreshState: async () => {},
    esc: (value) =>
      String(value ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      ),
    toast: (value) => calls.push(["toast", value]),
    api: {
      fees: async (route, method, body) => {
        calls.push([route, method, body]);
        if (route.startsWith("/receipts/"))
          return { ...receipt, canManage: manage };
        if (route.endsWith("/preview"))
          return {
            period: body.period,
            token: "preview-token",
            total: 5000,
            dueDate: "2026-11-05",
            warnings: [],
            rows: [
              {
                amount: 5000,
                snapshot: {
                  property: "Parcela 1",
                  owners: [{ name: "Titular" }],
                  coefficient: "100",
                },
              },
            ],
          };
        return data;
      },
    },
  });
  vm.runInContext(
    source +
      "\nwindow.feeTest={mountFees,showReceipt,renderFeesPage,feeNavigation,mountFeeShortcut};",
    dom.getInternalVMContext(),
  );
  return { dom, w, calls, data };
}
function click(w, label, container = w.document) {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
  assert.ok(button, label);
  button.click();
  return button;
}
function control(w, label) {
  const wrap = [...w.document.querySelectorAll(".fee-field,.fee-check")].find(
    (node) => node.querySelector(".fee-field-label")?.textContent === label,
  );
  assert.ok(wrap, label);
  return wrap.querySelector("input,select,textarea");
}
test("cuotas UI: pantalla independiente con estados e importes escapados", async () => {
  const f = fixture();
  try {
    f.w.location.hash = "#cuotas";
    f.w.feeTest.renderFeesPage();
    await flush();
    const root = f.w.document.querySelector("#fees-page .fee-panel");
    assert.equal(root.closest("section").id, "cuotas");
    assert.match(root.textContent, /50,00/);
    assert.match(root.textContent, /30,00/);
    assert.match(root.textContent, /Pago parcial/);
    assert.equal(root.querySelector("img"), null);
    assert.equal(root.querySelector("form"), null);
    click(f.w, "2 · Emitir recibos", root);           
    await flush();
    const month = f.w.document.querySelector('#fee-dialog input[type="month"]');
    month.value = "2026-11";
    click(f.w, "Calcular vista previa");
    await flush();
    click(f.w, "Confirmar emisión de estos recibos");
    await flush();
    const request = f.calls.find((c) => c[0].endsWith?.("/issue"));
    assert.deepEqual(JSON.parse(JSON.stringify(request[2])), {
      period: "2026-11",
      token: "preview-token",
    });
  } finally {
    f.dom.window.close();
  }
});
test("cuotas UI: Mis cuotas usa la consulta consolidada sin acciones de gestión", async () => {
  const f = fixture(false);
  try {
    f.w.location.hash = "#cuotas";
    f.w.feeTest.renderFeesPage();
    await flush();
    const root = f.w.document.querySelector("#fees-page .fee-panel");
    assert.equal(f.w.feeTest.feeNavigation().title, "Mis cuotas");
    assert.ok(f.calls.some((c) => c[0] === "/mine"));
    assert.equal(
      [...root.querySelectorAll("button")].some(
        (b) => b.textContent === "2 · Emitir recibos",
      ),
      false,
    );
    click(f.w, "Ver recibo", root);
    await flush();
    const body = f.w.document.querySelector("#fee-dialog-body");
    assert.match(
      body.textContent,
      /Aceptar un justificante no registra un cobro/,
    );
    assert.equal(
      body.querySelector("input[type=file]").accept,
      ".pdf,.jpg,.jpeg,.png,.webp",
    );
    assert.equal(
      [...body.querySelectorAll("button")].some(
        (b) => b.textContent === "Anular recibo",
      ),
      false,
    );
  } finally {
    f.dom.window.close();
  }
});
test("cuotas UI: una carga tardía no muestra datos de la ficha anterior", async () => {
  const f = fixture();
  try {
    let release;
    const first = new Promise((resolve) => {
      release = resolve;
    });
    f.w.api.fees = (route) =>
      route.endsWith("/c1")
        ? first
        : Promise.resolve({ ...f.data, receipts: [] });
    const root = f.w.document.querySelector("#community-editor-fees");
    f.w.feeTest.mountFees(root, "community", "c1");
    f.w.feeTest.mountFees(root, "community", "c2");
    await flush();
    release(f.data);
    await flush();
    assert.doesNotMatch(root.textContent, /Parcela 1/);
    assert.match(root.textContent, /Todavía no hay recibos/);
  } finally {
    f.dom.window.close();
  }
});

test("cuotas UI: cambiar el periodo elimina la confirmación y descarta respuestas antiguas", async () => {
  const f = fixture();
  try {
    f.w.feeTest.renderFeesPage();
    await flush();
    click(f.w, "2 · Emitir recibos");               
    const month = control(f.w, "Mes de inicio del periodo");
    month.value = "2026-11";
    click(f.w, "Calcular vista previa");
    await flush();
    assert.match(
      f.w.document.querySelector("#fee-dialog-body").textContent,
      /Confirmar emisión/,
    );
    month.value = "2026-12";
    month.dispatchEvent(new f.w.Event("input"));
    assert.doesNotMatch(
      f.w.document.querySelector("#fee-dialog-body").textContent,
      /Confirmar emisión/,
    );
    let release;
    const original = f.w.api.fees;
    f.w.api.fees = (route, method, payload) =>
      route.endsWith("/preview")
        ? new Promise((resolve) => {
            release = () =>
              resolve({
                period: payload.period,
                total: 5000,
                rows: [],
                warnings: [],
                dueDate: "2026-12-05",
                token: "old",
              });
          })
        : original(route, method, payload);
    click(f.w, "Calcular vista previa");
    month.value = "2027-01";
    month.dispatchEvent(new f.w.Event("change"));
    release();
    await flush();
    assert.doesNotMatch(
      f.w.document.querySelector("#fee-dialog-body").textContent,
      /Confirmar emisión/,
    );
    assert.equal(
      f.calls.some((c) => c[0].endsWith?.("/issue")),
      false,
    );
  } finally {
    f.dom.window.close();
  }
});
test("cuotas UI: valida importes dentro del diálogo y conserva los datos al fallar", async () => {
  const f = fixture();
  try {
    f.w.feeTest.renderFeesPage();
    await flush();
    click(f.w, "3 · Registrar cobro o anticipo");
    const value = control(f.w, "Importe recibido (€)");
    value.value = "12,345";
    click(f.w, "Guardar cobro");
    await flush();
    const error = f.w.document.querySelector("[data-fee-error]");
    assert.equal(error.hidden, false);
    assert.match(error.textContent, /dos decimales/);
    assert.equal(value.getAttribute("aria-invalid"), "true");
    assert.equal(
      f.calls.some((c) => c[0].endsWith?.("/payments")),
      false,
    );
    value.value = "50,00";
    value.dispatchEvent(new f.w.Event("input"));
    assert.equal(error.hidden, true);
    assert.match(
      f.w.document.querySelector(".fee-payment-summary").textContent,
      /30,00.*20,00/,
    );
    const original = f.w.api.fees;
    f.w.api.fees = (route, method, payload) =>
      route.endsWith("/payments")
        ? Promise.reject(
            Object.assign(
              new Error("Posible cobro duplicado: revisá la referencia"),
              { status: 409 },
            ),
          )
        : original(route, method, payload);
    click(f.w, "Guardar cobro");
    await flush();
    assert.equal(value.value, "50,00");
    assert.match(error.textContent, /Posible cobro duplicado/);
    const duplicate = control(
      f.w,
      "Confirmo que es otro cobro si coincide con uno registrado",
    );
    assert.equal(duplicate.closest("label").hidden, false);
    assert.equal(duplicate.checked, false);
    assert.equal(
      f.w.document.querySelector("[data-fee-close]").disabled,
      false,
    );
    assert.equal(
      f.calls.some((c) => c[0] === "toast"),
      false,
    );
  } finally {
    f.dom.window.close();
  }
});
test("cuotas UI: filtros y paginación no pierden el foco del buscador", async () => {
  const f = fixture();
  try {
    const template = f.data.receipts[0];
    f.data.receipts = Array.from({ length: 23 }, (_, i) => ({
      ...template,
      id: `r${i}`,
      snapshot: { ...template.snapshot, property: `Parcela ${i}` },
    }));
    f.w.feeTest.renderFeesPage();
    await flush();
    const root = f.w.document.querySelector("#fees-page"),
      search = control(f.w, "Buscar recibos");
    assert.equal(
      root.querySelectorAll(".fee-receipts-results tbody tr").length,
      10,
    );
    click(f.w, "Siguiente", root);
    await flush();
    assert.match(root.textContent, /11–20 de 23/);
    search.focus();
    search.value = "Parcela 22";
    search.dispatchEvent(new f.w.Event("input"));
    assert.equal(f.w.document.activeElement, search);
    assert.equal(control(f.w, "Buscar recibos"), search);
    assert.equal(
      root.querySelectorAll(".fee-receipts-results tbody tr").length,
      1,
    );
    const filter = control(f.w, "Estado");
    filter.value = "paid";
    filter.dispatchEvent(new f.w.Event("change"));
    assert.match(root.textContent, /No hay recibos que coincidan/);
  } finally {
    f.dom.window.close();
  }
});
test("cuotas UI: protege el ámbito de comunidad y los accesos desde fichas con cambios pendientes", async () => {
  const f = fixture();
  try {
    f.w.state.communities.push({ id: "c2", name: "Otra comunidad" });
    f.w.hasPermission = (permission, id) => !id || id === "c1";
    f.w.location.hash = "#cuotas?comunidad=c2";
    f.w.feeTest.renderFeesPage();
    await flush();
    assert.match(
      f.w.document.querySelector("#fees-page").textContent,
      /No tenés acceso financiero/,
    );
    assert.equal(
      f.calls.some((c) => c[0] === "/communities/c2"),
      false,
    );
    const root = f.w.document.querySelector("#community-editor-fees");
    f.w.feeTest.mountFeeShortcut(root, "community", "c1");
    assert.equal(root.querySelector("table"), null);
    f.w.document.querySelector("#community-dialog").showModal();
    f.w.hayCambiosSinGuardar = () => true;
    root.querySelector("a").click();
    assert.equal(f.w.location.hash, "#cuotas?comunidad=c2");
    assert.match(root.textContent, /Guardá o descartá/);
  } finally {
    f.dom.window.close();
  }
});
test("cuotas UI: menú oculto para inquilinos y cuentas sin perfil propietario", () => {
  const f = fixture(false);
  try {
    f.w.state.owners = [];
    f.w.hasPermission = () => false;
    assert.equal(f.w.feeTest.feeNavigation().visible, false);
    f.w.feeTest.renderFeesPage();
    assert.equal(f.w.document.querySelector("#fees-page").textContent, "");
  } finally {
    f.dom.window.close();
  }
});
