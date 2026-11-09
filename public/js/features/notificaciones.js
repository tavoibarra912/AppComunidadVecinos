import { escapeHtml } from "../html.js";
import { api } from "../api.js";
import {
  state,
  getCurrentOwnerProfileId,
  hasPermission,
  requirePermission,
} from "../state.js";
import { toast } from "../utils.js";
import { openOwnerDetail } from "./propietarios.js";

const topbarInboxBtn = document.querySelector("#topbar-inbox-btn");
const inboxBadgeCount = document.querySelector("#inbox-badge-count");
const adminInboxDialog = document.querySelector("#admin-inbox-dialog");
const adminInboxList = document.querySelector("#admin-inbox-list");
const adminEmailDialog = document.querySelector("#admin-email-dialog");
const emailGotoApprovalBtn = document.querySelector("#email-goto-approval-btn");
const emailMailtoLink = document.querySelector("#email-mailto-link");
const ownerInboxBadgeCount = document.querySelector("#owner-inbox-badge-count");
const ownerInboxDialog = document.querySelector("#owner-inbox-dialog");
const ownerInboxList = document.querySelector("#owner-inbox-list");
const closeAdminInboxDialog = document.querySelector(
  "#close-admin-inbox-dialog",
);
const topbarOwnerInboxBtn = document.querySelector("#topbar-owner-inbox-btn");
const closeOwnerInboxDialog = document.querySelector(
  "#close-owner-inbox-dialog",
);
const markAllOwnerNotifsReadBtn = document.querySelector(
  "#mark-all-owner-notifs-read-btn",
);
const inboxViews = {
  admin: { filter: "all", search: "" },
  owner: { filter: "all", search: "" },
};
let ownerBulkBusy = false;
const ownerReadPending = new Set();
const mailIcon =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>';
const checkIcon =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
function inboxSummary(kind, items) {
  const unread = items.filter((n) => !n.read).length;
  document.querySelector(`#${kind}-inbox-summary`).innerHTML =
    `<span class="notification-summary-icon">${unread ? mailIcon : checkIcon}</span><div><strong>${unread ? `${unread} ${unread === 1 ? "aviso sin leer" : "avisos sin leer"}` : "Estás al día"}</strong><span>${items.length} ${items.length === 1 ? "aviso en el historial" : "avisos en el historial"}</span></div>`;
  document
    .querySelectorAll(`[data-${kind}-inbox-filter]`)
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(
          button.dataset[`${kind}InboxFilter`] === inboxViews[kind].filter,
        ),
      ),
    );
  return unread;
}
function visibleInbox(kind, items, searchable) {
  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase();
  const { filter, search } = inboxViews[kind];
  return items
    .filter(
      (n) =>
        (filter === "all" || (filter === "read" ? !!n.read : !n.read)) &&
        normalize(searchable(n)).includes(normalize(search.trim())),
    )
    .sort(
      (a, b) =>
        Number(!!a.read) - Number(!!b.read) ||
        (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0),
    );
}
function inboxResults(kind, visible, total) {
  document.querySelector(`#${kind}-inbox-results`).textContent = total
    ? `Mostrando ${visible} de ${total} ${total === 1 ? "aviso" : "avisos"}`
    : "";
}
function inboxEmpty(list, kind, total) {
  const { filter, search } = inboxViews[kind];
  const title = !total
    ? "Todavía no hay avisos"
    : search.trim()
      ? "No encontramos coincidencias"
      : filter === "unread"
        ? "No quedan avisos sin leer"
        : "No hay avisos leídos";
  const message = !total
    ? kind === "admin"
      ? "Las solicitudes y novedades de los propietarios aparecerán aquí, con su comunidad y documentación."
      : "Acá vas a recibir las respuestas de administración y las novedades sobre tus documentos."
    : "Probá con otra búsqueda o elegí «Todos» para consultar el historial.";
  list.innerHTML = `<div class="notification-inbox-empty" role="listitem"><span>${filter === "unread" && !search.trim() ? checkIcon : mailIcon}</span><h3>${title}</h3><p>${message}</p></div>`;
}
function notificationDate(n) {
  return (
    n.date ||
    (n.timestamp
      ? new Date(n.timestamp).toLocaleString("es-ES", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Fecha no disponible")
  );
}
function setOwnerFeedback(message, error = false) {
  const el = document.querySelector("#owner-inbox-feedback");
  el.textContent = message;
  el.classList.toggle("is-error", error);
}

export function getOwnerOverallDocStatus(owner) {
  const status = getOwnerDocStatus(owner);
  const labelMap = {
    approved: "Aprobada (3/3)",
    pending_admin: "Pendiente Admin (3/3)",
    incomplete: "Incompleta",
    rejected: "Rechazada",
    none: "Sin documentos",
  };
  return {
    status,
    label: labelMap[status] || status,
    class: getDocBadgeClass(status),
  };
}

export function getOwnerDocStatus(owner) {
  if (!owner || !owner.documents) return "none";
  const docs = owner.documents;
  const keys = ["dni", "bankReceipt", "propertyDeed"];
  const uploaded = keys.filter((k) => !!docs[k]);
  if (uploaded.length === 0) return "none";

  // Si algún documento ha sido rechazado por el Administrador
  const anyRejected = uploaded.some(
    (k) => docs[k].adminApproval && docs[k].adminApproval.status === "rejected",
  );
  if (anyRejected) return "rejected";

  // Si los 3 documentos están formalmente aprobados por el Administrador
  const allApproved = keys.every(
    (k) =>
      docs[k] &&
      docs[k].adminApproval &&
      docs[k].adminApproval.status === "approved",
  );
  if (uploaded.length === 3 && allApproved) return "approved";

  // Si los 3 documentos están subidos y validados por el sistema (esperando resolución de admin)
  if (uploaded.length === 3) return "pending_admin";

  return "incomplete";
}

export function getDocBadgeClass(status) {
  switch (status) {
    case "approved":
      return "doc-approved";
    case "pending_admin":
      return "doc-pending-admin";
    case "incomplete":
      return "doc-incomplete";
    case "rejected":
      return "doc-rejected";
    default:
      return "doc-none";
  }
}

export function getDocBadgeText(status, owner) {
  const docs = (owner && owner.documents) || {};
  const count = ["dni", "bankReceipt", "propertyDeed"].filter(
    (k) => !!docs[k],
  ).length;
  switch (status) {
    case "approved":
      return "✓ Aprobada (3/3)";
    case "pending_admin":
      return "⏳ Pendiente Admin (3/3)";
    case "incomplete":
      return `⚠️ Incompleta (${count}/3)`;
    case "rejected":
      return "❌ Rechazada";
    default:
      return "⚪ Sin documentos (0/3)";
  }
}

export function updateInboxBadge() {
  const count = state.adminEmails.filter((n) => !n.read).length;
  if (inboxBadgeCount) {
    inboxBadgeCount.textContent = count;
    inboxBadgeCount.hidden = !count;
  }
  if (adminInboxDialog?.open) renderAdminInbox();
  window.dispatchEvent(new Event("notifications:updated"));
}
export function updateOwnerInboxBadge() {
  const count = state.ownerNotifications.filter(
    (n) => !n.read && n.ownerId === getCurrentOwnerProfileId(),
  ).length;
  if (ownerInboxBadgeCount) {
    ownerInboxBadgeCount.textContent = count;
    ownerInboxBadgeCount.hidden = !count;
  }
  if (ownerInboxDialog?.open) renderOwnerInbox();
  window.dispatchEvent(new Event("notifications:updated"));
}
export async function addOwnerNotification({
  ownerId,
  title,
  type = "info",
  message,
}) {
  try {
    const result = await api.createOwnerNotification({
      ownerId: ownerId || getCurrentOwnerProfileId(),
      title,
      type,
      message,
      date: new Date().toLocaleString("es-ES"),
      timestamp: Date.now(),
    });
    state.ownerNotifications.unshift(result);
    updateOwnerInboxBadge();
    return result;
  } catch (error) {
    toast(error.message);
    return null;
  }
}
export function openOwnerInbox() {
  if (!requirePermission("owner_notification:read", getCurrentOwnerProfileId()))
    return;
  setOwnerFeedback("");
  renderOwnerInbox();
  if (!ownerInboxDialog.open) ownerInboxDialog.showModal();
}
export function renderOwnerInbox() {
  if (!ownerInboxList) return;
  ownerInboxList.replaceChildren();
  if (!hasPermission("owner_notification:read", getCurrentOwnerProfileId()))
    return;
  const notifications = state.ownerNotifications.filter(
    (n) => n.ownerId === getCurrentOwnerProfileId(),
  );
  const unread = inboxSummary("owner", notifications);
  markAllOwnerNotifsReadBtn.disabled =
    ownerBulkBusy || ownerReadPending.size > 0 || unread === 0;
  markAllOwnerNotifsReadBtn.querySelector("span").textContent = ownerBulkBusy
    ? "Marcando avisos…"
    : unread
      ? `Marcar ${unread} ${unread === 1 ? "como leído" : "como leídos"}`
      : "Todo está leído";
  markAllOwnerNotifsReadBtn.title = unread
    ? "Se aplica a todos tus avisos sin leer, incluso con filtros activos."
    : "No tenés avisos pendientes de lectura.";
  ownerInboxList.setAttribute(
    "aria-busy",
    String(ownerBulkBusy || ownerReadPending.size > 0),
  );
  const visible = visibleInbox(
    "owner",
    notifications,
    (n) => `${n.title} ${n.message}`,
  );
  inboxResults("owner", visible.length, notifications.length);
  if (!visible.length) {
    inboxEmpty(ownerInboxList, "owner", notifications.length);
    return;
  }
  const labels = {
    info: "Información",
    success: "Gestión completada",
    warning: "Requiere atención",
    error: "Requiere atención",
  };
  for (const n of visible) {
    const card = document.createElement("article");
    card.className = `notification-message ${n.read ? "" : "unread"}`;
    card.setAttribute("role", "listitem");
    card.dataset.notificationId = n.id;
    card.innerHTML = `<div class="notification-message-header"><span class="notification-category">${escapeHtml(labels[n.type] || "Aviso")}</span><span class="notification-read-state ${n.read ? "" : "is-unread"}">${n.read ? "Leído" : "Sin leer"}</span></div><h3>${escapeHtml(n.title || "Aviso de administración")}</h3><p class="notification-message-body">${escapeHtml(n.message)}</p><div class="notification-message-footer"><span class="notification-date">${escapeHtml(notificationDate(n))}</span>${n.read ? "" : '<button type="button" class="secondary-button notification-read-button">Marcar como leído</button>'}</div>`;
    const button = card.querySelector("button");
    if (button) {
      button.disabled = ownerBulkBusy || ownerReadPending.has(n.id);
      if (ownerReadPending.has(n.id)) button.textContent = "Marcando…";
      button.addEventListener("click", () => markOwnerRead(n.id));
    }
    ownerInboxList.append(card);
  }
}
async function markOwnerRead(id) {
  if (ownerBulkBusy || ownerReadPending.has(id)) return;
  ownerReadPending.add(id);
  setOwnerFeedback("");
  renderOwnerInbox();
  try {
    await api.markOwnerNotificationRead(id);
    const notification = state.ownerNotifications.find((n) => n.id === id);
    if (notification) notification.read = true;
    setOwnerFeedback("Aviso marcado como leído.");
  } catch (error) {
    setOwnerFeedback(error.message, true);
  } finally {
    ownerReadPending.delete(id);
    updateOwnerInboxBadge();
    if (ownerInboxDialog.open) {
      const card = [...ownerInboxList.children].find(
        (el) => el.dataset.notificationId === id,
      );
      const focus =
        card?.querySelector("button,h3") ||
        ownerInboxList.querySelector("button") ||
        document.querySelector(
          '[data-owner-inbox-filter][aria-pressed="true"]',
        );
      if (focus) {
        if (focus.tagName === "H3") focus.tabIndex = -1;
        focus.focus({ preventScroll: true });
      }
    }
  }
}
export async function sendAdminEmailNotification(owner, docsMap) {
  const docs = Object.values(docsMap || {}).map((d) => ({
    key: d.key,
    title: d.title,
    fileName: d.fileName,
    validation: "Pendiente de revisión administrativa",
    legibility: "Revisión manual",
  }));
  const result = await api.createAdminEmail({
    ownerId: owner.id || state.ui.editingOwnerId,
    ownerName: `${owner.name} ${owner.surname}`,
    ownerDni: owner.dni,
    ownerCommunity: owner.communityName || "",
    ownerPlot: owner.plot || "",
    subject: `Documentación pendiente: ${owner.name} ${owner.surname}`,
    date: new Date().toLocaleString("es-ES"),
    timestamp: Date.now(),
    docs,
  });
  state.adminEmails.unshift(result);
  updateInboxBadge();
  return result;
}
export function openAdminInbox() {
  if (!requirePermission("admin_notification:read")) return;
  renderAdminInbox();
  if (!adminInboxDialog.open) adminInboxDialog.showModal();
}
export function renderAdminInbox() {
  if (!hasPermission("admin_notification:read")) return;
  adminInboxList.replaceChildren();
  inboxSummary("admin", state.adminEmails);
  const visible = visibleInbox(
    "admin",
    state.adminEmails,
    (n) => `${n.subject} ${n.ownerName} ${n.ownerCommunity} ${n.ownerPlot}`,
  );
  inboxResults("admin", visible.length, state.adminEmails.length);
  if (!visible.length) {
    inboxEmpty(adminInboxList, "admin", state.adminEmails.length);
    return;
  }
  for (const email of visible) {
    const row = document.createElement("div");
    row.setAttribute("role", "listitem");
    const item = document.createElement("button");
    item.type = "button";
    item.className = `notification-admin-item ${email.read ? "" : "unread"}`;
    const docs = Array.isArray(email.docs) ? email.docs : [];
    const context = [email.ownerCommunity, email.ownerPlot]
      .filter(Boolean)
      .join(" · ");
    item.innerHTML = `<span class="notification-item-icon">${mailIcon}</span><span class="notification-item-content"><span class="notification-message-header"><span class="notification-category">${docs.length ? "Documentación" : "Gestión administrativa"}</span><span class="notification-read-state ${email.read ? "" : "is-unread"}">${email.read ? "Leído" : "Sin leer"}</span></span><strong class="notification-item-title">${escapeHtml(email.subject || "Aviso administrativo")}</strong><span class="notification-item-owner">${escapeHtml(email.ownerName || "Propietario sin identificar")}</span>${context ? `<span class="notification-item-context">${escapeHtml(context)}</span>` : ""}${docs.length ? `<span class="notification-item-docs">${docs.length} ${docs.length === 1 ? "documento" : "documentos"} · ${docs.map((d) => escapeHtml(d.title || d.fileName || "Documento")).join(" · ")}</span>` : ""}<span class="notification-message-footer"><span class="notification-date">${escapeHtml(notificationDate(email))}</span><span class="notification-open-label">Ver detalle <span aria-hidden="true">→</span></span></span></span>`;
    item.addEventListener("click", () => openAdminEmail(email.id));
    row.append(item);
    adminInboxList.append(row);
  }
}
export async function openAdminEmail(id) {
  if (!requirePermission("admin_notification:read")) return;
  const email = state.adminEmails.find((e) => e.id === id);
  if (!email) return;
  try {
    await api.markAdminEmailRead(id);
    email.read = true;
    updateInboxBadge();
  } catch (error) {
    toast(error.message);
    return;
  }
  for (const [selector, value] of [
    ["#email-date-display", email.date],
    ["#email-subject-display", email.subject],
    ["#email-owner-name", email.ownerName],
    ["#email-owner-dni", email.ownerDni],
    ["#email-owner-comm", email.ownerCommunity],
    ["#email-owner-plot", email.ownerPlot],
  ])
    document.querySelector(selector).textContent = value || "";
  const body = document.querySelector("#email-docs-table-body");
  body.replaceChildren();
  for (const doc of email.docs || []) {
    const row = document.createElement("tr");
    for (const value of [
      doc.title,
      doc.fileName,
      doc.validation,
      doc.legibility,
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value || "";
      row.append(cell);
    }
    body.append(row);
  }
  emailMailtoLink.href = `mailto:${encodeURIComponent(state.settings.emailContacto || "")}?subject=${encodeURIComponent(email.subject)}`;
  emailGotoApprovalBtn.onclick = () => {
    adminEmailDialog.close();
    adminInboxDialog.close();
    openOwnerDetail(email.ownerId);
  };
  if (!adminEmailDialog.open) adminEmailDialog.showModal();
}
if (topbarInboxBtn) topbarInboxBtn.addEventListener("click", openAdminInbox);
if (topbarOwnerInboxBtn)
  topbarOwnerInboxBtn.addEventListener("click", openOwnerInbox);
closeAdminInboxDialog?.addEventListener("click", () =>
  adminInboxDialog.close(),
);
closeOwnerInboxDialog?.addEventListener("click", () =>
  ownerInboxDialog.close(),
);
for (const kind of ["admin", "owner"]) {
  const render = kind === "admin" ? renderAdminInbox : renderOwnerInbox;
  document.querySelectorAll(`[data-${kind}-inbox-filter]`).forEach((button) =>
    button.addEventListener("click", () => {
      inboxViews[kind].filter = button.dataset[`${kind}InboxFilter`];
      render();
    }),
  );
  document
    .querySelector(`#${kind}-inbox-search`)
    .addEventListener("input", (event) => {
      inboxViews[kind].search = event.target.value;
      render();
    });
}
for (const id of ["#close-admin-email-dialog", "#close-admin-email-btn"])
  document
    .querySelector(id)
    ?.addEventListener("click", () => adminEmailDialog.close());
markAllOwnerNotifsReadBtn?.addEventListener("click", async () => {
  if (ownerBulkBusy || ownerReadPending.size) return;
  const ownerId = getCurrentOwnerProfileId();
  if (!requirePermission("owner_notification:read", ownerId)) return;
  const pendingIds = new Set(
    state.ownerNotifications
      .filter((n) => n.ownerId === ownerId && !n.read)
      .map((n) => n.id),
  );
  if (!pendingIds.size) return;
  ownerBulkBusy = true;
  setOwnerFeedback("");
  renderOwnerInbox();
  try {
    await api.markAllOwnerNotificationsRead(ownerId);
    state.ownerNotifications.forEach((n) => {
      if (pendingIds.has(n.id)) n.read = true;
    });
    setOwnerFeedback(
      `${pendingIds.size} ${pendingIds.size === 1 ? "aviso marcado como leído" : "avisos marcados como leídos"}.`,
    );
  } catch (error) {
    setOwnerFeedback(error.message, true);
  } finally {
    ownerBulkBusy = false;
    updateOwnerInboxBadge();
    if (ownerInboxDialog.open && markAllOwnerNotifsReadBtn.disabled)
      document
        .querySelector('[data-owner-inbox-filter][aria-pressed="true"]')
        .focus();
  }
});
