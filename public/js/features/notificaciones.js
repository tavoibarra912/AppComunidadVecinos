import { api } from "../api.js";
import { state, refreshState, CURRENT_OWNER_ID, hasPermission, requirePermission } from "../state.js";
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
const closeAdminInboxDialog = document.querySelector("#close-admin-inbox-dialog");
const closeAdminInboxBtn = document.querySelector("#close-admin-inbox-btn");
const topbarOwnerInboxBtn = document.querySelector("#topbar-owner-inbox-btn");
const closeOwnerInboxDialog = document.querySelector("#close-owner-inbox-dialog");
const closeOwnerInboxBtn = document.querySelector("#close-owner-inbox-btn");
const markAllOwnerNotifsReadBtn = document.querySelector("#mark-all-owner-notifs-read-btn");

const contactVerify = {
  phone: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" },
  email: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" }
};

export function getOwnerOverallDocStatus(owner) {
  const status = getOwnerDocStatus(owner);
  const labelMap = {
    approved: "Aprobada (3/3)",
    pending_admin: "Pendiente Admin (3/3)",
    incomplete: "Incompleta",
    rejected: "Rechazada",
    none: "Sin documentos"
  };
  return { status, label: labelMap[status] || status, class: getDocBadgeClass(status) };
}

export function getOwnerDocStatus(owner) {
  if (!owner || !owner.documents) return "none";
  const docs = owner.documents;
  const keys = ["dni", "bankReceipt", "propertyDeed"];
  const uploaded = keys.filter(k => !!docs[k]);
  if (uploaded.length === 0) return "none";

  // Si algún documento ha sido rechazado por el Administrador
  const anyRejected = uploaded.some(k => docs[k].adminApproval && docs[k].adminApproval.status === "rejected");
  if (anyRejected) return "rejected";

  // Si los 3 documentos están formalmente aprobados por el Administrador
  const allApproved = keys.every(k => docs[k] && docs[k].adminApproval && docs[k].adminApproval.status === "approved");
  if (uploaded.length === 3 && allApproved) return "approved";

  // Si los 3 documentos están subidos y validados por el sistema (esperando resolución de admin)
  if (uploaded.length === 3) return "pending_admin";

  return "incomplete";
}

export function getDocBadgeClass(status) {
  switch (status) {
    case "approved": return "doc-approved";
    case "pending_admin": return "doc-pending-admin";
    case "incomplete": return "doc-incomplete";
    case "rejected": return "doc-rejected";
    default: return "doc-none";
  }
}

export function getDocBadgeText(status, owner) {
  const docs = (owner && owner.documents) || {};
  const count = ["dni", "bankReceipt", "propertyDeed"].filter(k => !!docs[k]).length;
  switch (status) {
    case "approved": return "✓ Aprobada (3/3)";
    case "pending_admin": return "⏳ Pendiente Admin (3/3)";
    case "incomplete": return `⚠️ Incompleta (${count}/3)`;
    case "rejected": return "❌ Rechazada";
    default: return "⚪ Sin documentos (0/3)";
  }
}

// --- Gestión de Buzón y Correos Electrónicos al Administrador ---

export function loadAdminEmails() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_EMAILS_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
    return defaultAdminEmails;
  } catch {
    return defaultAdminEmails;
  }
}

export function saveAdminEmails() {
  localStorage.setItem(ADMIN_EMAILS_STORAGE_KEY, JSON.stringify(state.adminEmails));
  updateInboxBadge();
}

export function updateInboxBadge() {
  const unreadCount = state.adminEmails.filter(e => !e.read).length;
  if (inboxBadgeCount) {
    inboxBadgeCount.textContent = unreadCount;
    inboxBadgeCount.style.display = unreadCount > 0 ? "inline-block" : "none";
  }
}

// --- Gestión de Buzón y Notificaciones del Propietario ---

