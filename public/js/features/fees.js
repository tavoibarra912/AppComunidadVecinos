import { api } from "../api.js";
import {
  state,
  getCurrentUser,
  hasPermission,
  refreshState,
} from "../state.js";
import { escapeHtml as esc } from "../html.js";
import { toast, hayCambiosSinGuardar } from "../utils.js";

const money = (cents) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
const amount = (cents) => (cents / 100).toFixed(2);
const date = (value) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const labels = {
  paid: "Pagado",
  partial: "Pago parcial",
  overdue: "Vencido",
  pending: "Pendiente",
  cancelled: "Anulado",
};
const assessmentLabels = {
  draft: "Borrador",
  active: "En curso",
  collected: "Cobrada",
  cancelled: "Anulada",
};
const installmentLabels = {
  pending: "Sin emitir",
  issued: "Emitido",
  partial: "Pago parcial",
  paid: "Pagado",
  overdue: "Vencido",
  cancelled: "Anulado",
};
const methods = {
  transfer: "Transferencia",
  deposit: "Ingreso en cuenta",
  direct_debit: "Domiciliación confirmada",
};
const contexts = new Map();
let dialog = null,
  dialogVersion = 0;
let fieldSequence = 0,
  pageKey = "",
  pageLoadedAt = "";
export function feeNavigation() {
  const user = getCurrentUser();
  const role = state.roles.find(
    (r) => r.nombre === user?.rol || r.id === user?.rol,
  );
  const staff =
    !!user &&
    role?.nombre !== "user" &&
    (hasPermission("fee:read") || hasPermission("fee:manage"));
  const personal =
    !!user &&
    hasPermission("fee:read") &&
    state.owners.some((o) => o.userId === user.id);
  return {
    staff,
    personal,
    visible: staff || personal,
    title: staff ? "Cuotas" : "Mis cuotas",
  };
}
export function mountFeeShortcut(root, kind, id) {
  if (!root) return;
  root.replaceChildren();
  root.className = "fee-shortcut";
  if (!id || !feeNavigation().visible) return;
  info(
    root,
    "Los recibos, cobros y pendientes se consultan en la pantalla de Cuotas.",
  );
  const link = el(
    "a",
    kind === "community"
      ? "Abrir cuotas de esta comunidad"
      : "Abrir cuotas del propietario",
    "secondary-button",
  );
  const params = new URLSearchParams({
    [kind === "community" ? "comunidad" : "propietario"]: id,
  });
  link.href = `#cuotas?${params}`;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const parent = root.closest("dialog");
    if (parent?.open && hayCambiosSinGuardar(root.closest("form"))) {
      if (!root.querySelector(".fee-warning"))
        info(
          root,
          "Guardá o descartá los cambios de la ficha antes de abrir Cuotas.",
          true,
        );
      return;
    }
    parent?.close();
    window.location.hash = link.hash;
  });
  root.append(link);
}
export function renderFeesPage() {
  const root = document.querySelector("#fees-page");
  if (!root) return;
  const access = feeNavigation(),
    user = getCurrentUser();
  if (!access.visible) {
    root.replaceChildren();
    pageKey = "";
    return;
  }
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const communities = access.staff
    ? state.communities.filter(
        (c) =>
          hasPermission("fee:read", c.id) || hasPermission("fee:manage", c.id),
      )
    : [];
  const owner = params.get("propietario");
  const ownProfile =
    owner && state.owners.some((o) => o.id === owner && o.userId === user.id);
  const kind =
    owner && (access.staff || ownProfile)
      ? "owner"
      : access.staff && (!access.personal || params.get("vista") !== "personal")
        ? "community"
        : "mine";
  const requested = params.get("comunidad");
  const communityId = communities.some((c) => c.id === requested)
    ? requested
    : requested && kind === "community"
      ? ""
      : communities[0]?.id || "";
  const id =
    kind === "community" ? communityId : kind === "owner" ? owner : user.id;
  const key = JSON.stringify([
    user.id,
    kind,
    id,
    window.location.hash,
    communities.map((c) => [c.id, c.name]),
    access,
  ]);
  const currentPanel = root.querySelector(".fee-panel");
  if (key === pageKey && currentPanel) {
    if (pageLoadedAt !== state.loadedAt) {
      pageLoadedAt = state.loadedAt;
      const ctx = contexts.get(currentPanel);
      if (ctx) load(currentPanel, ctx);
    }
    return;
  }
  pageKey = key;
  pageLoadedAt = state.loadedAt;
  root.replaceChildren();
  const heading = el("div", undefined, "page-heading"),
    title = el("div");
  title.append(
    el(
      "p",
      kind === "community" ? "GESTIÓN FINANCIERA" : "ÁREA DEL PROPIETARIO",
      "eyebrow",
    ),
    el(
      "h1",
      kind === "community"
        ? "Cuotas"
        : kind === "mine" || ownProfile
          ? "Mis cuotas"
          : "Cuotas del propietario",
    ),
    el(
      "p",
      kind === "community"
        ? "Gestioná las cuotas ordinarias y derramas de cada comunidad, sus recibos y cobros."
        : kind === "owner" && !ownProfile
          ? "Consultá los recibos, pagos y justificantes del propietario seleccionado."
          : "Consultá tus recibos, pagos, vencimientos y justificantes.",
      "subtitle",
    ),
  );
  heading.append(title);
  root.append(heading);
  const scope = el("div", undefined, "fee-scope");
  root.append(scope);
  if (access.staff && access.personal) {
    const view = field(
      scope,
      "Vista de cuotas",
      "select",
      kind === "community" ? "community" : "personal",
      [
        ["community", "Cuotas de comunidades"],
        ["personal", "Mis cuotas"],
      ],
    );
    view.addEventListener("change", () => {
      window.location.hash =
        view.value === "personal" ? "#cuotas?vista=personal" : "#cuotas";
    });
  }
  if (access.staff && kind !== "mine") {
    const select = field(
      scope,
      kind === "community" ? "Comunidad" : "Gestionar cuotas de una comunidad",
      "select",
      kind === "community" ? communityId : "",
      [
        ["", "Elegí una comunidad para gestionar"],
        ...communities.map((c) => [c.id, c.name]),
      ],
    );
    select.addEventListener("change", () => {
      if (select.value)
        window.location.hash = `#cuotas?comunidad=${encodeURIComponent(select.value)}`;
    });
  }
  if (!id) {
    info(
      root,
      requested
        ? "No tenés acceso financiero a la comunidad indicada. Elegí una comunidad de la lista."
        : "No hay comunidades asignadas a tu cuenta para gestionar cuotas.",
    );
    return;
  }
  const panel = el("div");
  root.append(panel);
  mountFees(panel, kind, id, {
    standalone: true,
    community: kind === "mine" ? requested || "" : "",
  });
}
function madridDate() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function errorMessage(message) {
  if (!dialog?.open) {
    toast(message);
    return;
  }
  const box = dialog.querySelector("[data-fee-error]");
  box.textContent = message;
  box.hidden = false;
  box.focus();
}
function validateDialog() {
  for (const input of dialog.querySelectorAll("input,select,textarea")) {
    if (input.disabled || input.closest("[hidden]")) continue;
    if (input.dataset.money !== undefined) {
      const text = input.value.trim();
      input.setCustomValidity(
        /^\d{1,9}([.,]\d{1,2})?$/.test(text) &&
          Number(text.replace(",", ".")) > 0
          ? ""
          : "Introducí un importe positivo con un máximo de dos decimales.",
      );
    }
    if (!input.checkValidity()) {
      input.setAttribute("aria-invalid", "true");
      errorMessage(
        `${input.labels?.[0]?.textContent || "Revisá el campo"}: ${input.validationMessage}`,
      );
      input.focus();
      return false;
    }
  }
  return true;
}
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, action, primary = false) {
  const node = el(
    "button",
    text,
    primary ? "primary-button" : "secondary-button",
  );
  node.type = "button";
  node.addEventListener("click", async () => {
    if (
      node.disabled ||
      (node.closest("#fee-dialog") && dialog.dataset.busy === "true")
    )
      return;
    const version = dialogVersion;
    if (node.closest("#fee-dialog") && primary && !validateDialog()) return;
    const mutation = !!node.closest("#fee-dialog") && primary;
    if (mutation) {
      dialog.dataset.busy = "true";
      dialog.querySelector("[data-fee-close]").disabled = true;
    }
    node.disabled = true;
    node.setAttribute("aria-busy", "true");
    try {
      await action();
    } catch (error) {
      if (!node.closest("#fee-dialog") || version === dialogVersion)
        errorMessage(error.message);
    } finally {
      node.disabled = false;
      if (mutation && version === dialogVersion) {
        dialog.dataset.busy = "false";
        dialog.querySelector("[data-fee-close]").disabled = false;
      }
      node.removeAttribute("aria-busy");
    }
  });
  return node;
}
function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "fee-dialog";
  dialog.setAttribute("aria-labelledby", "fee-dialog-title");
  dialog.innerHTML =
    '<div class="dialog-content fee-dialog-content"><div class="dialog-header"><h2 id="fee-dialog-title"></h2><button type="button" class="secondary-button" data-fee-close>Cerrar</button></div><p class="fee-error" data-fee-error role="alert" tabindex="-1" hidden></p><form id="fee-dialog-body" novalidate></form></div>';
  dialog
    .querySelector("[data-fee-close]")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    dialogVersion++;
    dialog.dataset.busy = "false";
    dialog.querySelector("[data-fee-close]").disabled = false;
  });
  dialog.addEventListener("cancel", (event) => {
    if (dialog.dataset.busy === "true") event.preventDefault();
  });
  dialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const preferred = dialog.querySelector("[data-fee-default-action]");
    if (preferred && !preferred.disabled) {
      preferred.click();
      return;
    }
    const actions = [
      ...dialog.querySelectorAll("#fee-dialog-body .primary-button"),
    ].filter((b) => !b.disabled && !b.closest("[hidden]"));
    if (actions.length === 1) actions[0].click();
  });
  dialog.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      event.target.matches('input:not([type="checkbox"]):not([type="file"])')
    ) {
      event.preventDefault();
      dialog.querySelector("form").requestSubmit();
    }
  });
  document.body.append(dialog);
  return dialog;
}
function open(title) {
  ensureDialog();
  dialogVersion++;
  dialog.dataset.busy = "false";
  dialog.querySelector("[data-fee-close]").disabled = false;
  dialog.querySelector("h2").textContent = title;
  const body = dialog.querySelector("#fee-dialog-body");
  body.replaceChildren();
  dialog.querySelector("[data-fee-error]").hidden = true;
  if (!dialog.open) dialog.showModal();
  return body;
}
function hint(input, text) {
  const node = el("span", text, "fee-field-hint");
  input.closest(".fee-field")?.append(node);
  return node;
}

