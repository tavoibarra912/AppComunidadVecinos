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
  listCommunities, listOwners, listProperties, listTenants,
  listAdminEmails, listOwnerNotifications, listDocuments,
  listUsers, listRoles, getSettings
} from "../db.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

router.get("/bootstrap", (req, res) => {
  res.json({
    communities: listCommunities().map(community => ({
      ...community,
      documents: listDocuments("community", community.id)
    })),
    owners: listOwners(),
    properties: listProperties().map(property => ({
      ...property,
      documents: listDocuments("property", property.id)
    })),
    tenants: listTenants(),
    adminEmails: listAdminEmails(),
    ownerNotifications: listOwnerNotifications(),
    users: listUsers(),
    roles: listRoles(),
    settings: getSettings()
  });
});

router.use("/communities", communitiesRouter);
router.use("/owners", ownersRouter);
router.use("/properties", propertiesRouter);
router.use("/tenants", tenantsRouter);
router.use("/documents", documentsRouter);
router.use("/notifications", notificationsRouter);
router.use("/owners/contact", verificationRouter);
router.use("/admin", adminRouter);
router.use("/auth", authRouter);

export default router;
