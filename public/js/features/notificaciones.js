import { escapeHtml } from "../html.js";
import { api } from "../api.js";
import {
  state,
  refreshState,
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
const closeAdminInboxBtn = document.querySelector("#close-admin-inbox-btn");
const topbarOwnerInboxBtn = document.querySelector("#topbar-owner-inbox-btn");
const closeOwnerInboxDialog = document.querySelector(
  "#close-owner-inbox-dialog",
);
const closeOwnerInboxBtn = document.querySelector("#close-owner-inbox-btn");
const markAllOwnerNotifsReadBtn = document.querySelector(
  "#mark-all-owner-notifs-read-btn",
);

const contactVerify = {
  phone: {
    value: "",
    verified: false,
    pending: false,
    challengeId: "",
    verifiedAt: "",
  },
  email: {
    value: "",
    verified: false,
    pending: false,
    challengeId: "",
    verifiedAt: "",
  },
};

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
}
export function updateOwnerInboxBadge() {
  const count = state.ownerNotifications.filter(
    (n) => !n.read && n.ownerId === getCurrentOwnerProfileId(),
  ).length;
  if (ownerInboxBadgeCount) {
    ownerInboxBadgeCount.textContent = count;
    ownerInboxBadgeCount.hidden = !count;
  }
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
  if (!notifications.length) {
    const p = document.createElement("p");
    p.textContent = "No tenés avisos en tu buzón.";
    ownerInboxList.append(p);
    return;
  }
  for (const n of notifications) {
    const card = document.createElement("div");
    card.className = `notif-card ${n.read ? "" : "unread"}`;
    const title = document.createElement("strong");
    title.textContent = n.title;
    const date = document.createElement("p");
    date.className = "notif-card-date";
    date.textContent = n.date;
    const message = document.createElement("p");
    message.className = "notif-card-message";
    message.textContent = n.message;
    card.append(title, date, message);
    card.addEventListener("click", async () => {
      if (n.read) return;
      try {
        await api.markOwnerNotificationRead(n.id);
        n.read = true;
        card.classList.remove("unread");
        updateOwnerInboxBadge();
      } catch (error) {
        toast(error.message);
      }
    });
    ownerInboxList.append(card);
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
  adminInboxList.replaceChildren();
  if (!state.adminEmails.length) {
    const p = document.createElement("p");
    p.textContent = "No hay avisos pendientes.";
    adminInboxList.append(p);
  }
  for (const email of state.adminEmails) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `inbox-item ${email.read ? "" : "unread"}`;
    item.textContent = `${email.subject} · ${email.date}`;
    item.addEventListener("click", () => openAdminEmail(email.id));
    adminInboxList.append(item);
  }
  if (!adminInboxDialog.open) adminInboxDialog.showModal();
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
for (const btn of [closeAdminInboxDialog, closeAdminInboxBtn])
  btn?.addEventListener("click", () => adminInboxDialog.close());
for (const btn of [closeOwnerInboxDialog, closeOwnerInboxBtn])
  btn?.addEventListener("click", () => ownerInboxDialog.close());
for (const id of ["#close-admin-email-dialog", "#close-admin-email-btn"])
  document
    .querySelector(id)
    ?.addEventListener("click", () => adminEmailDialog.close());
markAllOwnerNotifsReadBtn?.addEventListener("click", async () => {
  try {
    await api.markAllOwnerNotificationsRead(getCurrentOwnerProfileId());
    await refreshState();
    renderOwnerInbox();
    toast("Avisos marcados como leídos.");
  } catch (error) {
    toast(error.message);
  }
});
