import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";

const html = readFileSync("public/index.html", "utf8");
const source = readFileSync("public/js/features/fees.js", "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/\bexport (?=(async )?function)/g, "");
const moduleSource = (file) =>
  readFileSync(file, "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
    .replace(/\bexport (?=(async )?function)/g, "");
const editorSource = moduleSource("public/js/features/assessment-editor.js");
const serviceEditorSource = moduleSource("public/js/features/service-editor.js");
const richSource = moduleSource("public/js/rich-text.js");
const htmlSource = moduleSource("public/js/html.js");
const comboSource = readFileSync("public/js/utils.js", "utf8")
  .match(/export function makeSelectSearchable[\s\S]*?\r?\n}\r?\n/)[0]
  .replace("export ", "");
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
  w.DOMPurify = createDOMPurify(w);
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
    services: [],
    serviceMeters: {},
    meters: [
      {
        propertyId: "p1",
        plot: "Parcela 1",
        service: "agua",
        serviceLabel: "Agua",
        serviceBillId: "s1",
        period: "2026-11",
        issueDate: "2026-11-01",
        date: "2026-11-02",
        previous: 100000,
        current: 120000,
        consumption: 20000,
        incident: "",
        photos: [],
      },
    ],
    properties: [{ id: "p1", plot: "Parcela 1", coefficient: "100" }],
  };
  Object.assign(w, {
    createExportDropdown: () => null,
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
        if (route.startsWith("/receipts/")) return { ...receipt, canManage: manage };
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
    htmlSource +
      richSource +
      "\nlet comboSequence = 0;\n" +
      comboSource +
      editorSource +
      serviceEditorSource +
      source +
      "\nwindow.feeTest={mountFees,showReceipt,showService,renderFeesPage,feeNavigation,mountFeeShortcut};",
    dom.getInternalVMContext(),
  );
  return { dom, w, calls, data };
}
function click(w, label, container = w.document) {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  );
  assert.ok(button, label);
  button.click();
  return button;
}
function control(w, label) {
  const wrap = [...w.document.querySelectorAll(".fee-field,.fee-check")].find(
    (node) =>
      node
        .querySelector(".fee-field-label")
        ?.textContent.replace(/ \*$/, "")
        .replace(/ \(opcional\)$/, "") === label,
  );
  assert.ok(wrap, label);
  return wrap.querySelector("input,select,textarea");
}

