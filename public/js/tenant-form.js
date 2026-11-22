import { normalizeIdentityDocument } from "./utils.js";

export function copyOwnerDataToTenantForm(owner, form) {
  form.elements.name.value = owner.name || "";
  form.elements.surname.value = owner.surname || "";
  form.elements.documentType.value = owner.documentType || "DNI";
  form.elements.documentId.value = owner.dni || owner.documentId || "";
  form.elements.phone.value = owner.phone || "";
  form.elements.email.value = owner.email || "";
}

export function ownerHasSameDocument(documentId, owner) {
  const tenantDocumentId = normalizeIdentityDocument(documentId);
  const ownerDocumentId = normalizeIdentityDocument(owner?.dni || owner?.documentId);
  return !!tenantDocumentId && tenantDocumentId === ownerDocumentId;
}
