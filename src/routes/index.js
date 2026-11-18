import { registerCascadeArchives } from "../cascade-delete.js";
import { Router } from "express";
import communitiesRouter from "./communities.js";
import ownersRouter from "./owners.js";
import propertiesRouter from "./properties.js";
import tenantsRouter from "./tenants.js";
import documentsRouter from "./documents.js";
import notificationsRouter from "./notifications.js";
import verificationRouter from "./verification.js";
import adminRouter from "./admin.js";
import authRouter from "./auth.js";
import communicationsRouter from "./communications.js";
import feesRouter from "./fees.js";
import issuesRouter from "./issues.js";
import exportRouter from "./export.js";
import { auditRequests, listAudit } from "../audit.js";
import {
  requireSession,
  sameOrigin,
  visibleData,
  allowed,
  policyData,
  publicUser,
  requirePermission,
} from "../security.js";
import { resourceAccess, notificationAccess } from "../access.js";
import {
  listAdminEmails,
  listOwnerNotifications,
  listDocumentFoldersForEntities,
  listDocumentsForEntities,
  getSettings,
} from "../db.js";

const router = Router();

function groupByEntity(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const list = grouped.get(row.entityId);
    if (list) list.push(row);
    else grouped.set(row.entityId, [row]);
  }
  return grouped;
}
router.use(auditRequests);
router.use(sameOrigin);
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use("/auth", authRouter);

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "app-comunidad-vecinos",
    release: process.env.APP_RELEASE || "development",
    pid: process.pid,
    uptime: process.uptime(),
  });
});
router.use(requireSession);
// Cualquier cuenta con sesión puede reportar un fallo, incluso si la
// plataforma está en mantenimiento: el formulario sirve para avisar de ello.
router.use("/issues", issuesRouter);
router.use((req, res, next) => {
  const settings = getSettings();
  if (!settings.mantenimiento) return next();
  const policy = policyData();
  const isAdmin = [
    "admin:settings",
    "admin:users",
    "admin:roles",
    "admin:providers",
    "audit:read",
    "community:create",
  ].some((permission) => allowed(req.user, permission, "", policy));
  if (isAdmin) return next();
  return res.status(503).json({
    error:
      settings.mensajeMantenimiento ||
      "La plataforma está en mantenimiento. Vuelve a intentar en unos minutos.",
    mantenimiento: true,
  });
});
router.get("/audit", requirePermission("audit:read"), (req, res, next) => {
  try {
    res.json(listAudit(req.query));
  } catch (error) {
    if (error.status) res.status(error.status).json({ error: error.message });
    else next(error);
  }
});
router.use(resourceAccess);
registerCascadeArchives(router);

router.get("/bootstrap", (req, res) => {
  // Una sola instantánea de la política por petición: reconstruirla por cada
  // entidad multiplicaba las consultas y bloqueaba el hilo con censos medianos.
  const policy = policyData();
  const visible = visibleData(req.user, policy);
  const canReadDocuments = (entityId) => allowed(req.user, "document:read", entityId, policy);
  const readableIds = (rows) => rows.map((row) => row.id).filter(canReadDocuments);
  const communityIds = readableIds(visible.communities);
  const propertyIds = readableIds(visible.properties);
  const tenantIds = readableIds(visible.tenants);
  const communityDocuments = groupByEntity(listDocumentsForEntities("community", communityIds));
  const communityStatutes = groupByEntity(
    listDocumentsForEntities("community", communityIds, "statutes"),
  );
  const communityFolders = groupByEntity(listDocumentFoldersForEntities("community", communityIds));
  const propertyDocuments = groupByEntity(listDocumentsForEntities("property", propertyIds));
  const propertyFolders = groupByEntity(listDocumentFoldersForEntities("property", propertyIds));
  const tenantDocuments = groupByEntity(listDocumentsForEntities("tenant", tenantIds));
  const tenantFolders = groupByEntity(listDocumentFoldersForEntities("tenant", tenantIds));
  res.json({
    communities: visible.communities.map((community) => ({
      ...community,
      documents: communityDocuments.get(community.id) || [],
      statutes: communityStatutes.get(community.id) || [],
      documentFolders: communityFolders.get(community.id) || [],
    })),
    owners: visible.owners,
    properties: visible.properties.map((property) => ({
      ...property,
      documents: propertyDocuments.get(property.id) || [],
      documentFolders: propertyFolders.get(property.id) || [],
    })),
    tenants: visible.tenants.map((tenant) => ({
      ...tenant,
      // `documents` contiene el expediente fijo (DNI, contrato…); la
      // biblioteca genérica con carpetas se expone aparte.
      libraryDocuments: tenantDocuments.get(tenant.id) || [],
      documentFolders: tenantFolders.get(tenant.id) || [],
    })),
    adminEmails: allowed(req.user, "admin_notification:read", "", policy)
      ? listAdminEmails().filter((n) => allowed(req.user, "owner:read", n.ownerId, policy))
      : [],
    ownerNotifications: listOwnerNotifications().filter((n) =>
      allowed(req.user, "owner_notification:read", n.ownerId, policy),
    ),
    users: visible.users,
    roles: visible.roles,
    settings: getSettings(),
    currentUser: publicUser(req.user),
  });
});

router.use("/communities", communitiesRouter);
router.use("/owners", ownersRouter);
router.use("/properties", propertiesRouter);
router.use("/tenants", tenantsRouter);
router.use("/documents", documentsRouter);
router.use("/notifications", notificationAccess, notificationsRouter);
router.use("/communications", communicationsRouter);
router.use("/fees", feesRouter);
router.use("/export", exportRouter);
router.use("/owners/contact", verificationRouter);
router.use(
  "/admin",
  (req, res, next) => {
    const section = req.path.split("/")[1];
    if (section === "roles" && req.method === "GET" && allowed(req.user, "admin:users"))
      return next();
    // Un rol con admin:branding (pero sin admin:settings) solo puede guardar el
    // estilo de la plataforma: se restringe el cuerpo a `marca`.
    if (
      section === "settings" &&
      req.method === "PUT" &&
      !allowed(req.user, "admin:settings") &&
      allowed(req.user, "admin:branding")
    ) {
      req.body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? { marca: req.body.marca }
          : {};
      return next();
    }
    return requirePermission(`admin:${section}`)(req, res, next);
  },
  adminRouter,
);

export default router;