function field(parent, label, type = "text", value = "", options = []) {
  const wrap = el(
      type === "checkbox" ? "label" : "div",
      undefined,
      type === "checkbox" ? "fee-check" : "fee-field",
    ),
    input = document.createElement(
      type === "select" ? "select" : type === "textarea" ? "textarea" : "input",
    );
  if (type === "select")
    for (const [id, text] of options) {
      const option = el("option", text);
      option.value = id;
      input.append(option);
    }
  else if (type !== "textarea") input.type = type;
  if (type === "checkbox") input.checked = !!value;
  else input.value = value;
  if (type === "number") input.step = "1";
  input.id = `fee-field-${++fieldSequence}`;
  if (type === "checkbox") wrap.htmlFor = input.id;
  const caption = el(
    type === "checkbox" ? "span" : "label",
    label,
    "fee-field-label",
  );
  if (type !== "checkbox") caption.htmlFor = input.id;
  wrap.append(...(type === "checkbox" ? [input, caption] : [caption, input]));
  input.addEventListener("input", () => {
    input.setCustomValidity("");
    input.removeAttribute("aria-invalid");
    if (dialog?.open && input.closest("#fee-dialog"))
      dialog.querySelector("[data-fee-error]").hidden = true;
  });
  parent.append(wrap);
  return input;
}
function info(parent, text, alert = false) {
  const p = el("p", text, alert ? "fee-warning" : "form-intro");
  parent.append(p);
  return p;
}

/**
 * Guía visual del circuito de cuotas. Muestra en qué paso está la comunidad
 * para que quede claro qué hacer primero y qué falta después.
 */
