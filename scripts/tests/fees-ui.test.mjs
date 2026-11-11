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
test("cuotas UI: una comunidad que no usa euros no ofrece configurar ni emitir", async () => {
  const f = fixture();
  try {
    f.w.state.communities[0].currency = "USD";
    f.w.location.hash = "#cuotas?comunidad=c1";
    f.w.feeTest.renderFeesPage();
    await flush();
    const root = f.w.document.querySelector("#fees-page .fee-panel");
    const labels = [...root.querySelectorAll("button")].map(
      (b) => b.textContent,
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

test("derramas UI: valida y crea reparto manual con selección y plazos; emite con token de vista previa", async () => {
  const f = assessmentFixture();
  try {
    f.w.feeTest.renderFeesPage();
    await flush();
    click(f.w, "Nueva derrama");
    control(f.w, "Nombre de la derrama").value = "Obras de fachada";
    control(f.w, "Acuerdo de Junta que la aprueba").value =
      "Junta extraordinaria";
    const total = control(f.w, "Importe total de la derrama (€)");
    total.value = "200";
    total.dispatchEvent(new f.w.Event("input"));
    const mode = control(f.w, "Criterio de reparto");
    mode.value = "manual";
    mode.dispatchEvent(new f.w.Event("change"));
    control(f.w, "Parcela 1 · importe (€)").value = "200";
    const first = f.w.document.querySelector(
      ".fee-installment-row input[data-money]",
    );
    first.value = "100";
    first.dispatchEvent(new f.w.Event("input"));
    f.w.document.querySelector(
      '.fee-installment-row input[type="date"]',
    ).value = "2030-12-10";
    click(f.w, "Agregar plazo");
    const second = f.w.document.querySelectorAll(".fee-installment-row")[1];
    second.querySelector("input[data-money]").value = "90";
    second.querySelector('input[type="date"]').value = "2031-01-10";
    click(f.w, "Crear derrama");
    await flush();
    assert.match(
      f.w.document.querySelector("[data-fee-error]").textContent,
      /suma de los plazos/,
    );
    assert.equal(
      f.calls.some((c) => c[0].endsWith?.("/assessments") && c[1] === "POST"),
      false,
    );
    second.querySelector("input[data-money]").value = "100";
    click(f.w, "Crear derrama");
    await flush();
    const saved = f.calls.find(
      (c) => c[0] === "/communities/c1/assessments" && c[1] === "POST",
    );
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
    assert.match(
      f.w.document.querySelector("#fee-dialog-body").textContent,
      /Vista previa.*1\/2/,
    );
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
    f.w.feeTest.renderFeesPage();
    await flush();
    click(f.w, "Abrir derrama");
    await flush();
    click(f.w, "Editar derrama");
    await flush();
    assert.equal(
      control(f.w, "Importe total de la derrama (€)").value,
      "200.00",
    );
    assert.deepEqual(
      [
        ...f.w.document.querySelectorAll(
          ".fee-installment-row input[data-money]",
        ),
      ].map((i) => i.value),
      ["100.00", "100.00"],
    );
    assert.match(
      f.w.document.querySelector(".fee-payment-summary").textContent,
      /Correcto/,
    );
    click(f.w, "Guardar cambios");
    await flush();
    const request = f.calls.find(
      (c) => c[0] === "/assessments/a1" && c[1] === "PUT",
    );
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
    f.w.feeTest.renderFeesPage();
    await flush();
    click(f.w, "Abrir derrama");
    await flush();
    click(f.w, "Anular plazo");
    control(f.w, "Motivo").value = "Acuerdo revocado";
    click(f.w, "Confirmar");
    await flush();
    const request = f.calls.find((c) => c[0] === "/assessments/a1/cancel");
    assert.equal(request[2].installment, 1);
    assert.equal(request[2].reason, "Acuerdo revocado");
    const buttons = [
      ...f.w.document.querySelectorAll("#fee-dialog-body button"),
    ].map((b) => b.textContent);
    assert.equal(buttons.includes("Emitir plazo 1"), false);
    assert.equal(buttons.includes("Emitir plazo 2"), true);
    assert.equal(buttons.includes("Editar derrama"), false);
    assert.match(
      f.w.document.querySelector("#fee-dialog-body").textContent,
      /Anulado/,
    );
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
    f.w.feeTest.renderFeesPage();
    await flush();
    click(f.w, "Abrir derrama");
    await flush();
    const body = f.w.document.querySelector("#fee-dialog-body");
    const firstRow = body.querySelector("tbody tr");
    assert.equal(
      [...firstRow.querySelectorAll("button")].some(
        (b) => b.textContent === "Anular plazo",
      ),
      false,
    );
    assert.equal(
      [...body.querySelectorAll("button")].find(
        (b) => b.textContent === "Anular derrama completa",
      ).disabled,
      true,
    );
    assert.match(body.textContent, /primero revertí los cobros/);
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
    f.w.feeTest.renderFeesPage();
    await flush();
    const root = f.w.document.querySelector("#fees-page");
    assert.match(root.textContent, /Derrama.*plazo 1\/2/);
    assert.equal(
      [...root.querySelectorAll("button")].some(
        (b) => b.textContent === "Nueva derrama",
      ),
      false,
    );
    click(f.w, "Ver recibo");
    await flush();
    assert.match(
      f.w.document.querySelector("#fee-dialog h2").textContent,
      /Recibo de derrama/,
    );
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
