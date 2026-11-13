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
import { auditRequests, listAudit } from "../audit.js";
import {
  requireSession,
  sameOrigin,
  visibleData,
  allowed,
  publicUser,
  requirePermission,
} from "../security.js";
import { resourceAccess, notificationAccess } from "../access.js";
import { recordAudit } from "../audit.js";
import {
  listAdminEmails,
  listOwnerNotifications,
  listDocuments,
  listDocumentFolders,
  getSettings,
} from "../db.js";

const router = Router();
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
    pid: process.pid,
    uptime: process.uptime(),
  });
});
router.use(requireSession);
router.use((req, res, next) => {
  const settings = getSettings();
  if (!settings.mantenimiento) return next();
  const isAdmin = [
    "admin:settings",
    "admin:users",
    "admin:roles",
    "admin:providers",
    "audit:read",
    "community:create",
  ].some((permission) => allowed(req.user, permission));
  if (isAdmin) return next();
  return res.status(503).json({
    error:
      settings.mensajeMantenimiento ||
      "La plataforma está en mantenimiento. Volvé a intentar en unos minutos.",
    mantenimiento: true,
  });
});
router.get("/audit", requirePermission("audit:read"), (req, res, next) => {
  try { res.json(listAudit(req.query)); }
  catch (error) { if (error.status) res.status(error.status).json({ error: error.message }); else next(error); }
});
router.use(resourceAccess);

router.get("/bootstrap", (req, res) => {
  const visible = visibleData(req.user);
  const canReadDocuments = (entityId) =>
    allowed(req.user, "document:read", entityId);
  res.json({
    communities: visible.communities.map((community) => ({
      ...community,
      documents: canReadDocuments(community.id)
        ? listDocuments("community", community.id)
        : [],
      statutes: canReadDocuments(community.id)
        ? listDocuments("community", community.id, "statutes")
        : [],
      documentFolders: canReadDocuments(community.id)
        ? listDocumentFolders("community", community.id)
        : [],
    })),
    owners: visible.owners,
    properties: visible.properties.map((property) => ({
      ...property,
      documents: canReadDocuments(property.id)
        ? listDocuments("property", property.id)
        : [],
      documentFolders: canReadDocuments(property.id)
        ? listDocumentFolders("property", property.id)
        : [],
    })),
    tenants: visible.tenants.map((tenant) => ({
      ...tenant,
      // `documents` contiene el expediente fijo (DNI, contrato…); la
      // biblioteca genérica con carpetas se expone aparte.
      libraryDocuments: canReadDocuments(tenant.id)
        ? listDocuments("tenant", tenant.id)
        : [],
      documentFolders: canReadDocuments(tenant.id)
        ? listDocumentFolders("tenant", tenant.id)
        : [],
    })),
    adminEmails: allowed(req.user, "admin_notification:read")
      ? listAdminEmails().filter((n) =>
          allowed(req.user, "owner:read", n.ownerId),
        )
      : [],
    ownerNotifications: listOwnerNotifications().filter((n) =>
      allowed(req.user, "owner_notification:read", n.ownerId),
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
router.use("/owners/contact", verificationRouter);
router.use(
  "/admin",
  (req, res, next) => {
    const section = req.path.split("/")[1];
    if (
      section === "roles" &&
      req.method === "GET" &&
      allowed(req.user, "admin:users")
    )
      return next();
    return requirePermission(`admin:${section}`)(req, res, next);
  },
  adminRouter,
);


// Auditoría de errores: registra operaciones que terminan en error (4xx/5xx)
router.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (body) {
    if (res.statusCode >= 400 && req.user) {
      try {
        recordAudit({
          action: 'error.' + req.method.toLowerCase(),
          outcome: 'failure',
          req,
          details: {
            ruta: req.path,
            estado: res.statusCode,
            mensaje: typeof body === 'object' && body !== null ? body.error || body.message || '' : '',
          },
        });
      } catch { /* no bloquear la respuesta por un error de auditoría */ }
    }
    return originalJson.call(this, body);
  };
  next();
});

export default router;
