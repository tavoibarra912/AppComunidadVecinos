/**
 * Cliente HTTP contra el backend (API REST en /api).
 * Todos los métodos devuelven el JSON de la respuesta o lanzan un Error con el mensaje del servidor.
 */
const API_BASE = "/api";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      ...options
    });
  } catch (error) {
    throw new Error(`No se pudo conectar con el servidor: ${error instanceof Error ? error.message : String(error)}`);
  }

  let result = null;
  try {
    result = await response.json();
  } catch {
    if (response.ok) {
      throw new Error("El servidor devolvió una respuesta no válida.");
    }
  }
  if (!response.ok) {
    throw new Error(result?.error || `Error del servidor (${response.status}).`);
  }
  return result;
}

export const api = {
  getBootstrap: () => request("/bootstrap"),

  // --- Comunidades ---
  createCommunity: payload => request("/communities", { method: "POST", body: JSON.stringify(payload) }),
  updateCommunity: (id, payload) => request(`/communities/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCommunity: id => request(`/communities/${id}`, { method: "DELETE" }),

  // --- Propietarios ---
  createOwner: payload => request("/owners", { method: "POST", body: JSON.stringify(payload) }),
  updateOwner: (id, payload) => request(`/owners/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteOwner: id => request(`/owners/${id}`, { method: "DELETE" }),

  // --- Inmuebles ---
  createProperty: payload => request("/properties", { method: "POST", body: JSON.stringify(payload) }),
  updateProperty: (id, payload) => request(`/properties/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteProperty: id => request(`/properties/${id}`, { method: "DELETE" }),

  // --- Inquilinos ---
  createTenant: payload => request("/tenants", { method: "POST", body: JSON.stringify(payload) }),
  updateTenant: (id, payload) => request(`/tenants/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteTenant: id => request(`/tenants/${id}`, { method: "DELETE" }),

  // --- Documentos genéricos (comunidades, inmuebles e inquilinos) ---
  uploadDocuments: (files, entityType, entityId) => {
    const formData = new FormData();
    formData.append("entityType", entityType);
    formData.append("entityId", entityId);
    [...files].forEach(file => formData.append("files", file));
    return request("/documents", { method: "POST", body: formData });
  },
  deleteDocument: id => request(`/documents/${id}`, { method: "DELETE" }),

  // --- Administración: usuarios, roles y configuración ---
  listUsers: () => request("/admin/users"),
  createUser: payload => request("/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id, payload) => request(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteUser: id => request(`/admin/users/${id}`, { method: "DELETE" }),
  linkOwner: (userId, ownerId) => request(`/admin/users/${userId}/link-owner`, { method: "PUT", body: JSON.stringify({ ownerId }) }),
  linkTenant: (userId, tenantId) => request(`/admin/users/${userId}/link-tenant`, { method: "PUT", body: JSON.stringify({ tenantId }) }),
  listRoles: () => request("/admin/roles"),
  createRole: payload => request("/admin/roles", { method: "POST", body: JSON.stringify(payload) }),
  updateRole: (id, payload) => request(`/admin/roles/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteRole: id => request(`/admin/roles/${id}`, { method: "DELETE" }),
  getSettings: () => request("/admin/settings"),
  updateSettings: payload => request("/admin/settings", { method: "PUT", body: JSON.stringify(payload) }),

  // --- Notificaciones y buzones ---
  createAdminEmail: payload => request("/notifications/admin-emails", { method: "POST", body: JSON.stringify(payload) }),
  markAdminEmailRead: (id, read = true) => request(`/notifications/admin-emails/${id}`, { method: "PATCH", body: JSON.stringify({ read }) }),
  createOwnerNotification: payload => request("/notifications/owner-notifications", { method: "POST", body: JSON.stringify(payload) }),
  markOwnerNotificationRead: (id, read = true) => request(`/notifications/owner-notifications/${id}`, { method: "PATCH", body: JSON.stringify({ read }) }),
  markAllOwnerNotificationsRead: ownerId => request("/notifications/owner-notifications", { method: "PATCH", body: JSON.stringify({ ownerId, read: true }) }),

  // --- Verificación de contacto (OTP) ---
  contact: {
    sendPhoneCode: phone => request("/owners/contact/phone/send", { method: "POST", body: JSON.stringify({ phone }) }),
    confirmPhone: (challengeId, code) => request("/owners/contact/phone/confirm", { method: "POST", body: JSON.stringify({ challengeId, code }) }),
    sendEmailCode: email => request("/owners/contact/email/send", { method: "POST", body: JSON.stringify({ email }) }),
    confirmEmail: (challengeId, code) => request("/owners/contact/email/confirm", { method: "POST", body: JSON.stringify({ challengeId, code }) })
  }
};
