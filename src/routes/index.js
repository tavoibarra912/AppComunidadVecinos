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
import {
  requireSession,
  sameOrigin,
  visibleData,
  allowed,
  publicUser,
  requirePermission,
} from "../security.js";
import { resourceAccess, notificationAccess } from "../access.js";
import {
  listCommunities,
  listOwners,
  listProperties,
  listTenants,
  listAdminEmails,
  listOwnerNotifications,
  listDocuments,
  listUsers,
  listRoles,
  getSettings,
} from "../db.js";

const router = Router();
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
router.use(resourceAccess);

router.get("/bootstrap", (req, res) => {
  const visible = visibleData(req.user);
  res.json({
    communities: visible.communities.map((community) => ({
      ...community,
      documents: listDocuments("community", community.id),
    })),
    owners: visible.owners,
    properties: visible.properties.map((property) => ({
      ...property,
      documents: listDocuments("property", property.id),
    })),
    tenants: visible.tenants,
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

export default router;