test("R7 UI: rectificación individual con vista previa, invalidación al editar y emisión trazada", async () => {
  const f = fixture();
  try {
    const receipt = f.data.receipts[0];
    Object.assign(receipt, {
      cancelledAt: "2026-11-01",
      cancellationReason: "Revisar",
      status: "cancelled",
      canRectify: true,
      paid: 0,
      outstanding: 0,
    });
    const original = f.w.api.fees;
    const replacement = {
      ...receipt,
      id: "r2",
      cancelledAt: "",
      rectifiesReceiptId: "r1",
      rectificationReason: "Corrección aprobada",
      canManage: true,
      canRectify: false,
    };
    f.w.api.fees = async (route, method, body) => {
      if (route === "/receipts/r1/rectification/preview") {
        f.calls.push([route, method, body]);
        return { ...body, snapshot: receipt.snapshot, amount: 4000, token: "rectification-token" };
      }
      if (route === "/receipts/r1/rectify") {
        f.calls.push([route, method, body]);
        return replacement;
      }
      if (route === "/receipts/r2") return replacement;
      return original(route, method, body);
    };
    await f.w.feeTest.showReceipt("r1");
    click(f.w, "Rectificar recibo anulado");
    const value = control(f.w, "Importe (€)"),
      reason = control(f.w, "Motivo de la rectificación");
    value.value = "40.00";
    reason.value = "Corrección aprobada";
    click(f.w, "Revisar rectificación");
    await flush();
    assert.match(f.w.document.querySelector("#fee-dialog-body").textContent, /40,00/);
    reason.dispatchEvent(new f.w.Event("input"));
    assert.doesNotMatch(
      f.w.document.querySelector("#fee-dialog-body").textContent,
      /Emitir recibo rectificado/,
    );
    click(f.w, "Revisar rectificación");
    await flush();
    click(f.w, "Emitir recibo rectificado");
    await flush();
    const sent = f.calls.find((call) => call[0] === "/receipts/r1/rectify");
    assert.equal(sent[2].token, "rectification-token");
    assert.equal(sent[2].reason, "Corrección aprobada");
    assert.match(
      f.w.document.querySelector("#fee-dialog-body").textContent,
      /Rectifica al recibo r1/,
    );
  } finally {
    f.dom.window.close();
  }
});
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
test("cuotas UI: una comunidad que no usa euros no ofrece configurar ni emitir", async () => {
  const f = fixture();
  try {
    f.w.state.communities[0].currency = "USD";
    f.w.location.hash = "#cuotas?comunidad=c1";
    f.w.feeTest.renderFeesPage();
    await flush();
    const root = f.w.document.querySelector("#fees-page .fee-panel");
    const labels = [...root.querySelectorAll("button")].map(
      (b) => b.getAttribute("aria-label") || b.textContent,
    );
    assert.equal(labels.includes("1 · Configurar acuerdo"), false);
    assert.equal(labels.includes("2 · Emitir recibos"), false);
    assert.equal(labels.includes("Nueva derrama"), false);
    assert.equal(labels.includes("3 · Registrar cobro o anticipo"), true);
    assert.match(root.textContent, /solo se gestionan en euros/);
    assert.match(root.textContent, /USD/);
    assert.match(root.textContent, /Parcela 1/);
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
      [...root.querySelectorAll("button")].some((b) => b.textContent === "2 · Emitir recibos"),
      false,
    );
    click(f.w, "Ver recibo", root);
    await flush();
    const body = f.w.document.querySelector("#fee-dialog-body");
    assert.match(body.textContent, /Aceptar un justificante no registra un cobro/);
    assert.equal(body.querySelector("input[type=file]").accept, ".pdf,.jpg,.jpeg,.png,.webp");
    assert.equal(
      [...body.querySelectorAll("button")].some((b) => b.textContent === "Anular recibo"),
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
      route.endsWith("/c1") ? first : Promise.resolve({ ...f.data, receipts: [] });
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
    assert.match(f.w.document.querySelector("#fee-dialog-body").textContent, /Confirmar emisión/);
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
    assert.match(f.w.document.querySelector(".fee-payment-summary").textContent, /30,00.*20,00/);
    const original = f.w.api.fees;
    f.w.api.fees = (route, method, payload) =>
      route.endsWith("/payments")
        ? Promise.reject(
            Object.assign(new Error("Posible cobro duplicado: revisa la referencia"), {
              status: 409,
            }),
          )
        : original(route, method, payload);
    click(f.w, "Guardar cobro");
    await flush();
    assert.equal(value.value, "50,00");
    assert.match(error.textContent, /Posible cobro duplicado/);
    const duplicate = control(f.w, "Confirmo que es otro cobro si coincide con uno registrado");
    assert.equal(duplicate.closest("label").hidden, false);
    assert.equal(duplicate.checked, false);
    assert.equal(f.w.document.querySelector("[data-fee-close]").disabled, false);
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
    assert.equal(root.querySelectorAll(".fee-receipts-results tbody tr").length, 10);
    const next = click(f.w, "Página siguiente", root);
    assert.equal(next.textContent, "", "el paginador usa iconos, no texto");
    assert.ok(next.classList.contains("pager-btn"));
    await flush();
    assert.match(root.textContent, /11–20 de 23/);
    search.focus();
    search.value = "Parcela 22";
    search.dispatchEvent(new f.w.Event("input"));
    assert.equal(f.w.document.activeElement, search);
    assert.equal(control(f.w, "Buscar recibos"), search);
    assert.equal(root.querySelectorAll(".fee-receipts-results tbody tr").length, 1);
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
      /No tienes acceso financiero/,
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
    assert.match(root.textContent, /Guarda o descarta/);
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

function assessmentFixture(manage = true) {
  const f = fixture(manage);
  const a = {
    id: "a1",
    communityId: "c1",
    name: "Obras <img src=x>",
    purpose: "Fachada",
    agreement: "Junta extraordinaria",
    mode: "coefficient",
    totalAmount: 20000,
    propertyIds: ["p1"],
    allocations: { p1: 20000 },
    reminders: {},
    cancelledAt: "",
    cancellationReason: "",
    status: "draft",
    canEdit: true,
    installments: [
      {
        number: 1,
        amount: 10000,
        dueDate: "2030-12-10",
        issued: false,
        paid: 0,
        outstanding: 0,
        status: "pending",
      },
      {
        number: 2,
        amount: 10000,
        dueDate: "2031-01-10",
        issued: false,
        paid: 0,
        outstanding: 0,
        status: "pending",
      },
    ],
    totals: {
      total: 20000,
      issued: 0,
      paid: 0,
      outstanding: 0,
      unissued: 20000,
      cancelled: 0,
    },
    receipts: [],
  };
  f.data.assessments = [a];
  const original = f.w.api.fees;
  f.w.api.fees = async (route, method, body) => {
    if (
      route.startsWith("/assessments/") ||
      (method === "POST" && route.endsWith("/assessments"))
    ) {
      f.calls.push([route, method, body]);
      if (route.endsWith("/preview"))
        return {
          assessmentId: a.id,
          installment: body.installment,
          installmentCount: 2,
          total: 10000,
          dueDate: "2030-12-10",
          warnings: [],
          token: "assessment-token",
          rows: [
            {
              amount: 10000,
              snapshot: {
                property: "Parcela 1",
                owners: [{ name: "Titular" }],
                coefficient: "100",
              },
            },
          ],
        };
      if (route.endsWith("/cancel")) {
        const item = a.installments.find((i) => i.number === body.installment);
        item.status = "cancelled";
        item.cancelledAt = "2026-11-11";
        item.cancellationReason = body.reason;
        a.canEdit = false;
        a.status = "active";
      }
      return a;
    }
    return original(route, method, body);
  };
  return { ...f, assessment: a };
}

async function openAssessments(f) {
  f.w.feeTest.renderFeesPage();
  await flush();
  click(f.w, "Derramas", f.w.document.querySelector("#fees-page"));
  await flush();
}

test("derramas UI: valida y crea reparto manual con selección y plazos; emite con token de vista previa", async () => {
  const f = assessmentFixture();
  try {
    await openAssessments(f);
    click(f.w, "Nueva derrama");
    control(f.w, "Nombre de la derrama").value = "Obras de fachada";
    control(f.w, "Acuerdo de Junta que la aprueba").value = "Junta extraordinaria";
    const total = control(f.w, "Importe total de la derrama (€)");
    total.value = "200";
    total.dispatchEvent(new f.w.Event("input"));
    const mode = control(f.w, "Criterio de reparto");
    mode.value = "manual";
    mode.dispatchEvent(new f.w.Event("change"));
    click(f.w, "Agregar todos");
    control(f.w, "Parcela 1 · importe (€)").value = "200";
    const first = f.w.document.querySelector(".fee-installment-row input[data-money]");
    first.value = "100";
    first.dispatchEvent(new f.w.Event("input"));
    f.w.document.querySelector('.fee-installment-row input[type="date"]').value = "2030-12-10";
    click(f.w, "Agregar plazo");
    const second = f.w.document.querySelectorAll(".fee-installment-row")[1];
    second.querySelector("input[data-money]").value = "90";
    second.querySelector('input[type="date"]').value = "2031-01-10";
    click(f.w, "Crear derrama");
    await flush();
    assert.match(f.w.document.querySelector("[data-fee-error]").textContent, /suma de los plazos/);
    assert.equal(
      f.calls.some((c) => c[0].endsWith?.("/assessments") && c[1] === "POST"),
      false,
    );
    second.querySelector("input[data-money]").value = "100";
    click(f.w, "Crear derrama");
    await flush();
    const saved = f.calls.find((c) => c[0] === "/communities/c1/assessments" && c[1] === "POST");
    assert.equal(saved[2].mode, "manual");
    assert.equal(saved[2].manual.p1, "200");
    assert.deepEqual(Array.from(saved[2].propertyIds), ["p1"]);
    assert.deepEqual(
      Array.from(saved[2].installments, (i) => i.amount),
      ["100", "100"],
    );
    assert.equal(f.w.document.querySelector("#fee-dialog-body img"), null);
    click(f.w, "Emitir plazo 1");
    await flush();
    assert.match(f.w.document.querySelector("#fee-dialog-body").textContent, /Vista previa.*1\/2/);
    click(f.w, "Confirmar emisión del plazo");
    await flush();
    const issued = f.calls.find((c) => c[0] === "/assessments/a1/issue");
    assert.equal(issued[2].installment, 1);
    assert.equal(issued[2].token, "assessment-token");
  } finally {
    f.dom.window.close();
  }
});

test("derramas UI: editar un borrador mantiene los euros de todos los plazos", async () => {
  const f = assessmentFixture();
  try {
    await openAssessments(f);
    click(f.w, "Abrir derrama");
    await flush();
    click(f.w, "Editar derrama");
    await flush();
    assert.equal(control(f.w, "Importe total de la derrama (€)").value, "200.00");
    assert.deepEqual(
      [...f.w.document.querySelectorAll(".fee-installment-row input[data-money]")].map(
        (i) => i.value,
      ),
      ["100.00", "100.00"],
    );
    assert.match(f.w.document.querySelector(".fee-payment-summary").textContent, /Correcto/);
    click(f.w, "Guardar cambios");
    await flush();
    const request = f.calls.find((c) => c[0] === "/assessments/a1" && c[1] === "PUT");
    assert.deepEqual(
      Array.from(request[2].installments, (i) => i.amount),
      ["100.00", "100.00"],
    );
  } finally {
    f.dom.window.close();
  }
});

test("derramas UI: anula un plazo pendiente con motivo y oculta edición y reemisión", async () => {
  const f = assessmentFixture();
  try {
    await openAssessments(f);
    click(f.w, "Abrir derrama");
    await flush();
    click(f.w, "Anular plazo");
    control(f.w, "Motivo").value = "Acuerdo revocado";
    click(f.w, "Confirmar");
    await flush();
    const request = f.calls.find((c) => c[0] === "/assessments/a1/cancel");
    assert.equal(request[2].installment, 1);
    assert.equal(request[2].reason, "Acuerdo revocado");
    const buttons = [...f.w.document.querySelectorAll("#fee-dialog-body button")].map(
      (b) => b.textContent,
    );
    assert.equal(buttons.includes("Emitir plazo 1"), false);
    assert.equal(buttons.includes("Emitir plazo 2"), true);
    assert.equal(buttons.includes("Editar derrama"), false);
    assert.match(f.w.document.querySelector("#fee-dialog-body").textContent, /Anulado/);
  } finally {
    f.dom.window.close();
  }
});

test("derramas UI: cobros aplicados bloquean la anulación del plazo y de la derrama completa", async () => {
  const f = assessmentFixture();
  try {
    f.assessment.status = "active";
    f.assessment.canEdit = false;
    Object.assign(f.assessment.installments[0], {
      issued: true,
      paid: 500,
      outstanding: 9500,
      status: "partial",
    });
    f.assessment.totals.paid = 500;
    await openAssessments(f);
    click(f.w, "Abrir derrama");
    await flush();
    const body = f.w.document.querySelector("#fee-dialog-body");
    const firstRow = body.querySelector("tbody tr");
    assert.equal(
      [...firstRow.querySelectorAll("button")].some((b) => b.textContent === "Anular plazo"),
      false,
    );
    assert.equal(
      [...body.querySelectorAll("button")].find((b) => b.textContent === "Anular derrama completa")
        .disabled,
      true,
    );
    assert.match(body.textContent, /primero revierte los cobros/);
  } finally {
    f.dom.window.close();
  }
});

test("derramas UI: Mis cuotas y CSV identifican nombre y plazo sin ofrecer gestión", async () => {
  const f = assessmentFixture(false);
  try {
    const r = f.data.receipts[0];
    r.kind = "assessment";
    r.assessmentId = "a1";
    r.installment = 1;
    r.concept = 'Derrama "Fachada <img src=x>" · plazo 1/2';
    r.snapshot.assessmentPurpose = "Reparar el revestimiento";
    f.w.Blob = Blob;
    let csv;
    f.w.URL.createObjectURL = (blob) => {
      csv = blob;
      return "blob:receipt";
    };
    f.w.URL.revokeObjectURL = () => {};
    f.w.HTMLAnchorElement.prototype.click = () => {};
    await openAssessments(f);
    const root = f.w.document.querySelector("#fees-page");
    assert.match(root.textContent, /Derrama.*plazo 1\/2/);
    assert.equal(
      [...root.querySelectorAll("button")].some(
        (b) => (b.getAttribute("aria-label") || b.textContent) === "Nueva derrama",
      ),
      false,
    );
    click(f.w, "Ver recibo");
    await flush();
    assert.match(f.w.document.querySelector("#fee-dialog h2").textContent, /Recibo de derrama/);
    assert.match(
      f.w.document.querySelector("#fee-dialog-body").textContent,
      /Reparar el revestimiento/,
    );
    assert.equal(f.w.document.querySelector("#fee-dialog-body img"), null);
    click(f.w, "Descargar extracto del recibo");
    await flush();
    assert.match(await csv.text(), /Derrama.*Fachada.*plazo 1\/2/);
  } finally {
    f.dom.window.close();
  }
});

test("derramas UI: pestañas separan los recibos y el editor integrado conserva el borrador al cambiar de pestaña", async () => {
  const f = assessmentFixture();
  try {
    f.data.receipts.push({
      ...f.data.receipts[0],
      id: "extraordinary",
      kind: "assessment",
      concept: "Derrama Fachada",
    });
    f.w.feeTest.renderFeesPage();
    await flush();
    let results = f.w.document.querySelector(".fee-receipts-results");
    assert.doesNotMatch(results.textContent, /Derrama Fachada/);
    click(f.w, "Derramas");
    await flush();
    results = f.w.document.querySelector(".fee-receipts-results");
    assert.match(results.textContent, /Derrama Fachada/);
    assert.equal(results.querySelectorAll("tbody tr").length, 1);
    click(f.w, "Nueva derrama");
    assert.equal(f.w.document.querySelector("#fee-dialog[open]"), null);
    const name = control(f.w, "Nombre de la derrama");
    name.value = "Mi borrador";
    name.dispatchEvent(new f.w.Event("input", { bubbles: true }));
    click(f.w, "Cuotas ordinarias");
    assert.equal(f.w.document.querySelector(".fee-assessment-editor"), null);
    click(f.w, "Derramas");
    assert.equal(control(f.w, "Nombre de la derrama").value, "Mi borrador");
    click(f.w, "Cerrar formulario de derrama");
    assert.equal(f.w.document.querySelector(".fee-discard-notice").hidden, false);
    click(f.w, "Descartar cambios");
    assert.equal(f.w.document.querySelector(".fee-assessment-editor"), null);
  } finally {
    f.dom.window.close();
  }
});

test("derramas UI: busca y vincula inmuebles sin duplicarlos, permite quitarlos y mantiene los importes manuales", async () => {
  const f = assessmentFixture();
  try {
    await openAssessments(f);
    click(f.w, "Nueva derrama");
    const form = f.w.document.querySelector(".fee-assessment-form");
    click(f.w, "Inmuebles", form);
    click(f.w, "Vincular inmueble");
    const search = form.querySelector('[aria-label="Buscar inmueble para vincular"]');
    search.focus();
    search.value = "Parcela";
    search.dispatchEvent(new f.w.Event("input"));
    const option = form.querySelector('.combo-box-options li[data-value="p1"]');
    assert.ok(option);
    option.dispatchEvent(new f.w.MouseEvent("mousedown", { bubbles: true }));
    click(f.w, "Agregar inmueble seleccionado");
    await flush();
    assert.equal(form.querySelectorAll(".fee-property-card").length, 1);
    assert.equal(form.querySelector('.fee-property-picker select option[value="p1"]'), null);
    const mode = control(f.w, "Criterio de reparto");
    mode.value = "manual";
    mode.dispatchEvent(new f.w.Event("change"));
    control(f.w, "Parcela 1 · importe (€)").value = "200";
    click(f.w, "Quitar inmueble Parcela 1");
    await flush();
    assert.equal(form.querySelectorAll(".fee-property-card").length, 0);
    click(f.w, "Agregar todos");
    await flush();
    assert.equal(control(f.w, "Parcela 1 · importe (€)").value, "200");
    assert.equal(
      [...form.querySelectorAll("button")].find((b) => b.textContent === "Agregar todos").disabled,
      true,
    );
  } finally {
    f.dom.window.close();
  }
});

test("derramas UI: agrega y elimina plazos con botones estándar, renumera y conserva al menos uno", async () => {
  const f = assessmentFixture();
  try {
    await openAssessments(f);
    click(f.w, "Nueva derrama");
    const form = f.w.document.querySelector(".fee-assessment-form");
    click(f.w, "Plazos", form);
    const first = form.querySelector(".fee-installment-row");
    first.querySelector('input[type="date"]').value = "2031-01-31";
    assert.equal(first.querySelector("button").disabled, true);
    click(f.w, "Agregar plazo");
    await flush();
    assert.equal(form.querySelectorAll(".fee-installment-row").length, 2);
    assert.equal(
      form.querySelectorAll('.fee-installment-row input[type="date"]')[1].value,
      "2031-02-28",
    );
    const remove = [...form.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Eliminar plazo 1",
    );
    assert.ok(remove.classList.contains("btn-delete"));
    remove.click();
    await flush();
    assert.equal(form.querySelectorAll(".fee-installment-row").length, 1);
    assert.equal(form.querySelector(".fee-installment-number").textContent, "Plazo 1");
    assert.equal(form.querySelector(".fee-installment-row button").disabled, true);
  } finally {
    f.dom.window.close();
  }
});

test("derramas UI: valida campos requeridos en pestañas ocultas y conserva el motivo con formato", async () => {
  const f = assessmentFixture();
  try {
    f.assessment.purpose = "<p>Reparación <strong>urgente</strong></p>";
    await openAssessments(f);
    click(f.w, "Abrir derrama");
    await flush();
    assert.ok(f.w.document.querySelector("#fee-dialog .fee-rich-content strong"));
    assert.ok(f.w.document.querySelector("[data-fee-close]").classList.contains("btn-cancel"));
    assert.ok(f.w.document.querySelector("[data-fee-close] svg"));
    click(f.w, "Editar derrama");
    await flush();
    const form = f.w.document.querySelector(".fee-assessment-form");
    assert.ok(form.querySelector(".rich-text-content strong"));
    const name = control(f.w, "Nombre de la derrama");
    assert.equal(name.required, true);
    name.value = "";
    click(f.w, "Plazos", form);
    click(f.w, "Guardar cambios");
    await flush();
    assert.equal(form.querySelector('[data-assessment-pane="general"]').hidden, false);
    assert.equal(f.w.document.activeElement, name);
    assert.equal(
      f.calls.some((c) => c[1] === "PUT"),
      false,
    );
    name.value = "Reparación";
    click(f.w, "Guardar cambios");
    await flush();
    const saved = f.calls.find((c) => c[1] === "PUT");
    assert.match(saved[2].purpose, /<strong>urgente<\/strong>/);
  } finally {
    f.dom.window.close();
  }
});

function serviceFixture(manage = true) {
  const f = fixture(manage);
  const service = {
    id: "s1",
    communityId: "c1",
    service: "agua",
    serviceLabel: "Agua",
    supplier: "Canal",
    invoiceNumber: "F-2030-1",
    period: "2026-10",
    issueDate: "2026-10-01",
    dueDate: "2026-11-01",
    totalAmount: 10000,
    createdAt: "2026-10-01T10:00:00.000Z",
    actorId: "",
    issuedAt: "",
    cancelledAt: "",
    cancellationReason: "",
    concept: "Servicio de Agua · 2026-10",
    canEdit: true,
    method: "coefficient",
    billing: "receipts",
    variableShare: 0,
    centralHeating: false,
    legalBasis: "",
    notes: "",
    propertyIds: ["p1"],
    allocations: { p1: 10000 },
    coefficients: { p1: "100" },
    effectiveCoefficients: { p1: 100 },
    readings: {},
    breakdown: [
      {
        propertyId: "p1",
        plot: "Parcela 1",
        coefficient: "100",
        effectiveCoefficient: 100,
        previous: null,
        current: null,
        consumption: null,
        fixed: 10000,
        variable: 0,
        amount: 10000,
      },
    ],
    omitted: [],
    warnings: [],
    subset: false,
    reminders: {},
    receiptCount: 0,
    attachmentCount: 0,
    totals: { total: 10000, issued: 0, paid: 0, outstanding: 0, cancelled: 0 },
    status: "draft",
    receipts: [],
    attachments: [],
  };
  const serviceReceipt = {
    ...f.data.receipts[0],
    id: "svc-r1",
    kind: "service",
    serviceBillId: "s1",
    concept: "Servicio de Agua · 2026-10",
    amount: 10000,
    paid: 0,
    outstanding: 10000,
    status: "pending",
    dueDate: "2026-11-01",
    snapshot: {
      community: "Comunidad",
      property: "Parcela 1",
      owners: [{ id: "o1", name: "Titular" }],
      agreement: "Servicio de suministros",
      service: "agua",
      serviceLabel: "Agua",
      servicePeriod: "2026-10",
      serviceSupplier: "Canal de Isabel II",
      serviceInvoice: "F-2030-1",
      serviceReadingPrevious: 100000,
      serviceReadingCurrent: 120000,
      serviceReadingConsumption: 20000,
    },
  };
  const services = new Map([["s1", service]]);
  const preview = {
    serviceId: "s1",
    serviceLabel: "Agua",
    period: "2026-10",
    dueDate: "2026-11-01",
    total: 10000,
    method: "coefficient",
    billing: "receipts",
    variableShare: 0,
    warnings: [],
    token: "service-token",
    rows: [
      {
        propertyId: "p1",
        amount: 10000,
        fixed: 10000,
        variable: 0,
        reading: null,
        snapshot: { property: "Parcela 1", coefficient: "100" },
      },
    ],
  };
  const original = f.w.api.fees;
  f.w.api.fees = async (route, method = "GET", body) => {
    if (route === "/receipts/svc-r1") return { ...serviceReceipt, canManage: manage };
    if (route === "/services/s1/preview") {
      f.calls.push([route, method, body]);
      return preview;
    }
    if (route === "/services/s1/issue") {
      f.calls.push([route, method, body]);
      service.issuedAt = "2026-11-12T10:00:00.000Z";
      service.status = "issued";
      service.canEdit = false;
      return { ids: ["svc-r1"], total: 10000, billing: "receipts", serviceId: "s1" };
    }
    if (route === "/services/s1/cancel") {
      f.calls.push([route, method, body]);
      service.cancelledAt = "2026-11-12T10:00:00.000Z";
      service.status = "cancelled";
      service.cancellationReason = body.reason;
      service.canEdit = false;
      return service;
    }
    if (route === "/communities/c1/services" && method === "POST") {
      f.calls.push([route, method, body]);
      const saved = {
        ...service,
        ...body,
        id: "s2",
        status: "draft",
        canEdit: true,
        totals: { total: 10000, issued: 0, paid: 0, outstanding: 0, cancelled: 0 },
        receipts: [],
        attachments: [],
      };
      services.set("s2", saved);
      return saved;
    }
    if (route.startsWith("/services/")) {
      f.calls.push([route, method, body]);
      const id = route.split("/")[2],
        found = services.get(id);
      if (method === "PUT") Object.assign(found, body);
      return found;
    }
    return original(route, method, body);
  };
  f.data.services = [service];
  f.data.serviceMeters = {
    agua: {
      p1: {
        reading: 100000,
        previous: 90000,
        period: "2026-09",
        issueDate: "2026-09-01",
        serviceBillId: "s0",
      },
    },
  };
  f.data.properties = [
    { id: "p1", plot: "Parcela 1", coefficient: "100" },
    { id: "p2", plot: "Parcela 2", coefficient: "50" },
  ];
  f.w.state.properties.push({
    id: "p2",
    communityId: "c1",
    ownerIds: ["o1"],
  });
  return { ...f, service, serviceReceipt };
}

async function openServices(f) {
  f.w.feeTest.renderFeesPage();
  await flush();
  click(f.w, "Servicios", f.w.document.querySelector("#fees-page"));
  await flush();
}

test("servicios UI: pestaña propia, listado y editor integrado que conserva el borrador", async () => {
  const f = serviceFixture();
  try {
    f.data.receipts.push(f.serviceReceipt);
    f.w.feeTest.renderFeesPage();
    await flush();
    let results = f.w.document.querySelector(".fee-receipts-results");
    assert.doesNotMatch(results.textContent, /Servicio de Agua/);
    click(f.w, "Servicios", f.w.document.querySelector("#fees-page"));
    await flush();
    results = f.w.document.querySelector(".fee-receipts-results");
    assert.match(results.textContent, /Servicio de Agua/);
    assert.equal(results.querySelectorAll("tbody tr").length, 1);
    const root = f.w.document.querySelector("#fees-page");
    assert.match(root.textContent, /Servicios y suministros/);
    assert.match(root.textContent, /Canal/);
    click(f.w, "Nuevo servicio");
    const form = f.w.document.querySelector(".fee-service-form");
    assert.ok(form);
    assert.equal(control(f.w, "Tipo de suministro").value, "agua");
    assert.equal(
      [...form.querySelectorAll(".fee-editor-pane")].filter((pane) => !pane.hidden).length,
      1,
    );
    click(f.w, "Cuotas ordinarias");
    assert.equal(f.w.document.querySelector(".fee-service-editor"), null);
    click(f.w, "Servicios");
    assert.ok(f.w.document.querySelector(".fee-service-form"));
    click(f.w, "Cerrar formulario de servicio");
    assert.equal(f.w.document.querySelector(".fee-service-editor"), null);
  } finally {
    f.dom.window.close();
  }
});

test("servicios UI: carga lecturas, propone la anterior, calcula consumo y guarda el reparto", async () => {
  const f = serviceFixture();
  try {
    await openServices(f);
    click(f.w, "Nuevo servicio");
    const form = f.w.document.querySelector(".fee-service-form");
    click(f.w, "Reparto", form);
    const method = control(f.w, "Criterio de reparto");
    method.value = "reading";
    method.dispatchEvent(new f.w.Event("change", { bubbles: true }));
    click(f.w, "Lecturas", form);
    const rows = form.querySelectorAll(".fee-reading-row");
    assert.equal(rows.length, 2);
    const first = rows[0];
    assert.equal(first.querySelector('[data-reading="previous"]').value, "100");
    const current = first.querySelector('[data-reading="current"]');
    current.value = "120";
    current.dispatchEvent(new f.w.Event("input", { bubbles: true }));
    assert.match(first.querySelector(".fee-reading-consumption").textContent, /Consumo: 20 m³/);
    const second = rows[1];
    second.querySelector('[data-reading="previous"]').value = "0";
    second
      .querySelector('[data-reading="previous"]')
      .dispatchEvent(new f.w.Event("input", { bubbles: true }));
    const secondCurrent = second.querySelector('[data-reading="current"]');
    secondCurrent.value = "30";
    secondCurrent.dispatchEvent(new f.w.Event("input", { bubbles: true }));
    const total = control(f.w, "Importe total de la factura (€)");
    total.value = "100";
    total.dispatchEvent(new f.w.Event("input", { bubbles: true }));
    click(f.w, "Crear servicio");
    await flush();
    const saved = f.calls.find(
      (call) => call[0] === "/communities/c1/services" && call[1] === "POST",
    );
    assert.ok(saved, "No se envió el servicio");
    assert.equal(saved[2].method, "reading");
    assert.equal(saved[2].totalAmount, "100");
    assert.deepEqual(JSON.parse(JSON.stringify(saved[2].readings)), {
      p1: { previous: "100", current: "120" },
      p2: { previous: "0", current: "30" },
    });
    assert.match(f.w.document.querySelector("#fee-dialog h2").textContent, /Servicio de Agua/);
  } finally {
    f.dom.window.close();
  }
});

test("servicios UI: observaciones con formato y fotos de contador se envían al guardar", async () => {
  const f = serviceFixture();
  try {
    await openServices(f);
    click(f.w, "Abrir servicio");
    await flush();
    click(f.w, "Editar servicio");
    await flush();
    const form = f.w.document.querySelector(".fee-service-form");
    const rich = form.querySelector(".rich-text-content");
    assert.ok(rich, "faltó el editor de observaciones");
    rich.innerHTML = "<p>Revisión <strong>anual</strong></p>";
    rich.dispatchEvent(new f.w.Event("input", { bubbles: true }));
    click(f.w, "Reparto", form);
    const method = control(f.w, "Criterio de reparto");
    method.value = "reading";
    method.dispatchEvent(new f.w.Event("change", { bubbles: true }));
    click(f.w, "Lecturas", form);
    const row = form.querySelector(".fee-reading-row");
    assert.ok(row);
    const previous = row.querySelector('[data-reading="previous"]');
    previous.value = "100";
    previous.dispatchEvent(new f.w.Event("input", { bubbles: true }));
    const current = row.querySelector('[data-reading="current"]');
    current.value = "120";
    current.dispatchEvent(new f.w.Event("input", { bubbles: true }));
    const fileInput = row.querySelector('input[type="file"]');
    assert.equal(fileInput.multiple, true);
    const photo = new f.w.File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      "contador.png",
      { type: "image/png" },
    );
    Object.defineProperty(fileInput, "files", {
      value: [photo],
      configurable: true,
    });
    fileInput.dispatchEvent(new f.w.Event("change", { bubbles: true }));
    click(f.w, "Guardar cambios");
    await flush();
    const put = f.calls.find((call) => call[0] === "/services/s1" && call[1] === "PUT");
    assert.ok(put, "No se guardó el servicio");
    assert.match(put[2].notes, /<strong>anual<\/strong>/);
    const upload = f.calls.find((call) => call[0] === "/services/s1/reading-photos/p1");
    assert.ok(upload, "No se subió la foto del contador");
    assert.equal(upload[1], "POST");
    assert.ok(upload[2] instanceof f.w.FormData);
  } finally {
    f.dom.window.close();
  }
});

test("servicios UI: revisa el reparto, emite con token y bloquea una segunda emisión", async () => {
  const f = serviceFixture();
  try {
    f.w.feeTest.showService("s1");
    await flush();
    assert.match(f.w.document.querySelector("#fee-dialog h2").textContent, /Servicio de Agua/);
    let body = f.w.document.querySelector("#fee-dialog-body");
    assert.match(body.textContent, /Reparto congelado/);
    click(f.w, "Revisar y emitir");
    await flush();
    body = f.w.document.querySelector("#fee-dialog-body");
    assert.match(body.textContent, /Vista previa/);
    assert.match(body.textContent, /Se crearán 1 recibos/);
    click(f.w, "Confirmar emisión de recibos");
    await flush();
    const issued = f.calls.find((call) => call[0] === "/services/s1/issue");
    assert.deepEqual(JSON.parse(JSON.stringify(issued[2])), {
      token: "service-token",
    });
    assert.match(f.w.document.querySelector("#fee-dialog-body").textContent, /Reparto congelado/);
    assert.equal(
      [...f.w.document.querySelectorAll("#fee-dialog-body button")].some(
        (button) => button.textContent === "Revisar y emitir",
      ),
      false,
    );
  } finally {
    f.dom.window.close();
  }
});

test("servicios UI: el propietario ve repartos informativos sin deuda y sin gestión", async () => {
  const f = serviceFixture(false);
  try {
    f.data.informativeServices = [
      {
        id: "s1",
        communityId: "c1",
        service: "agua",
        serviceLabel: "Agua",
        supplier: "Canal",
        invoiceNumber: "F-2030-1",
        period: "2026-10",
        issueDate: "2026-10-01",
        dueDate: "2026-11-01",
        totalAmount: 10000,
        issuedAt: "2026-10-02T10:00:00.000Z",
        concept: "Servicio de Agua · 2026-10",
        method: "coefficient",
        legalBasis: "",
        notes: "",
        warnings: [],
        attachments: [
          {
            id: "a1",
            fileName: "factura.pdf",
            mime: "application/pdf",
            createdAt: "2026-10-02T10:00:00.000Z",
          },
        ],
        properties: [
          {
            propertyId: "p1",
            plot: "Parcela 1",
            coefficient: 100,
            previous: null,
            current: null,
            consumption: null,
            fixed: 10000,
            variable: 0,
            amount: 10000,
          },
        ],
      },
    ];
    f.w.location.hash = "#cuotas";
    f.w.feeTest.renderFeesPage();
    await flush();
    let page = f.w.document.querySelector("#fees-page");
    assert.match(page.textContent, /Tienes 1 reparto informativo/);
    assert.equal(
      [...page.querySelectorAll("button")].some(
        (button) => (button.getAttribute("aria-label") || button.textContent) === "Nuevo servicio",
      ),
      false,
    );
    click(f.w, "Ver repartos informativos", page);
    await flush();
    page = f.w.document.querySelector("#fees-page");
    assert.match(page.textContent, /Repartos informativos/);
    assert.match(page.textContent, /Facturas de servicios repartidas solo a efectos informativos/);
    assert.match(page.textContent, /100,00/);
    click(f.w, "Ver reparto", page);
    const body = f.w.document.querySelector("#fee-dialog-body");
    assert.match(body.textContent, /Solo reparto informativo/);
    assert.match(body.textContent, /Este reparto no genera recibos ni deuda/);
    assert.match(body.textContent, /Factura adjunta/);
    const link = body.querySelector('a[href="/api/fees/service-attachments/a1/download"]');
    assert.ok(link);
    assert.equal(link.download, "factura.pdf");
  } finally {
    f.dom.window.close();
  }
});

test("servicios UI: el recibo de servicio enlaza la factura adjunta", async () => {
  const f = serviceFixture(false);
  try {
    f.serviceReceipt.serviceAttachments = [
      {
        id: "a1",
        fileName: "factura.pdf",
        mime: "application/pdf",
        createdAt: "2026-10-02T10:00:00.000Z",
      },
    ];
    f.w.feeTest.showReceipt("svc-r1");
    await flush();
    const body = f.w.document.querySelector("#fee-dialog-body");
    assert.match(body.textContent, /Factura adjunta/);
    const link = body.querySelector('a[href="/api/fees/service-attachments/a1/download"]');
    assert.ok(link);
    assert.equal(link.download, "factura.pdf");
  } finally {
    f.dom.window.close();
  }
});

test("servicios UI: el recibo muestra proveedor y lecturas y descarga un CSV propio", async () => {
  const f = serviceFixture();
  try {
    f.data.receipts.push(f.serviceReceipt);
    f.w.Blob = Blob;
    let csv;
    f.w.URL.createObjectURL = (blob) => {
      csv = blob;
      return "blob:receipt";
    };
    f.w.URL.revokeObjectURL = () => {};
    f.w.HTMLAnchorElement.prototype.click = () => {};
    await openServices(f);
    click(f.w, "Ver recibo");
    await flush();
    assert.match(f.w.document.querySelector("#fee-dialog h2").textContent, /Recibo de servicio/);
    const body = f.w.document.querySelector("#fee-dialog-body");
    assert.match(body.textContent, /Canal de Isabel II/);
    assert.match(body.textContent, /Lectura anterior: 100 m³/);
    assert.match(body.textContent, /Consumo: 20 m³/);
    click(f.w, "Descargar extracto del recibo");
    await flush();
    const text = await csv.text();
    assert.match(text, /"Servicio";"Agua"/);
    assert.match(text, /"Lectura actual \(m³\)";"120"/);
  } finally {
    f.dom.window.close();
  }
});

test("certificados UI: selecciona ámbito y destinatarios de la comunidad y descarga el PDF", async () => {
  const f = fixture();
  try {
    f.w.state.properties[0].plot = "Parcela 1";
    f.w.state.properties.push({
      id: "foreign-p",
      communityId: "c2",
      ownerIds: ["foreign-o"],
      plot: "Ajeno",
    });
    f.w.state.owners.push({ id: "foreign-o", name: "Titular ajeno" });
    const downloads = [];
    f.w.URL.createObjectURL = () => "blob:certificate";
    f.w.URL.revokeObjectURL = () => {};
    f.w.document.addEventListener("click", (e) => {
      const a = e.target.closest("a[download]");
      if (a) {
        e.preventDefault();
        downloads.push({ href: a.href, name: a.download });
      }
    });
    f.w.api.debtCertificate = async (...args) => {
      f.calls.push(["certificate", ...args]);
      return new f.w.Blob(["%PDF-test"], { type: "application/pdf" });
    };
    f.w.feeTest.renderFeesPage();
    await flush();
    click(f.w, "Certificado de deuda");
    assert.match(f.w.document.querySelector("#fee-dialog").textContent, /sin aplicar los filtros/);
    const target = control(f.w, "Titular o inmueble");
    assert.deepEqual(
      [...target.options].map((o) => o.value),
      ["", "p1"],
    );
    target.value = "p1";
    click(f.w, "Descargar PDF");
    await flush();
    assert.deepEqual(
      f.calls.find((c) => c[0] === "certificate"),
      ["certificate", "c1", "propertyId", "p1"],
    );
    assert.equal(downloads.length, 1);
    assert.match(downloads[0].name, /inmueble-p1/);
    const scope = control(f.w, "Ámbito del certificado");
    scope.value = "ownerId";
    scope.dispatchEvent(new f.w.Event("change"));
    assert.deepEqual(
      [...target.options].map((o) => o.value),
      ["", "o1"],
    );
    target.value = "o1";
    click(f.w, "Descargar PDF");
    await flush();
    assert.deepEqual(f.calls.filter((c) => c[0] === "certificate").at(-1), [
      "certificate",
      "c1",
      "ownerId",
      "o1",
    ]);
    assert.equal(downloads.length, 2);
  } finally {
    f.dom.window.close();
  }
});
test("certificados UI: sin gestión no ofrece certificados y los errores conservan la selección", async () => {
  const reader = fixture(false);
  try {
    reader.w.feeTest.renderFeesPage();
    await flush();
    assert.doesNotMatch(
      reader.w.document.querySelector("#fees-page").textContent,
      /Certificado de deuda/,
    );
  } finally {
    reader.dom.window.close();
  }
  const f = fixture();
  try {
    f.w.api.debtCertificate = async () => {
      throw new Error("No tienes permiso para generar certificados.");
    };
    f.w.feeTest.renderFeesPage();
    await flush();
    click(f.w, "Certificado de deuda");
    control(f.w, "Titular o inmueble").value = "p1";
    click(f.w, "Descargar PDF");
    await flush();
    assert.match(f.w.document.querySelector("[data-fee-error]").textContent, /No tienes permiso/);
    assert.equal(control(f.w, "Titular o inmueble").value, "p1");
    assert.equal(f.w.document.querySelector("[data-fee-close]").disabled, false);
  } finally {
    f.dom.window.close();
  }
});
test("derramas mixtas UI: crear y editar conserva solo los importes marcados como fijos", async () => {
  const f = assessmentFixture();
  try {
    f.data.properties.push({ id: "p2", plot: "Parcela 2", coefficient: "50" });
    f.w.state.properties.push({ id: "p2", communityId: "c1", ownerIds: ["o1"] });
    await openAssessments(f);
    click(f.w, "Nueva derrama");
    control(f.w, "Nombre de la derrama").value = "Mixta";
    control(f.w, "Acuerdo de Junta que la aprueba").value = "Junta";
    const total = control(f.w, "Importe total de la derrama (€)");
    total.value = "100";
    total.dispatchEvent(new f.w.Event("input"));
    const mode = control(f.w, "Criterio de reparto");
    mode.value = "mixed";
    mode.dispatchEvent(new f.w.Event("change"));
    click(f.w, "Agregar todos");
    const fixed = f.w.document.querySelector('[aria-label="Parcela 1 · usar importe fijo"]');
    fixed.checked = true;
    fixed.dispatchEvent(new f.w.Event("change"));
    control(f.w, "Parcela 1 · importe (€)").value = "20";
    assert.equal(control(f.w, "Parcela 2 · importe (€)").disabled, true);
    click(f.w, "Crear derrama");
    await flush();
    const created = f.calls.find((c) => c[0] === "/communities/c1/assessments" && c[1] === "POST");
    assert.ok(created, f.w.document.querySelector("[data-fee-error]")?.textContent);
    assert.equal(created[2].mode, "mixed");
    assert.deepEqual(Object.keys(created[2].manual), ["p1"]);
    assert.equal(created[2].manual.p1, "20");
    Object.assign(f.assessment, {
      mode: "mixed",
      fixedAmounts: { p1: 2000 },
      allocations: { p1: 2000, p2: 18000 },
      propertyIds: ["p1", "p2"],
    });
    click(f.w, "Editar derrama");
    await flush();
    assert.equal(control(f.w, "Criterio de reparto").value, "mixed");
    assert.equal(control(f.w, "Parcela 1 · importe (€)").value, "20.00");
    assert.equal(control(f.w, "Parcela 2 · importe (€)").disabled, true);
    click(f.w, "Guardar cambios");
    await flush();
    const edited = f.calls.findLast((c) => c[0] === "/assessments/a1" && c[1] === "PUT");
    assert.equal(edited[2].manual.p1, "20.00");
    assert.equal(edited[2].manual.p2, undefined);
  } finally {
    f.dom.window.close();
  }
});
test("derramas mixtas UI: el borrador heredado se guarda conservando su reparto sin inventar importes fijos", async () => {
  const f = assessmentFixture();
  try {
    Object.assign(f.assessment, { mode: "mixed", allocations: { p1: 20000 } });
    await openAssessments(f);
    click(f.w, "Abrir derrama");
    await flush();
    click(f.w, "Editar derrama");
    await flush();
    assert.equal(control(f.w, "Criterio de reparto").value, "mixed");
    assert.equal(control(f.w, "Importe total de la derrama (€)").disabled, true);
    assert.match(
      f.w.document.querySelector(".fee-assessment-editor").textContent,
      /no indica cuáles eran fijos/,
    );
    click(f.w, "Guardar cambios");
    await flush();
    const saved = f.calls.find((c) => c[0] === "/assessments/a1" && c[1] === "PUT");
    assert.equal(saved[2].preserveLegacyMixed, true);
    assert.deepEqual(Object.keys(saved[2].manual), []);
  } finally {
    f.dom.window.close();
  }
});

test("certificados UI: usa las opciones financieras aunque el gestor no pueda leer las fichas del censo", async () => {
  const f = fixture();
  try {
    f.w.state.properties = [];
    f.w.state.owners = [];
    f.data.certificateTargets = {
      properties: [{ id: "p1", label: "Vivienda autorizada" }],
      owners: [{ id: "historical-o", label: "Titular histórico autorizado" }],
    };
    f.w.feeTest.renderFeesPage();
    await flush();
    click(f.w, "Certificado de deuda");
    const scope = control(f.w, "Ámbito del certificado"),
      target = control(f.w, "Titular o inmueble");
    assert.equal(target.options[1].textContent, "Vivienda autorizada");
    scope.value = "ownerId";
    scope.dispatchEvent(new f.w.Event("change"));
    assert.equal(target.options[1].value, "historical-o");
    assert.equal(target.options[1].textContent, "Titular histórico autorizado");
  } finally {
    f.dom.window.close();
  }
});

test("H-08: el atajo de cuotas usa una ruta real y conserva el filtro del propietario", () => {
  const f = fixture();
  try {
    const root = f.w.document.querySelector("#owner-editor-fees");
    f.w.feeTest.mountFeeShortcut(root, "owner", "o1");
    const link = root.querySelector("a");
    assert.equal(link.getAttribute("href"), "/cuotas?propietario=o1");
    link.click();
    assert.equal(f.w.location.pathname, "/cuotas");
    assert.equal(f.w.location.search, "?propietario=o1");
    assert.equal(f.w.location.hash, "");
  } finally {
    f.dom.window.close();
  }
});

test("contadores UI: muestra fecha, imagen e incidencia y guarda la incidencia", async () => {
  const f = fixture();
  try {
    const root = f.w.document.querySelector("#community-editor-fees");
    f.w.feeTest.mountFees(root, "community", "c1");
    await flush();
    click(f.w, "Contadores", root);
    await flush();
    const section = root.querySelector(".fee-meters");
    assert.ok(section, "faltó la pantalla de contadores");
    const headers = [...section.querySelectorAll(".fee-table th")].map((th) => th.textContent);
    assert.ok(headers.includes("Fecha"));
    assert.equal(section.querySelector('input[type="date"]'), null, "la fecha es de consulta");
    assert.equal(section.querySelector("time").dateTime, "2026-11-02");
    assert.ok(headers.includes("Imagen"));
    assert.ok(headers.includes("Incidencia"));
    assert.match(section.textContent, /Parcela 1/);
    assert.match(section.textContent, /Agua/);
    const incident = section.querySelector(".fee-meter-incident-input");
    const save = section.querySelector(".fee-meter-save");
    assert.equal(save.disabled, true, "no se guarda sin cambios");
    incident.value = "Contador roto";
    incident.dispatchEvent(new f.w.Event("input", { bubbles: true }));
    assert.equal(save.disabled, false, "el cambio habilita el guardado");
    const original = f.w.api.fees;
    f.w.api.fees = async (route, method, body) => {
      if (route === "/services/s1/readings/p1" && method === "PATCH") {
        f.calls.push([route, method, body]);
        return { ...body };
      }
      return original(route, method, body);
    };
    save.click();
    await flush();
    const sent = f.calls.find((call) => call[0] === "/services/s1/readings/p1");
    assert.ok(sent, "no se envió la incidencia");
    assert.equal(sent[1], "PATCH");
    assert.equal(sent[2].incident, "Contador roto");
    assert.equal(sent[2].date, "2026-11-02");
    assert.equal(save.disabled, true, "vuelve a quedar sin cambios pendientes");
    assert.match(section.textContent, /Guardado/);
  } finally {
    f.dom.window.close();
  }
});

test("contadores UI: sube las fotos al inmueble y al servicio de su lectura", async () => {
  const f = fixture();
  try {
    const root = f.w.document.querySelector("#community-editor-fees");
    f.w.feeTest.mountFees(root, "community", "c1");
    await flush();
    click(f.w, "Contadores", root);
    click(f.w, "Adjuntar fotos del contador", root);
    await flush();
    const body = f.w.document.querySelector("#fee-dialog-body");
    assert.match(body.textContent, /Parcela|inmueble/);
    const input = body.querySelector('input[type="file"]');
    assert.ok(input.multiple);
    Object.defineProperty(input, "files", {
      value: [new f.w.File(["foto"], "contador.jpg", { type: "image/jpeg" })],
    });
    const original = f.w.api.fees;
    f.w.api.fees = async (route, method, payload) => {
      if (route === "/services/s1/reading-photos/p1" && method === "POST") {
        f.calls.push([route, method, payload]);
        return { id: "photo1", fileName: "contador.jpg", kind: "reading", propertyId: "p1" };
      }
      return original(route, method, payload);
    };
    click(f.w, "Subir fotos del contador", body);
    await flush();
    const sent = f.calls.find((call) => call[0] === "/services/s1/reading-photos/p1");
    assert.ok(sent);
    assert.equal(sent[2].get("file").name, "contador.jpg");
    assert.equal(f.w.document.querySelector("#fee-dialog").open, false);
  } finally {
    f.dom.window.close();
  }
});

test("derrama y servicio: certificado y acciones comparten cabecera aun sin permiso de exportar", async () => {
  const f = fixture();
  try {
    const root = f.w.document.querySelector("#community-editor-fees");
    f.w.feeTest.mountFees(root, "community", "c1");
    await flush();
    for (const tab of ["Derramas", "Servicios"]) {
      click(f.w, tab, root);
      await flush();
      const heading = root.querySelector(".fee-heading-with-certificate");
      assert.equal(
        heading.querySelector(".table-list-actions > .fee-certificate-action").textContent,
        "Certificado de deuda",
      );
      const certificate = heading.querySelector(".fee-certificate-action");
      assert.match(certificate.nextElementSibling.textContent, /Registrar cobro/);
      assert.equal(certificate.parentElement, certificate.nextElementSibling.parentElement);
      assert.ok(heading.querySelector('.table-list-actions [aria-label="Actualizar"]'));
      assert.match(heading.querySelector(".table-list-actions").textContent, /Registrar cobro/);
    }
  } finally {
    f.dom.window.close();
  }
});

test("contadores UI: amplía fotos y permite borrar una o varias sin cerrar la galería", async () => {
  const f = fixture();
  try {
    const photos = ["uno.jpg", "dos.png", "tres.webp"].map((fileName, i) => ({
      id: `photo-${i}`,
      fileName,
      kind: "reading",
      propertyId: "p1",
    }));
    f.data.meters[0].photos = photos;
    const original = f.w.api.fees;
    f.w.api.fees = async (route, method, body) => {
      if (route.startsWith("/service-attachments/") && method === "DELETE") {
        f.calls.push([route, method]);
        return { ok: true };
      }
      return original(route, method, body);
    };
    const root = f.w.document.querySelector("#community-editor-fees");
    f.w.feeTest.mountFees(root, "community", "c1");
    await flush();
    click(f.w, "Contadores", root);
    click(f.w, "Ver fotos del contador de Parcela 1", root);
    await flush();
    const body = f.w.document.querySelector("#fee-dialog-body");
    const preview = () => body.querySelector(".fee-meter-preview img");
    assert.match(preview().src, /photo-0\/download\?preview=1$/);
    assert.equal(body.querySelectorAll(".fee-meter-photo-card").length, 3);
    click(f.w, "Ampliar dos.png", body);
    await flush();
    assert.match(preview().src, /photo-1\/download\?preview=1$/);
    assert.match(body.querySelector("figcaption").textContent, /2 de 3.*dos.png/);
    click(f.w, "Eliminar dos.png", body);
    await flush();
    assert.equal(f.calls.filter((call) => call[1] === "DELETE").length, 0);
    click(f.w, "Cancelar eliminación", body);
    await flush();
    assert.equal(f.data.meters[0].photos.length, 3);
    click(f.w, "Eliminar dos.png", body);
    await flush();
    click(f.w, "Eliminar foto", body);
    await flush();
    assert.equal(body.querySelectorAll(".fee-meter-photo-card").length, 2);
    assert.match(preview().src, /photo-0/);
    assert.equal(f.w.document.querySelector("#fee-dialog").open, true);
    assert.equal(f.w.document.querySelector("#fee-dialog").dataset.busy, "false");
    for (const input of body.querySelectorAll('.fee-meter-photo-card input[type="checkbox"]')) {
      input.checked = true;
      input.dispatchEvent(new f.w.Event("change", { bubbles: true }));
    }
    click(f.w, "Eliminar fotos seleccionadas", body);
    await flush();
    click(f.w, "Eliminar 2 fotos", body);
    await flush();
    assert.equal(body.querySelectorAll(".fee-meter-photo-card").length, 0);
    assert.equal(preview(), null);
    assert.match(body.textContent, /todavía no tiene fotos/);
    assert.equal(f.data.meters[0].photos.length, 0);
    assert.equal(f.calls.filter((call) => call[1] === "DELETE").length, 3);
  } finally {
    f.dom.window.close();
  }
});

test("contadores UI: un error al borrar conserva las fotos pendientes y permite reintentar", async () => {
  const f = fixture();
  try {
    f.data.meters[0].photos = [
      { id: "photo-0", fileName: "uno.jpg" },
      { id: "photo-1", fileName: "dos.jpg" },
    ];
    const original = f.w.api.fees;
    f.w.api.fees = async (route, method, body) => {
      if (method === "DELETE") {
        if (route.includes("photo-1")) throw new Error("No se pudo eliminar la foto");
        return { ok: true };
      }
      return original(route, method, body);
    };
    const root = f.w.document.querySelector("#community-editor-fees");
    f.w.feeTest.mountFees(root, "community", "c1");
    await flush();
    click(f.w, "Contadores", root);
    click(f.w, "Adjuntar fotos del contador", root);
    const body = f.w.document.querySelector("#fee-dialog-body");
    for (const input of body.querySelectorAll('.fee-meter-photo-card input[type="checkbox"]')) {
      input.checked = true;
      input.dispatchEvent(new f.w.Event("change"));
    }
    click(f.w, "Eliminar fotos seleccionadas", body);
    await flush();
    click(f.w, "Eliminar 2 fotos", body);
    await flush();
    assert.equal(body.querySelectorAll(".fee-meter-photo-card").length, 1);
    assert.match(body.textContent, /dos.jpg/);
    assert.deepEqual(
      f.data.meters[0].photos.map((p) => p.id),
      ["photo-1"],
    );
    assert.match(f.w.document.querySelector("[data-fee-error]").textContent, /No se pudo eliminar/);
    assert.equal(f.w.document.querySelector("#fee-dialog").dataset.busy, "false");
  } finally {
    f.dom.window.close();
  }
});

test("cuotas UI: al cerrar el diálogo el foco vuelve al disparador", async () => {
  const f = fixture();
  try {
    f.w.feeTest.renderFeesPage();
    await flush();
    const trigger = [...f.w.document.querySelectorAll("button")].find(
      (b) => b.textContent === "3 · Registrar cobro o anticipo",
    );
    assert.ok(trigger);
    trigger.focus();
    trigger.click();
    await flush();
    const dialog = f.w.document.querySelector("#fee-dialog");
    assert.equal(dialog.open, true);
    dialog.close();
    assert.equal(f.w.document.activeElement, trigger);
  } finally {
    f.dom.window.close();
  }
});