function guide(root, data, manage) {
  const active = data.receipts.filter(
    (r) => !r.cancelledAt && r.kind !== "assessment",
  );
  const issued = active.reduce((sum, r) => sum + r.amount, 0);
  const paid = active.reduce((sum, r) => sum + r.paid, 0);
  const percent = issued ? Math.round((paid / issued) * 100) : 0;
  const configured = data.plans.length > 0;
  const plan = data.plans[0];
  const periodsPerYear = plan
    ? Math.max(1, Math.round(12 / Math.max(1, Number(plan.months) || 1)))
    : 0;
  const periodLabel =
    { 1: "mensual", 3: "trimestral", 6: "semestral", 12: "anual" }[
      Number(plan?.months)
    ] || `cada ${plan?.months || 1} meses`;
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  const steps = [
    {
      done: configured,
      title: "Configurá el acuerdo de cuotas",
      state: configured
        ? `Acuerdo vigente: ${money(plan.annualAmount)} al año en ${plural(periodsPerYear, "periodo", "periodos")} (${periodLabel}), vence el día ${plan.dueDay}.`
        : "Pendiente: todavía no hay importe ni reparto aprobado.",
      text: "Importe anual que necesita la comunidad, reparto por coeficiente o importes por inmueble, periodicidad y día de vencimiento.",
    },
    {
      done: active.length > 0,
      title: "Emití los recibos del periodo",
      state: active.length
        ? `${plural(active.length, "recibo emitido", "recibos emitidos")} por ${money(issued)}.`
        : configured
          ? "Todo listo: el acuerdo está guardado, podés emitir el primer periodo."
          : "Pendiente: primero guardá el acuerdo con el importe y el reparto.",
      text: "Se genera un recibo por inmueble. Antes de confirmar ves una vista previa con importes y vencimiento; no se realiza ningún cargo automático.",
    },
    {
      done: active.length > 0 && percent >= 100,
      title: "Registrá cobros y revisá justificantes",
      state: active.length
        ? `${money(paid)} cobrado (${percent}% de lo emitido). Pendiente: ${money(Math.max(0, issued - paid))}.`
        : "Se habilita después de emitir el primer recibo.",
      text: "Cargá transferencias, ingresos o anticipos. Los saldos a favor se aplican a otros recibos y podés revertir un cobro si fue un error.",
    },
  ];
  const details = el("details", undefined, "fee-guide");
  const doneCount = steps.filter((step) => step.done).length;
  // Abierta mientras el circuito está incompleto: sirve de guía en la puesta
  // en marcha y queda plegada cuando ya hay recibos y cobros en curso.
  details.open = manage && !(configured && active.length > 0);
  const summary = el(
    "summary",
    manage
      ? `¿Cómo funciona? Configurar → emitir → cobrar · ${doneCount} de 3 pasos completados`
      : "¿Cómo se calculan y cobran las cuotas?",
  );
  details.append(summary);
  const list = el("ol", undefined, "fee-steps");
  steps.forEach((step, index) => {
    const item = el("li", undefined, `fee-step${step.done ? " done" : ""}`);
    const number = el("span", String(index + 1), "fee-step-number");
    const body = el("div", undefined, "fee-step-body");
    body.append(
      el("span", step.title, "fee-step-title"),
      el("span", step.state, "fee-step-state"),
      el("span", step.text, "fee-step-text"),
    );
    item.append(number, body);
    list.append(item);
  });
  details.append(list);
  root.append(details);
}
function euroField(parent, label, cents = "") {
  const input = field(parent, label, "text", cents === "" ? "" : amount(cents));
  input.inputMode = "decimal";
  input.maxLength = 12;
  input.placeholder = "0,00";
  input.dataset.money = "";
  input.required = true;
  return input;
}
function status(r) {
  return `<span class="fee-status fee-status-${esc(r.status)}">${esc(labels[r.status])}</span>${r.status === "partial" && r.dueDate < madridDate() ? '<span class="fee-status fee-status-overdue">Vencido</span>' : ""}${r.returned ? '<span class="fee-status fee-status-overdue">Cobro devuelto</span>' : ""}`;
}
function panelTitle(kind, id) {
  return kind === "mine"
    ? "Mis cuotas"
    : kind === "community"
      ? "Cuotas ordinarias de la comunidad"
      : state.owners.some(
            (o) => o.id === id && o.userId === getCurrentUser()?.id,
          )
        ? "Mis cuotas"
        : "Cuotas del propietario";
}
function table(headers, rows) {
  const wrap = el("div", undefined, "fee-table-scroll"),
    table = document.createElement("table");
  table.className = "fee-table";
  table.innerHTML = `<thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>`;
  const body = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const [index, value] of row.entries()) {
      const td = document.createElement("td");
      td.dataset.label = headers[index];
      if (value instanceof Node) td.append(value);
      else td.innerHTML = value;
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  wrap.append(table);
  return wrap;
}
async function reloadAll() {
  await refreshState();
  await Promise.all(
    [...contexts.entries()]
      .filter(
        ([root]) =>
          root.isConnected &&
          (!root.closest("dialog") || root.closest("dialog").open),
      )
      .map(([root, ctx]) => load(root, ctx)),
  );
}
export function mountFees(root, kind, id, options = {}) {
  if (!root) return;
  const ctx = {
    kind,
    id,
    readonly: !!options.readonly,
    version: (contexts.get(root)?.version || 0) + 1,
    period: "",
    community: options.community || "",
    property: "",
    status: "",
    search: "",
    page: 1,
    pageSize: 10,
  };
  for (const node of contexts.keys())
    if (!node.isConnected) contexts.delete(node);
  contexts.set(root, ctx);
  root.classList.add("fee-panel");
  root.classList.toggle("fee-panel-standalone", !!options.standalone);
  root.replaceChildren(el("h3", panelTitle(kind, id)));
  if (!id) {
    info(root, "Guardá primero la ficha para consultar las cuotas.");
    return;
  }
  info(root, "Cargando cuotas…");
  load(root, ctx);
}
async function load(root, ctx) {
  if (contexts.get(root) !== ctx) return;
  const requestVersion = ++ctx.version;
  root.setAttribute("aria-busy", "true");
  try {
    const data = await api.fees(
      ctx.kind === "mine"
        ? "/mine"
        : `/${ctx.kind === "community" ? "communities" : "owners"}/${encodeURIComponent(ctx.id)}`,
    );
    if (contexts.get(root) !== ctx || requestVersion !== ctx.version) return;
    ctx.data = data;
    renderPanel(root, ctx);
  } catch (error) {
    if (contexts.get(root) !== ctx || requestVersion !== ctx.version) return;
    root.replaceChildren(el("h3", "Cuotas ordinarias"));
    info(root, error.message, true);
    root.append(button("Volver a cargar", () => load(root, ctx)));
  } finally {
    if (contexts.get(root) === ctx && requestVersion === ctx.version)
      root.removeAttribute("aria-busy");
  }
}
function renderPanel(root, ctx) {
  const data = ctx.data,
    manage = data.canManage && !ctx.readonly;
  const feeCurrency =
    ctx.kind === "community"
      ? (state.communities.find((c) => c.id === ctx.id)?.currency || "EUR")
          .trim()
          .toUpperCase()
      : "EUR";
  const canConfigure = feeCurrency === "EUR";
  root.replaceChildren(
    el(
      "h3",
      root.classList.contains("fee-panel-standalone")
        ? "Recibos de cuotas y derramas"
        : panelTitle(ctx.kind, ctx.id),
    ),
  );
  const tools = el("div", undefined, "fee-toolbar");
  if (ctx.kind === "community" && canConfigure) guide(root, data, manage);
  if (ctx.kind === "community" && data.canManage) {
    if (canConfigure)
      tools.append(
        button(
          "1 · Configurar acuerdo",
          () => configuration(ctx),
          !data.plans.length,
        ),
      );
    if (manage) {
      if (canConfigure) {
        const emit = button("2 · Emitir recibos", () => emission(ctx), true);
        emit.disabled = !data.plans.length || !data.properties.length;
        tools.append(emit);
      }
      tools.append(
        button("3 · Registrar cobro o anticipo", () => paymentForm(ctx)),
      );
    }
  }
  tools.append(button("Actualizar", () => load(root, ctx)));
  root.append(tools);
  if (ctx.kind === "community" && data.canManage && !canConfigure)
    info(
      root,
      `Las cuotas solo se gestionan en euros. Esta comunidad está configurada en ${feeCurrency}; cambiá su moneda en la ficha de la comunidad para poder configurar o emitir cuotas.`,
      true,
    );
  if (manage && canConfigure && !data.plans.length)
    info(
      root,
      "Para emitir las primeras cuotas, guardá primero el importe aprobado, el reparto y la periodicidad en Configuración y acuerdos.",
    );
  if (manage && canConfigure && !data.properties.length)
    info(
      root,
      "Asociá inmuebles con sus titulares a esta comunidad antes de emitir cuotas.",
    );
  if (
    ctx.kind === "community" &&
    data.canManage &&
    canConfigure &&
    !ctx.readonly
  )
    assessmentSection(root, ctx);
  const filters = el("div", undefined, "fee-filters");
  const periods = [...new Set(data.receipts.map((r) => r.period))]
    .sort()
    .reverse();
  const period = field(filters, "Periodo", "select", ctx.period, [
    ["", "Todos los periodos"],
    ...periods.map((p) => [p, p]),
  ]);
  root.append(filters);
  if (ctx.kind === "owner" || ctx.kind === "mine") {
    const communities = [
      ...new Map(
        data.receipts.map((r) => [r.communityId, r.snapshot.community]),
      ).entries(),
    ];
    if (communities.length > 1) {
      const community = field(filters, "Comunidad", "select", ctx.community, [
        ["", "Todas mis comunidades"],
        ...communities,
      ]);
      community.addEventListener("change", () => {
        ctx.community = community.value;
        ctx.property = "";
        ctx.page = 1;
        renderPanel(root, ctx);
      });
    }
    const properties = [
      ...new Map(
        data.receipts
          .filter((r) => !ctx.community || r.communityId === ctx.community)
          .map((r) => [r.propertyId, r.snapshot.property]),
      ).entries(),
    ];
    if (properties.length > 1) {
      const property = field(filters, "Inmueble", "select", ctx.property, [
        ["", "Todos mis inmuebles"],
        ...properties,
      ]);
      property.addEventListener("change", () => {
        ctx.property = property.value;
        ctx.page = 1;
        renderPanel(root, ctx);
      });
    }
  }
  const statusFilter = field(filters, "Estado", "select", ctx.status, [
    ["", "Todos los estados"],
    ["unpaid", "Con saldo pendiente"],
    ...Object.entries(labels),
  ]);
  const search = field(filters, "Buscar recibos", "search", ctx.search);
  search.placeholder = "Inmueble, titular o comunidad";
  const summary = el("div", undefined, "fee-summary");
  summary.setAttribute("aria-live", "polite");
  root.append(summary);
  const results = el("div", undefined, "fee-receipts-results");
  root.append(results);
  function updateReceipts() {
    const query = ctx.search.trim().toLocaleLowerCase("es");
    const rows = data.receipts.filter(
      (r) =>
        (!ctx.period || r.period === ctx.period) &&
        (!ctx.community || r.communityId === ctx.community) &&
        (!ctx.property || r.propertyId === ctx.property) &&
        (!ctx.status ||
          (ctx.status === "unpaid"
            ? r.outstanding > 0
            : ctx.status === "overdue"
              ? r.outstanding > 0 && r.dueDate < madridDate()
              : r.status === ctx.status)) &&
        (!query ||
          `${r.snapshot.property} ${r.snapshot.community} ${r.snapshot.owners.map((o) => o.name).join(" ")} ${r.period} ${r.concept || ""} ${r.id}`
            .toLocaleLowerCase("es")
            .includes(query)),
    );
    const active = rows.filter((r) => !r.cancelledAt),
      totals = {
        issued: active.reduce((s, r) => s + r.amount, 0),
        paid: active.reduce((s, r) => s + r.paid, 0),
        pending: active.reduce((s, r) => s + r.outstanding, 0),
      };
    summary.replaceChildren();
    results.replaceChildren();
    for (const [key, name] of [
      ["issued", "Emitido"],
      ["paid", "Cobrado"],
      ["pending", "Pendiente"],
    ]) {
      const item = el("div");
      item.append(el("span", name), el("strong", money(totals[key])));
      summary.append(item);
    }
    const pendingProofs = rows.reduce(
      (s, r) => s + r.proofs.filter((p) => p.status === "pending").length,
      0,
    );
    if (manage && pendingProofs)
      info(
        results,
        `${pendingProofs} ${pendingProofs === 1 ? "justificante pendiente" : "justificantes pendientes"} de revisión. Abrí el recibo correspondiente.`,
        true,
      );
    const pages = Math.max(1, Math.ceil(rows.length / ctx.pageSize));
    ctx.page = Math.min(ctx.page, pages);
    if (!rows.length)
      info(
        results,
        data.receipts.length
          ? "No hay recibos que coincidan con estos filtros."
          : "Todavía no hay recibos emitidos.",
      );
    else {
      results.append(
        table(
          [
            "Comunidad / inmueble",
            "Concepto / vencimiento",
            "Importe",
            "Pendiente",
            "Estado",
            "Detalle",
          ],
          rows
            .slice((ctx.page - 1) * ctx.pageSize, ctx.page * ctx.pageSize)
            .map((r) => [
              `<strong>${esc(r.snapshot.property)}</strong><small>${esc(r.snapshot.community)}</small>`,
              `${esc(r.concept || r.period)}<small>${esc(date(r.dueDate))}</small>`,
              money(r.amount),
              money(r.outstanding),
              status(r),
              button("Ver recibo", () => showReceipt(r.id)),
            ]),
        ),
      );
      const pager = el("div", undefined, "fee-pagination");
      const previous = button("Anterior", () => {
        ctx.page--;
        updateReceipts();
      });
      previous.disabled = ctx.page === 1;
      const next = button("Siguiente", () => {
        ctx.page++;
        updateReceipts();
      });
      next.disabled = ctx.page === pages;
      const count = el(
        "span",
        `Mostrando ${(ctx.page - 1) * ctx.pageSize + 1}–${Math.min(ctx.page * ctx.pageSize, rows.length)} de ${rows.length} recibos`,
      );
      count.setAttribute("aria-live", "polite");
      pager.append(count, previous, next);
      results.append(pager);
    }
  }
  period.addEventListener("change", () => {
    ctx.period = period.value;
    ctx.page = 1;
    updateReceipts();
  });
  statusFilter.addEventListener("change", () => {
    ctx.status = statusFilter.value;
    ctx.page = 1;
    updateReceipts();
  });
  search.addEventListener("input", () => {
    ctx.search = search.value;
    ctx.page = 1;
    updateReceipts();
  });
  updateReceipts();
  const credits = data.payments.filter(
    (p) => p.credit > 0 && (!ctx.community || p.communityId === ctx.community),
  );
  if (credits.length) {
    root.append(el("h4", "Saldos a favor"));
    root.append(
      table(
        ["Pagador / comunidad", "Fecha", "Disponible", "Acción"],
        credits.map((p) => [
          esc(ownerName(p.ownerId, data)) +
            `<small>${esc(state.communities.find((c) => c.id === p.communityId)?.name || p.communityId)}</small>`,
          date(p.paidOn),
          money(p.credit),
          manage
            ? button("Aplicar a recibos", () => creditForm(ctx, p))
            : "Saldo disponible para próximas cuotas",
        ]),
      ),
    );
  }
  if (manage && data.payments.length) {
    const history = document.createElement("details");
    history.append(el("summary", "Historial de cobros y devoluciones"));
    history.append(
      table(
        [
          "Fecha / pagador",
          "Importe",
          "Forma / referencia",
          "Estado",
          "Acción",
        ],
        data.payments.map((p) => [
          `${esc(date(p.paidOn))}<small>${esc(ownerName(p.ownerId, data))}</small>`,
          money(p.amount),
          `${esc(methods[p.method])}<small>${esc(p.reference)}</small>`,
          p.reversedAt
            ? `Devuelto<small>${esc(p.reversalReason)}</small>`
            : "Registrado",
          p.reversedAt
            ? "—"
            : button("Revertir / devolver", () =>
                reasonDialog(
                  "Revertir cobro",
                  "Se reabrirán todos los recibos afectados, incluso los pagados con su saldo a favor.",
                  async (reason) => {
                    await api.fees(`/payments/${p.id}/return`, "POST", {
                      reason,
                    });
                    dialog.close();
                    await reloadAll();
                  },
                ),
              ),
        ]),
      ),
    );
    root.append(history);
  }
  info(
    root,
    "Los importes corresponden al inmueble completo. Los porcentajes de titularidad no duplican la cuota entre copropietarios.",
  );
}
function parseMoneyInput(value) {
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  return /^\d{1,9}(\.\d{1,2})?$/.test(text)
    ? Math.round(Number(text) * 100)
    : null;
}
function defaultAssessmentDueDate() {
  const due = new Date(`${madridDate()}T12:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 30);
  return due.toISOString().slice(0, 10);
}
function assessmentStatus(a) {
  return `<span class="fee-status fee-status-${esc(a.status)}">${esc(assessmentLabels[a.status] || a.status)}</span>`;
}
function installmentStatus(installment) {
  const label = installmentLabels[installment.status] || installment.status;
  const overdue =
    installment.status === "partial" && installment.dueDate < madridDate();
  return `<span class="fee-status fee-status-${esc(installment.status)}">${esc(label)}</span>${overdue ? '<span class="fee-status fee-status-overdue">Vencido</span>' : ""}${installment.cancellationReason ? `<small>${esc(installment.cancellationReason)}</small>` : ""}`;
}
function assessmentSection(root, ctx) {
  const data = ctx.data,
    list = data.assessments || [];
  const section = el("section", undefined, "fee-assessments");
  section.setAttribute("aria-labelledby", "fee-assessments-title");
  const heading = el("div", undefined, "fee-section-heading"),
    copy = el("div");
  copy.append(
    el("h4", "Derramas", "fee-section-title"),
    el(
      "p",
      "Cuotas extraordinarias con el reparto congelado al guardar. Cada plazo se emite por separado y usa los mismos recibos, cobros y justificantes que las cuotas ordinarias.",
      "form-intro",
    ),
  );
  copy.querySelector("h4").id = "fee-assessments-title";
  heading.append(copy);
  const create = button("Nueva derrama", () => assessmentForm(ctx), true);
  create.disabled = !(data.properties || []).length;
  heading.append(create);
  section.append(heading);
  if (!list.length)
    info(
      section,
      "Todavía no hay derramas. Creá una para aprobar un gasto extraordinario y emitir sus plazos.",
    );
  else
    section.append(
      table(
        ["Derrama", "Total", "Plazos", "Emitido / cobrado", "Estado", "Acción"],
        list.map((a) => [
          `<strong>${esc(a.name)}</strong><small>${esc(a.purpose || a.agreement)}</small>`,
          money(a.totalAmount),
          `${a.installments.length} ${a.installments.length === 1 ? "plazo" : "plazos"}`,
          `${money(a.totals.issued)}<small>Cobrado ${money(a.totals.paid)}</small>`,
          assessmentStatus(a),
          button("Abrir derrama", () => showAssessment(a.id)),
        ]),
      ),
    );
  root.append(section);
}
function assessmentForm(ctx, assessment = null) {
  const editing = !!assessment,
    body = open(editing ? "Editar derrama" : "Nueva derrama"),
    data = ctx.data,
    grid = el("div", undefined, "fee-form-grid");
  body.append(grid);
  info(
    body,
    editing
      ? "Esta derrama todavía no tiene recibos emitidos. Al guardar se vuelve a congelar el reparto con los coeficientes actuales."
      : "El reparto queda congelado al guardar: los cambios posteriores de coeficientes o del censo no modifican los importes ni los inmuebles incluidos. Los recibos identifican a los titulares al emitir cada plazo.",
  );
  const name = field(
    grid,
    "Nombre de la derrama",
    "text",
    assessment?.name || "",
  );
  name.maxLength = 120;
  name.required = true;
  hint(name, "Por ejemplo: Obras de rehabilitación de la fachada.");
  const purpose = field(
    grid,
    "Motivo de la derrama",
    "textarea",
    assessment?.purpose || "",
  );
  purpose.maxLength = 500;
  hint(purpose, "Detalle opcional que verán los propietarios en el recibo.");
  const agreement = field(
    grid,
    "Acuerdo de Junta que la aprueba",
    "text",
    assessment?.agreement || "",
  );
  agreement.maxLength = 300;
  agreement.required = true;
  hint(agreement, "Número de acta o fecha del acuerdo.");
  const total = euroField(
    grid,
    "Importe total de la derrama (€)",
    assessment?.totalAmount ?? "",
  );
  hint(
    total,
    "Suma de todos los plazos, repartida entre los inmuebles elegidos.",
  );
  const mode = field(
    grid,
    "Criterio de reparto",
    "select",
    assessment?.mode || "coefficient",
    [
      ["coefficient", "Por coeficiente de participación"],
      ["manual", "Importes manuales por inmueble"],
    ],
  );
  hint(
    mode,
    "Coeficiente: reparte el total según la participación de cada inmueble. Manual: fijás el importe de cada inmueble y la suma debe coincidir con el total.",
  );
  body.append(el("h3", "Inmuebles incluidos"));
  info(
    body,
    "Por defecto se incluyen todos los inmuebles. Podés excluir alguno; el reparto solo se aplica a los seleccionados.",
  );
  const selection = el("div", undefined, "fee-form-grid"),
    properties = data.properties || [],
    propertyState = properties.map((property) => ({
      property,
      input: field(
        selection,
        `${property.plot} · coeficiente ${property.coefficient} %`,
        "checkbox",
        !assessment || assessment.propertyIds.includes(property.id),
      ),
    }));
  body.append(selection);
  const manualGrid = el("div", undefined, "fee-form-grid");
  body.append(manualGrid);
  const manualInputs = {};
  for (const { property } of propertyState)
    manualInputs[property.id] = euroField(
      manualGrid,
      `${property.plot} · importe (€)`,
      assessment?.allocations?.[property.id] ?? "",
    );
  body.append(el("h3", "Plazos de la derrama"));
  info(
    body,
    "Cada plazo tiene su importe y vencimiento. La suma de los plazos debe coincidir con el total. Los plazos se emiten de a uno, con vista previa antes de confirmar.",
  );
  const installmentsBox = el("div", undefined, "fee-installments");
  body.append(installmentsBox);
  const rows = [];
  let autoSingle = !editing;
  const installmentsSummary = el("p", undefined, "fee-payment-summary");
  installmentsSummary.setAttribute("aria-live", "polite");
  body.append(installmentsSummary);
  function updateInstallmentsSummary() {
    const sum = rows.reduce(
      (totalSum, row) => totalSum + (parseMoneyInput(row.amount.value) || 0),
      0,
    );
    const expected = parseMoneyInput(total.value);
    installmentsSummary.textContent = expected
      ? `Plazos: ${rows.length} · Suma ${money(sum)} · Total ${money(expected)}${sum === expected ? " · Correcto" : " · La suma debe coincidir con el total"}`
      : `Plazos: ${rows.length} · Suma ${money(sum)}. Completá el total de la derrama.`;
    syncRemoveButtons();
  }
  function syncRemoveButtons() {
    for (const row of rows) row.remove.disabled = rows.length === 1;
  }
  function addInstallment(item = null) {
    const row = el("div", undefined, "fee-installment-row"),
      amountInput = euroField(
        row,
        "Importe del plazo (€)",
        item ? item.amount : "",
      ),
      dueInput = field(
        row,
        "Vencimiento del plazo",
        "date",
        item?.dueDate || defaultAssessmentDueDate(),
      ),
      remove = button("Quitar", () => {
        const index = rows.findIndex((entry) => entry.row === row);
        if (index >= 0) rows.splice(index, 1);
        row.remove();
        updateInstallmentsSummary();
      });
    dueInput.required = true;
    amountInput.addEventListener("input", () => {
      autoSingle = false;
      updateInstallmentsSummary();
    });
    dueInput.addEventListener("input", updateInstallmentsSummary);
    rows.push({ row, amount: amountInput, dueDate: dueInput, remove });
    installmentsBox.append(row);
    updateInstallmentsSummary();
    return row;
  }
  for (const item of assessment?.installments || [null]) addInstallment(item);
  body.append(
    button("Agregar plazo", () => {
      autoSingle = false;
      addInstallment();
    }),
  );
  total.addEventListener("input", () => {
    if (autoSingle && rows.length === 1)
      rows[0].amount.value = total.value.trim();
    updateInstallmentsSummary();
  });
  body.append(el("h3", "Avisos de esta derrama"));
  const reminderDefaults = {
    beforeDays: 3,
    afterDays: 7,
    repeatDays: 0,
    internal: true,
    email: false,
    ...(data.defaults || {}),
    ...(assessment?.reminders || {}),
  };
  const noticeGrid = el("div", undefined, "fee-form-grid");
  body.append(noticeGrid);
  const before = field(
    noticeGrid,
    "Días antes del vencimiento (0 desactiva)",
    "number",
    reminderDefaults.beforeDays,
  );
  const after = field(
    noticeGrid,
    "Días después del vencimiento",
    "number",
    reminderDefaults.afterDays,
  );
  const repeat = field(
    noticeGrid,
    "Repetir aviso vencido cada N días (0: una vez)",
    "number",
    reminderDefaults.repeatDays,
  );
  for (const input of [before, after, repeat]) {
    input.min = "0";
    input.required = true;
  }
  before.max = "60";
  after.max = repeat.max = "365";
  const internal = field(
    noticeGrid,
    "Avisos en el buzón de la app",
    "checkbox",
    reminderDefaults.internal,
  );
  const email = field(
    noticeGrid,
    "Avisos por email a quienes habiliten el canal",
    "checkbox",
    reminderDefaults.email,
  );
  const syncManual = () => {
    manualGrid.hidden = mode.value !== "manual";
    for (const { property, input } of propertyState) {
      const manual = manualInputs[property.id];
      manual.disabled = mode.value !== "manual" || !input.checked;
      manual.required = mode.value === "manual" && input.checked;
    }
    updateInstallmentsSummary();
  };
  mode.addEventListener("change", syncManual);
  for (const { input } of propertyState)
    input.addEventListener("change", syncManual);
  syncManual();
  updateInstallmentsSummary();
  body.append(
    button(
      editing ? "Guardar cambios" : "Crear derrama",
      async () => {
        const selected = propertyState
          .filter(({ input }) => input.checked)
          .map(({ property }) => property.id);
        if (!selected.length) throw new Error("Elegí al menos un inmueble.");
        const expected = parseMoneyInput(total.value);
        const items = rows.map((row) => ({
          amount: row.amount.value,
          dueDate: row.dueDate.value,
        }));
        const sum = items.reduce(
          (totalSum, item) => totalSum + (parseMoneyInput(item.amount) || 0),
          0,
        );
        if (expected && sum !== expected)
          throw new Error(
            `La suma de los plazos (${money(sum)}) debe coincidir con el total (${money(expected)}).`,
          );
        if (mode.value === "manual" && expected) {
          const manualSum = selected.reduce(
            (totalSum, id) =>
              totalSum + (parseMoneyInput(manualInputs[id].value) || 0),
            0,
          );
          if (manualSum !== expected)
            throw new Error(
              `La suma de los importes por inmueble (${money(manualSum)}) debe coincidir con el total (${money(expected)}).`,
            );
        }
        const saved = await api.fees(
          editing
            ? `/assessments/${encodeURIComponent(assessment.id)}`
            : `/communities/${encodeURIComponent(ctx.id)}/assessments`,
          editing ? "PUT" : "POST",
          {
            name: name.value,
            purpose: purpose.value,
            agreement: agreement.value,
            totalAmount: total.value,
            mode: mode.value,
            propertyIds: selected,
            manual: Object.fromEntries(
              Object.entries(manualInputs).map(([id, input]) => [
                id,
                input.value,
              ]),
            ),
            installments: items,
            reminders: {
              beforeDays: Number(before.value),
              afterDays: Number(after.value),
              repeatDays: Number(repeat.value),
              internal: internal.checked,
              email: email.checked,
            },
          },
        );
        dialog.close();
        await reloadAll();
        toast(
          editing
            ? "Derrama actualizada."
            : "Derrama guardada. Todavía no se emitieron recibos.",
        );
        showAssessment(saved.id);
      },
      true,
    ),
  );
}
async function showAssessment(id) {
  const body = open("Derrama"),
    version = dialogVersion;
  info(body, "Cargando derrama…");
  try {
    const a = await api.fees(`/assessments/${encodeURIComponent(id)}`);
    if (version !== dialogVersion || !dialog.open) return;
    body.replaceChildren();
    dialog.querySelector("h2").textContent = a.name;
    const header = el("div", undefined, "fee-receipt-header");
    header.innerHTML = `<h3>${esc(a.name)}</h3><p>${esc(a.purpose || "Derrama extraordinaria")}</p><p>Acuerdo: ${esc(a.agreement)}</p><p>${assessmentStatus(a)}</p>`;
    body.append(header);
    if (a.cancelledAt)
      info(
        body,
        `Anulada el ${date(a.cancelledAt)}. Motivo: ${a.cancellationReason}`,
        true,
      );
    const totals = el("div", undefined, "fee-summary");
    for (const [label, value] of [
      ["Total", a.totals.total],
      ["Emitido", a.totals.issued],
      ["Cobrado", a.totals.paid],
      ["Pendiente", a.totals.outstanding],
      ["Sin emitir", a.totals.unissued],
      ["Anulado", a.totals.cancelled],
    ]) {
      const cell = el("div");
      cell.append(el("span", label), el("strong", money(value)));
      totals.append(cell);
    }
    body.append(totals);
    info(
      body,
      `Reparto ${a.mode === "coefficient" ? "por coeficiente de participación" : "con importes manuales por inmueble"}, congelado al guardar la derrama.`,
    );
    if (a.canEdit)
      body.append(
        button("Editar derrama", async () => {
          const current = dialogVersion;
          const data = await api.fees(
            `/communities/${encodeURIComponent(a.communityId)}`,
          );
          if (current === dialogVersion && dialog.open)
            assessmentForm({ id: a.communityId, data }, a);
        }),
      );
    body.append(el("h3", "Plazos"));
    body.append(
      table(
        [
          "Plazo",
          "Vencimiento",
          "Importe",
          "Emitido",
          "Cobrado",
          "Pendiente",
          "Estado",
          "Acción",
        ],
        a.installments.map((installment) => {
          const actions = el("div", undefined, "fee-row-actions");
          if (installment.status === "pending" && !a.cancelledAt)
            actions.append(
              button(`Emitir plazo ${installment.number}`, () =>
                assessmentEmission(a.id, installment.number),
              ),
            );
          if (
            !a.cancelledAt &&
            installment.status !== "cancelled" &&
            installment.paid === 0
          )
            actions.append(
              button("Anular plazo", () =>
                reasonDialog(
                  `Anular plazo ${installment.number}`,
                  "El plazo quedará anulado y no podrá emitirse. Se anularán sus recibos si ya se emitieron. Si hay cobros aplicados, primero revertilos.",
                  async (reason) => {
                    await api.fees(
                      `/assessments/${encodeURIComponent(a.id)}/cancel`,
                      "POST",
                      { reason, installment: installment.number },
                    );
                    dialog.close();
                    await reloadAll();
                    showAssessment(a.id);
                  },
                ),
              ),
            );
          return [
            String(installment.number),
            date(installment.dueDate),
            money(installment.amount),
            installment.issued ? "Sí" : "No",
            money(installment.paid),
            money(installment.outstanding),
            installmentStatus(installment),
            actions.childNodes.length ? actions : "—",
          ];
        }),
      ),
    );
    if (a.receipts.length) {
      body.append(el("h3", "Recibos generados"));
      body.append(
        table(
          [
            "Inmueble",
            "Titulares",
            "Importe",
            "Cobrado",
            "Pendiente",
            "Estado",
            "Acción",
          ],
          a.receipts.map((r) => [
            `${esc(r.snapshot.property)}<small>Plazo ${r.installment}</small>`,
            esc(r.snapshot.owners.map((o) => o.name).join(", ")),
            money(r.amount),
            money(r.paid),
            money(r.outstanding),
            status(r),
            button("Ver recibo", () => showReceipt(r.id)),
          ]),
        ),
      );
    }
    if (!a.cancelledAt) {
      if (a.totals.paid > 0)
        info(
          body,
          "Para anular la derrama completa primero revertí los cobros aplicados. También podés anular un plazo sin cobros.",
          true,
        );
      const cancel = button("Anular derrama completa", () =>
        reasonDialog(
          "Anular derrama completa",
          "Se anularán todos los recibos activos de la derrama. Los cobros aplicados bloquean esta acción.",
          async (reason) => {
            await api.fees(
              `/assessments/${encodeURIComponent(a.id)}/cancel`,
              "POST",
              { reason },
            );
            dialog.close();
            await reloadAll();
            showAssessment(a.id);
          },
        ),
      );
      cancel.disabled = a.totals.paid > 0;
      body.append(cancel);
    }
  } catch (error) {
    if (version === dialogVersion) {
      body.replaceChildren();
      info(body, error.message, true);
    }
  }
}
async function assessmentEmission(id, number) {
  const body = open(`Emitir plazo ${number}`),
    version = dialogVersion;
  info(body, "Calculando la vista previa del plazo…");
  try {
    const batch = await api.fees(
      `/assessments/${encodeURIComponent(id)}/preview`,
      "POST",
      { installment: number },
    );
    if (version !== dialogVersion || !dialog.open) return;
    body.replaceChildren();
    body.append(
      el(
        "h3",
        `Vista previa · plazo ${batch.installment}/${batch.installmentCount} · ${money(batch.total)}`,
      ),
    );
    info(
      body,
      `Vencimiento ${date(batch.dueDate)}. Se crearán ${batch.rows.length} recibos y se avisará a sus titulares.`,
    );
    for (const warning of batch.warnings) info(body, warning, true);
    body.append(
      table(
        ["Inmueble", "Titulares", "Coeficiente", "Importe"],
        batch.rows.map((r) => [
          esc(r.snapshot.property),
          esc(r.snapshot.owners.map((o) => o.name).join(", ")),
          `${esc(r.snapshot.coefficient)} %`,
          money(r.amount),
        ]),
      ),
    );
    body.append(
      button(
        "Confirmar emisión del plazo",
        async () => {
          await api.fees(
            `/assessments/${encodeURIComponent(id)}/issue`,
            "POST",
            { installment: number, token: batch.token },
          );
          dialog.close();
          await reloadAll();
          toast(
            `Plazo ${number} emitido. Los recibos ya están disponibles para los propietarios.`,
          );
          showAssessment(id);
        },
        true,
      ),
    );
  } catch (error) {
    if (version === dialogVersion) {
      body.replaceChildren();
      info(body, error.message, true);
    }
  }
}
function ownerName(id, data) {
  const owner = state.owners.find((o) => o.id === id);
  return owner
    ? `${owner.name} ${owner.surname}`
    : data.receipts.flatMap((r) => r.snapshot.owners).find((o) => o.id === id)
        ?.name || id;
}
function configuration(ctx) {
  const body = open("Configuración de cuotas ordinarias"),
    data = ctx.data,
    manage = data.canManage && !ctx.readonly;
  if (data.plans.length) {
    body.append(el("h3", "Acuerdos guardados"));
    body.append(
      table(
        ["Desde", "Recaudación anual", "Periodicidad", "Acuerdo"],
        data.plans.map((p) => [
          date(p.effectiveFrom),
          money(p.annualAmount),
          { 1: "Mensual", 3: "Trimestral", 6: "Semestral", 12: "Anual" }[
            Number(p.months)
          ] || `Cada ${p.months} meses`,
          esc(p.agreement),
        ]),
      ),
    );
  }
  if (!manage) return;
  body.append(el("h3", "Nuevo acuerdo"));
  info(
    body,
    "Cada acuerdo queda guardado como una versión. La fecha debe ser posterior a los periodos ya emitidos. Los cambios generales no modifican estos acuerdos.",
  );
  const last = data.plans[0],
    defaults = last?.reminders || data.defaults,
    grid = el("div", undefined, "fee-form-grid");
  body.append(grid);
  const annual = euroField(
    grid,
    "Importe anual a recaudar (€)",
    last?.annualAmount ?? "",
  );
  hint(annual, "Total anual aprobado en Junta para toda la comunidad.");
  const months = field(grid, "Periodicidad", "select", last?.months || "1", [
    ["1", "Mensual"],
    ["3", "Trimestral"],
    ["6", "Semestral"],
    ["12", "Anual"],
  ]);
  hint(months, "Cada cuánto se emite un recibo con la parte proporcional.");
  const from = field(grid, "Aplicar desde (primer día de mes)", "date", "");
  from.type = "month";
  from.closest(".fee-field").querySelector(".fee-field-label").textContent =
    "Aplicar desde (mes)";
  from.required = true;
  hint(from, "Rige desde este mes; no modifica los recibos ya emitidos.");
  const day = field(
    grid,
    "Día de vencimiento (1–28)",
    "number",
    last?.dueDay || 5,
  );
  day.min = "1";
  day.max = "28";
  day.required = true;
  hint(day, "Día del mes en que vence cada recibo.");
  const mode = field(grid, "Reparto", "select", last?.mode || "coefficient", [
    ["coefficient", "Por coeficiente de participación"],
    ["manual", "Importes anuales aprobados por inmueble"],
  ]);
  hint(
    mode,
    "Coeficiente: reparte el importe anual según la participación de cada inmueble. Manual: fijás el importe anual de cada inmueble.",
  );
  const agreement = field(grid, "Referencia del acuerdo de Junta", "text", "");
  agreement.maxLength = 300;
  agreement.required = true;
  hint(
    agreement,
    "Número de acta o fecha del acuerdo que respalda estos importes.",
  );
  const computeAmount = () => {
    const total = Number(annual.value.replace(",", "."));
    const count = Number(months.value);
    const parts = total > 0 && count > 0 ? total / count : 0;
    hintLine.textContent = parts
      ? `Cada periodo se emitirá por ${money(Math.round(parts * 100))} en total (importe anual dividido en ${count} ${count === 1 ? "periodo" : "periodos"}).`
      : "Completá el importe anual para ver cuánto se emitirá en cada periodo.";
  };
  const hintLine = el("p", undefined, "form-intro full");
  body.append(hintLine);
  annual.addEventListener("input", computeAmount);
  months.addEventListener("change", computeAmount);
  computeAmount();
  const manual = el("div", undefined, "fee-form-grid");
  body.append(manual);
  const manualInputs = {};
  for (const p of data.properties)
    manualInputs[p.id] = euroField(
      manual,
      `${p.plot} · importe anual (€)`,
      last?.manual?.[p.id] ?? "",
    );
  const toggle = () => {
    manual.hidden = mode.value !== "manual";
  };
  mode.addEventListener("change", toggle);
  toggle();
  body.append(el("h3", "Avisos de esta comunidad"));
  const noticeGrid = el("div", undefined, "fee-form-grid");
  body.append(noticeGrid);
  const before = field(
    noticeGrid,
    "Días antes del vencimiento (0 desactiva)",
    "number",
    defaults.beforeDays,
  );
  const after = field(
    noticeGrid,
    "Días después del vencimiento",
    "number",
    defaults.afterDays,
  );
  const repeat = field(
    noticeGrid,
    "Repetir aviso vencido cada N días (0: una vez)",
    "number",
    defaults.repeatDays,
  );
  for (const x of [before, after, repeat]) x.min = "0";
  before.max = "60";
  after.max = repeat.max = "365";
  for (const x of [before, after, repeat]) x.required = true;
  if (data.receipts.length) {
    const latest = data.receipts
      .filter((r) => !r.cancelledAt && r.kind !== "assessment")
      .map((r) => r.periodEnd || `${r.period}-28`)
      .sort()
      .at(-1);
    if (latest) {
      const end = new Date(`${latest}T12:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + 1, 1);
      from.min = end.toISOString().slice(0, 7);
    }
  }
  const internal = field(
    noticeGrid,
    "Avisos en el buzón de la app",
    "checkbox",
    defaults.internal,
  );
  const email = field(
    noticeGrid,
    "Avisos por email a quienes habiliten el canal",
    "checkbox",
    defaults.email,
  );
  body.append(
    button(
      "Guardar nuevo acuerdo",
      async () => {
        await api.fees(`/communities/${ctx.id}/plans`, "POST", {
          annualAmount: annual.value,
          months: Number(months.value),
          effectiveFrom: `${from.value}-01`,
          dueDay: Number(day.value),
          mode: mode.value,
          agreement: agreement.value,
          manual: Object.fromEntries(
            Object.entries(manualInputs).map(([id, input]) => [
              id,
              input.value,
            ]),
          ),
          reminders: {
            beforeDays: Number(before.value),
            afterDays: Number(after.value),
            repeatDays: Number(repeat.value),
            internal: internal.checked,
            email: email.checked,
          },
        });
        dialog.close();
        await reloadAll();
        toast("Acuerdo de cuotas guardado.");
      },
      true,
    ),
  );
}
function emission(ctx) {
  const body = open("Emitir cuotas de la comunidad");
  if (!ctx.data.plans.length) {
    info(body, "Guardá primero la configuración de cuotas de esta comunidad.");
    return;
  }
  const month = field(
    body,
    "Mes de inicio del periodo",
    "month",
    madridDate().slice(0, 7),
  );
  month.required = true;
  hint(
    month,
    "Primer mes del periodo a emitir. La vista previa no crea recibos hasta que confirmes.",
  );
  const output = el("div");
  let previewRequest = 0;
  const invalidate = () => {
    previewRequest++;
    output.replaceChildren();
  };
  month.addEventListener("input", invalidate);
  month.addEventListener("change", invalidate);
  const calculate = button("Calcular vista previa", async () => {
    if (!month.checkValidity() || !month.value) {
      month.reportValidity();
      return;
    }
    const version = dialogVersion,
      request = ++previewRequest,
      requestedPeriod = month.value,
      batch = await api.fees(`/communities/${ctx.id}/preview`, "POST", {
        period: requestedPeriod,
      });
    if (
      version !== dialogVersion ||
      !dialog.open ||
      request !== previewRequest ||
      month.value !== requestedPeriod
    )
      return;
    output.replaceChildren(
      el("h3", `Vista previa · ${batch.period} · Total ${money(batch.total)}`),
    );
    info(
      output,
      `Vencimiento: ${date(batch.dueDate)}. Se crearán ${batch.rows.length} recibos.`,
    );
    batch.warnings.forEach((w) => info(output, w, true));
    output.append(
      table(
        ["Inmueble", "Titulares", "Coeficiente", "Importe"],
        batch.rows.map((r) => [
          esc(r.snapshot.property),
          esc(r.snapshot.owners.map((o) => o.name).join(", ")),
          `${esc(r.snapshot.coefficient)} %`,
          money(r.amount),
        ]),
      ),
    );
    output.append(
      button(
        "Confirmar emisión de estos recibos",
        async () => {
          if (month.value !== batch.period) {
            output.replaceChildren();
            throw new Error(
              "El periodo cambió. Volvé a calcular la vista previa.",
            );
          }
          await api.fees(`/communities/${ctx.id}/issue`, "POST", {
            period: batch.period,
            token: batch.token,
          });
          dialog.close();
          await reloadAll();
          toast("Recibos emitidos. No se ha realizado ningún cargo bancario.");
        },
        true,
      ),
    );
  });
  calculate.dataset.feeDefaultAction = "";
  body.append(calculate);
  body.append(output);
}
function receiptSelector(parent, receipts, checked = false) {
  const inputs = [];
  for (const r of receipts
    .filter((r) => !r.cancelledAt && r.outstanding > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const input = field(
      parent,
      `${r.snapshot.property} · ${r.concept || r.period} · pendiente ${money(r.outstanding)}`,
      "checkbox",
      checked,
    );
    inputs.push({ id: r.id, input, outstanding: r.outstanding });
  }
  const selected = () => inputs.filter((x) => x.input.checked).map((x) => x.id);
  selected.total = () =>
    inputs
      .filter((x) => x.input.checked)
      .reduce((sum, x) => sum + x.outstanding, 0);
  selected.inputs = inputs;
  return selected;
}
function paymentForm(ctx, receipt = null) {
  const data = ctx.data,
    body = open("Registrar cobro o anticipo"),
    grid = el("div", undefined, "fee-form-grid");
  body.append(grid);
  const owners = new Map();
  for (const r of data.receipts)
    for (const o of r.snapshot.owners) owners.set(o.id, o.name);
  for (const p of state.properties.filter((p) => p.communityId === ctx.id))
    for (const id of p.ownerIds) owners.set(id, ownerName(id, data));
  if (!owners.size) {
    info(
      body,
      "La comunidad necesita inmuebles con propietarios para registrar cobros.",
    );
    return;
  }
  const payer = field(
    grid,
    "Pagador",
    "select",
    receipt?.snapshot.owners[0]?.id || [...owners.keys()][0],
    [...owners.entries()],
  );
  const value = euroField(
    grid,
    "Importe recibido (€)",
    receipt?.outstanding ?? "",
  );
  const paidOn = field(grid, "Fecha del cobro", "date", madridDate());
  paidOn.max = madridDate();
  paidOn.required = true;
  const method = field(
    grid,
    "Forma de pago",
    "select",
    "transfer",
    Object.entries(methods),
  );
  const reference = field(grid, "Referencia bancaria", "text");
  reference.maxLength = 120;
  const duplicate = field(
    grid,
    "Confirmo que es otro cobro si coincide con uno registrado",
    "checkbox",
    false,
  );
  duplicate.closest("label").hidden = true;
  info(
    body,
    "Seleccioná los recibos a los que aplicar el cobro. Se cubren primero los más antiguos; cualquier sobrante queda a favor del pagador en esta comunidad.",
  );
  const selection = el("div", undefined, "fee-receipt-selection");
  body.append(selection);
  const distribution = el("p", undefined, "fee-payment-summary");
  distribution.setAttribute("aria-live", "polite");
  body.append(distribution);
  let ids;
  function updateDistribution() {
    const text = value.value.trim();
    if (
      !/^\d{1,9}([.,]\d{1,2})?$/.test(text) ||
      Number(text.replace(",", ".")) <= 0
    ) {
      distribution.textContent = text
        ? "Revisá el importe: debe ser positivo y tener como máximo dos decimales."
        : "Indicá el importe recibido para ver su reparto entre recibos y saldo a favor.";
      return;
    }
    const entered = Number(text.replace(",", "."));
    const cents =
      Number.isFinite(entered) && entered > 0 ? Math.round(entered * 100) : 0;
    const applied = Math.min(cents, ids?.total() || 0);
    distribution.textContent = `Aplicado a recibos: ${money(applied)} · Saldo a favor: ${money(cents - applied)}`;
  }
  function update() {
    selection.replaceChildren();
    ids = receiptSelector(
      selection,
      data.receipts.filter((r) =>
        r.snapshot.owners.some((o) => o.id === payer.value),
      ),
      true,
    );
    if (receipt && payer.value === receipt.snapshot.owners[0]?.id)
      for (const item of ids.inputs)
        item.input.checked = item.id === receipt.id;
    if (!ids.inputs.length)
      info(
        selection,
        "Este pagador no tiene recibos pendientes. El cobro se guardará como saldo a favor.",
      );
    for (const item of ids.inputs)
      item.input.addEventListener("change", updateDistribution);
    updateDistribution();
  }
  payer.addEventListener("change", update);
  value.addEventListener("input", updateDistribution);
  update();
  const requestId = crypto.randomUUID();
  body.append(
    button(
      "Guardar cobro",
      async () => {
        try {
          await api.fees(`/communities/${ctx.id}/payments`, "POST", {
            ownerId: payer.value,
            amount: value.value,
            paidOn: paidOn.value,
            method: method.value,
            reference: reference.value,
            receiptIds: ids(),
            requestId,
            confirmDuplicate: duplicate.checked,
          });
        } catch (error) {
          if (
            error.status === 409 &&
            error.message.includes("Posible cobro duplicado")
          )
            duplicate.closest("label").hidden = false;
          throw error;
        }
        dialog.close();
        await reloadAll();
        toast("Cobro registrado.");
      },
      true,
    ),
  );
}
function creditForm(ctx, payment) {
  const body = open(`Aplicar saldo a favor · ${money(payment.credit)}`);
  const ids = receiptSelector(
    body,
    ctx.data.receipts.filter((r) =>
      r.snapshot.owners.some((o) => o.id === payment.ownerId),
    ),
    true,
  );
  if (!ids.inputs.length)
    info(
      body,
      "No hay recibos pendientes del pagador a los que aplicar este saldo.",
    );
  const apply = button(
    "Aplicar saldo",
    async () => {
      if (!ids().length)
        throw new Error("Seleccioná al menos un recibo pendiente.");
      await api.fees(`/payments/${payment.id}/allocate`, "POST", {
        receiptIds: ids(),
      });
      dialog.close();
      await reloadAll();
    },
    true,
  );
  const toggle = () => {
    apply.disabled = !ids().length;
  };
  for (const item of ids.inputs) item.input.addEventListener("change", toggle);
  toggle();
  body.append(apply);
}
function reasonDialog(title, description, action) {
  const body = open(title);
  info(body, description, true);
  const reason = field(body, "Motivo", "textarea");
  reason.maxLength = 500;
  reason.required = true;
  body.append(button("Cancelar", () => dialog.close()));
  body.append(
    button(
      "Confirmar",
      async () => {
        if (!reason.value.trim()) throw new Error("Indicá el motivo.");
        await action(reason.value);
      },
      true,
    ),
  );
}
export async function showReceipt(id) {
  const body = open("Recibo"),
    version = dialogVersion;
  info(body, "Cargando recibo…");
  try {
    const r = await api.fees(`/receipts/${encodeURIComponent(id)}`);
    if (version !== dialogVersion || !dialog.open) return;
    body.replaceChildren();
    dialog.querySelector("h2").textContent =
      r.kind === "assessment"
        ? "Recibo de derrama"
        : "Recibo de cuota ordinaria";
    const header = el("div", undefined, "fee-receipt-header");
    header.innerHTML = `<h3>${esc(r.snapshot.community)} · ${esc(r.snapshot.property)}</h3><p>${esc(r.concept || `Cuota ${r.period}`)} · Vencimiento ${esc(date(r.dueDate))}</p><p>${esc(r.snapshot.owners.map((o) => o.name).join(", "))}</p><p>${status(r)}</p>`;
    body.append(header);
    if (r.snapshot.assessmentPurpose) info(body, r.snapshot.assessmentPurpose);
    const totals = el("div", undefined, "fee-summary");
    for (const [label, value] of [
      ["Importe", r.amount],
      ["Cobrado", r.paid],
      ["Pendiente", r.outstanding],
    ]) {
      const cell = el("div");
      cell.append(el("span", label), el("strong", money(value)));
      totals.append(cell);
    }
    body.append(totals);
    const community = state.communities.find((c) => c.id === r.communityId);
    const iban = r.snapshot.communityIban || community?.iban || "";
    if (iban) {
      const paymentInfo = el("div", undefined, "fee-payment-info");
      paymentInfo.append(
        el("strong", "Datos para transferencia"),
        el("span", iban),
      );
      body.append(paymentInfo);
    }
    if (r.canManage && !r.cancelledAt && r.outstanding > 0)
      body.append(
        button("Registrar cobro de este recibo", async () => {
          const current = dialogVersion;
          const data = await api.fees(
            `/communities/${encodeURIComponent(r.communityId)}`,
          );
          if (current === dialogVersion && dialog.open)
            paymentForm({ id: r.communityId, data }, r);
        }),
      );
    info(body, `Acuerdo: ${r.snapshot.agreement}. Identificador: ${r.id}`);
    if (r.cancelledAt)
      info(
        body,
        `Anulado el ${date(r.cancelledAt)}. Motivo: ${r.cancellationReason}`,
        true,
      );
    if (r.payments.length)
      body.append(
        table(
          ["Fecha", "Movimiento", "Importe", "Estado"],
          r.payments.map((p) => [
            date(p.paidOn),
            esc(methods[p.method]),
            money(p.amount),
            p.reversedAt
              ? `Devuelto<small>${esc(p.reversalReason)}</small>`
              : "Aplicado",
          ]),
        ),
      );
    body.append(
      button("Descargar extracto del recibo", () => downloadReceipt(r)),
    );
    body.append(el("h3", "Justificantes"));
    info(
      body,
      "Aceptar un justificante no registra un cobro. Administración confirma el movimiento bancario y registra el pago por separado.",
    );
    for (const proof of r.proofs) {
      const row = el("div", undefined, "fee-proof"),
        link = el("a", proof.fileName);
      link.href = `/api/fees/proofs/${encodeURIComponent(proof.id)}/download`;
      link.download = proof.fileName;
      row.append(
        link,
        el(
          "span",
          {
            pending: "Pendiente de revisión",
            accepted: "Aceptado para comprobación bancaria",
            rejected: "Rechazado",
          }[proof.status],
        ),
      );
      if (proof.note) row.append(el("p", proof.note));
      if (r.canManage && proof.status === "pending")
        for (const [status, label] of [
          ["accepted", "Aceptar justificante"],
          ["rejected", "Rechazar"],
        ])
          row.append(
            button(label, () =>
              reasonDialog(
                label,
                "Indicá el resultado de la revisión. El cobro se registra por separado.",
                async (note) => {
                  await api.fees(`/proofs/${proof.id}/review`, "POST", {
                    status,
                    note,
                  });
                  await reloadAll();
                  await showReceipt(id);
                },
              ),
            ),
          );
      body.append(row);
    }
    const user = getCurrentUser(),
      own = r.snapshot.owners.some((o) =>
        state.owners.some((p) => p.id === o.id && p.userId === user?.id),
      );
    if (own && !r.cancelledAt && r.outstanding > 0) {
      const file = field(
        body,
        "Adjuntar justificante (PDF, JPG, PNG o WebP; máximo 10 MB)",
        "file",
      );
      file.accept = ".pdf,.jpg,.jpeg,.png,.webp";
      body.append(
        button(
          "Enviar justificante para revisión",
          async () => {
            if (!file.files[0]) throw new Error("Seleccioná un archivo.");
            if (file.files[0].size > 10 * 1024 * 1024)
              throw new Error("El archivo supera 10 MB.");
            const form = new FormData();
            form.append("file", file.files[0]);
            await api.fees(`/receipts/${id}/proofs`, "POST", form);
            await reloadAll();
            await showReceipt(id);
            toast("Justificante enviado para revisión.");
          },
          true,
        ),
      );
    }
    if (r.canManage && !r.cancelledAt && r.paid === 0)
      body.append(
        button("Anular recibo", () =>
          reasonDialog(
            "Anular recibo",
            "El recibo conservará su historial y dejará de tener saldo pendiente.",
            async (reason) => {
              await api.fees(`/receipts/${id}/cancel`, "POST", { reason });
              await reloadAll();
              await showReceipt(id);
            },
          ),
        ),
      );
  } catch (error) {
    if (version === dialogVersion) {
      body.replaceChildren();
      info(body, error.message, true);
    }
  }
}
function downloadReceipt(r) {
  const community = state.communities.find((c) => c.id === r.communityId);
  const rows = [
    ["Comunidad", r.snapshot.community],
    ["Inmueble", r.snapshot.property],
    ["Titulares", r.snapshot.owners.map((o) => o.name).join(" / ")],
    ["Recibo", r.id],
    ["Concepto", r.concept || `Cuota ${r.period}`],
    ...(r.snapshot.assessmentPurpose
      ? [["Motivo de la derrama", r.snapshot.assessmentPurpose]]
      : []),
    ["Periodo", r.period],
    ["Vencimiento", r.dueDate],
    ["Importe EUR", amount(r.amount)],
    ["Cobrado EUR", amount(r.paid)],
    ["Pendiente EUR", amount(r.outstanding)],
    ["Estado", labels[r.status]],
    ["Acuerdo", r.snapshot.agreement],
    [
      "IBAN para transferencia",
      r.snapshot.communityIban || community?.iban || "",
    ],
    ["", ""],
    ["Fecha", "Método", "Aplicado EUR", "Estado"],
  ];
  for (const p of r.payments)
    rows.push([
      p.paidOn,
      methods[p.method],
      amount(p.amount),
      p.reversedAt ? "Devuelto" : "Aplicado",
    ]);
  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v)
                .replace(/^\s*[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `${r.kind === "assessment" ? "derrama" : "cuota"}-${r.period}-${r.id.slice(0, 8)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Links from both notification inboxes open the same authorized receipt detail.
window.addEventListener("fees:receipt", (event) => {
  for (const node of document.querySelectorAll(
    "#notifications-dialog[open],#admin-email-dialog[open]",
  ))
    node.close();
  if (feeNavigation().visible) window.location.hash = "#cuotas";
  showReceipt(event.detail.id);
});