export function loadOwnerNotifications() {
  try {
    const saved = JSON.parse(localStorage.getItem(OWNER_NOTIFICATIONS_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
    return defaultOwnerNotifications;
  } catch {
    return defaultOwnerNotifications;
  }
}

export function saveOwnerNotifications() {
  localStorage.setItem(OWNER_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(state.ownerNotifications));
  updateOwnerInboxBadge();
}

export function updateOwnerInboxBadge() {
  const unreadCount = state.ownerNotifications.filter(n => !n.read && n.ownerId === CURRENT_OWNER_ID).length;
  if (ownerInboxBadgeCount) {
    ownerInboxBadgeCount.textContent = unreadCount;
    ownerInboxBadgeCount.style.display = unreadCount > 0 ? "inline-block" : "none";
  }
}

export function addOwnerNotification({ ownerId, title, type = "info", message }) {
  const dateStr = new Date().toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
  const notif = {
    id: "notif-" + Date.now(),
    ownerId: ownerId || CURRENT_OWNER_ID,
    title,
    type,
    date: dateStr,
    timestamp: Date.now(),
    read: false,
    message
  };
  state.ownerNotifications.unshift(notif);
  saveOwnerNotifications();
}

export function openOwnerInbox() {
  if (!requirePermission("owner_notification:read", CURRENT_OWNER_ID)) return;
  renderOwnerInbox();
  ownerInboxDialog.showModal();
}

export function renderOwnerInbox() {
  if (!hasPermission("owner_notification:read", CURRENT_OWNER_ID)) {
    ownerInboxList?.replaceChildren();
    return;
  }
  if (!ownerInboxList) return;
  ownerInboxList.replaceChildren();
  const myNotifs = state.ownerNotifications.filter(n => n.ownerId === CURRENT_OWNER_ID);

  if (myNotifs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.style.padding = "24px";
    empty.innerHTML = "<p>No tienes avisos en tu buzón actualmente.</p>";
    ownerInboxList.append(empty);
    return;
  }
  if (previousTenant && !requirePermission("tenant:manage", owner.id)) return;

  myNotifs.forEach(n => {
    const card = document.createElement("div");
    card.className = `notif-card ${n.read ? "" : "unread"}`;

    let typeTag = '<span class="notif-tag info">Aviso</span>';
    let typeIcon = "ℹ️";
    if (n.type === "success") {
      typeTag = '<span class="notif-tag success">Aprobado</span>';
      typeIcon = "✅";
    } else if (n.type === "warning") {
      typeTag = '<span class="notif-tag warning">Requerimiento</span>';
      typeIcon = "⚠️";
    }

    card.innerHTML = `
      <div class="notif-card-header">
        <div class="notif-card-title-wrap">
          <span>${typeIcon}</span>
          <span>${n.title}</span>
          ${typeTag}
        </div>
        <span class="notif-card-date">${n.date}</span>
      </div>
      <p class="notif-card-message">${n.message}</p>
    `;

    card.addEventListener("click", () => {
      if (!n.read) {
        n.read = true;
        saveOwnerNotifications();
        card.classList.remove("unread");
      }
    });

    ownerInboxList.append(card);
  });
}

export function sendAdminEmailNotification(owner, docsMap) {
  const emailId = "email-" + Date.now();
  const dateStr = new Date().toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  const docsSummary = ["dni", "bankReceipt", "propertyDeed"].map(k => {
    const d = docsMap[k];
    if (!d) return null;
    return {
      key: k,
      title: d.title,
      fileName: d.fileName,
      validation: d.autoValidation?.typeVerified || "Validado por sistema",
      legibility: `${d.autoValidation?.legibilityScore || 95}% (${d.autoValidation?.legibilityStatus?.split(" ")[0] || "Óptima"})`
    };
  }).filter(Boolean);

  const emailObj = {
    id: emailId,
    ownerId: owner.id || state.ui.editingOwnerId,
    ownerName: `${owner.name} ${owner.surname}`,
    ownerDni: owner.dni,
    ownerCommunity: owner.communityName || "Comunidad asignada",
    ownerPlot: owner.plot || "Inmueble",
    subject: `[Peñarrubia] Solicitud de verificación y aprobación de documentación - Propietario: ${owner.name} ${owner.surname} (${owner.dni})`,
    date: dateStr,
    timestamp: Date.now(),
    read: false,
    docs: docsSummary
  };

  state.adminEmails.unshift(emailObj);
  saveAdminEmails();
  return emailObj;
}

export function openAdminInbox() {
  if (!requirePermission("admin_notification:read")) return;
  adminInboxList.replaceChildren();

  if (state.adminEmails.length === 0) {
    const emptyP = document.createElement("p");
    emptyP.className = "form-intro";
    emptyP.textContent = "No hay notificaciones ni avisos de documentación en este momento.";
    adminInboxList.append(emptyP);
  } else {
    state.adminEmails.forEach(email => {
      const item = document.createElement("div");
      item.className = `inbox-item ${email.read ? "" : "unread"}`;
      item.innerHTML = `
        <div class="inbox-item-left">
          <span class="inbox-item-title">${email.subject}</span>
          <span class="inbox-item-meta">Recibido el ${email.date} · ${email.docs.length} documentos validados</span>
        </div>
        <button class="secondary-button" style="padding: 6px 12px; font-size: 12px;" type="button">Abrir correo &rarr;</button>
      `;
      item.addEventListener("click", () => {
        openAdminEmail(email.id);
      });
      adminInboxList.append(item);
    });
  }

  adminInboxDialog.showModal();
}

export function openAdminEmail(emailId) {
  if (!requirePermission("admin_notification:read")) return;
  const email = state.adminEmails.find(e => e.id === emailId);
  if (!email) return;

  // Marcar como leído
  email.read = true;
  saveAdminEmails();

  document.querySelector("#email-date-display").textContent = email.date;
  document.querySelector("#email-subject-display").textContent = email.subject;
  document.querySelector("#email-owner-name").textContent = email.ownerName;
  document.querySelector("#email-owner-dni").textContent = email.ownerDni;
  document.querySelector("#email-owner-comm").textContent = email.ownerCommunity;
  document.querySelector("#email-owner-plot").textContent = email.ownerPlot;

  const tableBody = document.querySelector("#email-docs-table-body");
  tableBody.replaceChildren();

  email.docs.forEach(doc => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${doc.title}</strong></td>
      <td><code>${doc.fileName}</code></td>
      <td><span class="status-badge doc-approved">✓ ${doc.validation}</span></td>
      <td><strong>${doc.legibility}</strong></td>
    `;
    tableBody.append(tr);
  });

  // Configurar enlace mailto
  const mailtoBody = encodeURIComponent(
    `Aviso de documentación de asociado:\n\nPropietario: ${email.ownerName}\nDNI: ${email.ownerDni}\nComunidad: ${email.ownerCommunity} (${email.ownerPlot})\n\nDocumentos validados por sistema:\n` +
    email.docs.map(d => `- ${d.title} (${d.fileName}): ${d.validation} | Legibilidad: ${d.legibility}`).join("\n") +
    `\n\nPor favor, acceda a la plataforma Peñarrubia para su aprobación final.`
  );
  emailMailtoLink.href = `mailto:admin@penarrubia.es?subject=${encodeURIComponent(email.subject)}&body=${mailtoBody}`;

  // Configurar botón para ir directo a la aprobación
  emailGotoApprovalBtn.onclick = () => {
    adminEmailDialog.close();
    if (adminInboxDialog.open) adminInboxDialog.close();
    openOwnerDetail(email.ownerId);
  };

  adminEmailDialog.showModal();
}

// --- Analizador de Imagen y Calidad de Documento ---

// Buzón de Avisos y Notificaciones del Administrador
if (topbarInboxBtn) topbarInboxBtn.addEventListener("click", openAdminInbox);
if (closeAdminInboxDialog) closeAdminInboxDialog.addEventListener("click", () => adminInboxDialog.close());
if (closeAdminInboxBtn) closeAdminInboxBtn.addEventListener("click", () => adminInboxDialog.close());

// Buzón de Avisos y Notificaciones del Propietario
if (topbarOwnerInboxBtn) topbarOwnerInboxBtn.addEventListener("click", openOwnerInbox);
if (closeOwnerInboxDialog) closeOwnerInboxDialog.addEventListener("click", () => ownerInboxDialog.close());
if (closeOwnerInboxBtn) closeOwnerInboxBtn.addEventListener("click", () => ownerInboxDialog.close());
if (markAllOwnerNotifsReadBtn) {
  markAllOwnerNotifsReadBtn.addEventListener("click", async () => {
    try {
      await api.markAllOwnerNotificationsRead(CURRENT_OWNER_ID);
      await refreshState();
      renderOwnerInbox();
      toast("Todos los avisos marcados como leídos.");
    } catch (error) {
      toast(error.message);
    }
  });
}

// Diálogo de Email del Administrador
const closeAdminEmailDialog = document.querySelector("#close-admin-email-dialog");
const closeAdminEmailBtn = document.querySelector("#close-admin-email-btn");
if (closeAdminEmailDialog) closeAdminEmailDialog.addEventListener("click", () => adminEmailDialog.close());
if (closeAdminEmailBtn) closeAdminEmailBtn.addEventListener("click", () => adminEmailDialog.close());

