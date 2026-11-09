import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.APP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pen-dbg3-"));
process.env.APP_UPLOADS_DIR = process.env.APP_DATA_DIR + "/up";

const { db, ensureDemoProfiles, listCommunities, listOwners, listProperties, listTenants, listRoles } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
ensureDemoProfiles();

const { can } = await import("../../public/js/permissions.js");
const data = { communities: listCommunities(), owners: listOwners(), properties: listProperties(), tenants: listTenants(), roles: listRoles() };
const commUser = db.prepare("SELECT * FROM users WHERE usuario = 'comm_admin'").get();

console.log("user.id:", JSON.stringify(commUser.id), "| activo:", commUser.activo, "| rol:", commUser.rol);
const comRow = data.communities.find(c => c.id === "com-seed-1");
console.log("community.adminUserId:", JSON.stringify(comRow.adminUserId));
const assigned = data.communities.filter(c => c.adminUserId === commUser.id).map(c => c.id);
console.log("assigned calculado:", JSON.stringify(assigned));

// can() copiado con trazas paso a paso
function canDebug(user, permission, resourceId, d) {
  if (!user?.activo) { console.log("TRACE: user inactivo"); return false; }
  const PERMS_OK = true; // community:read está en PERMISSIONS
  if (!PERMS_OK) return false;
  const role = d.roles.find(r => r.id === user.rol || r.nombre === user.rol);
  if (!role) { console.log("TRACE: rol no encontrado para", user.rol); return false; }
  if (role.nombre === "super_admin") { console.log("TRACE: super_admin bypass"); return true; }
  if (permission === "audit:read" || permission === "admin:providers") {
    console.log("TRACE: permiso global especial");
    return !["user", "community_admin"].includes(role.nombre) && !!role.permisos?.includes(permission);
  }
  const ownOwners = d.owners.filter(o => o.userId === user.id).map(o => o.id);
  const ownTenants = d.tenants.filter(t => t.userId === user.id);
  const ownedProperties = d.properties.filter(p => p.ownerIds?.some(id => ownOwners.includes(id)));
  const assignedLocal = d.communities.filter(c => c.adminUserId === user.id).map(c => c.id);
  console.log("TRACE: assignedLocal =", JSON.stringify(assignedLocal));
  if (role.nombre === "user") { console.log("TRACE: rama user"); return false; }
  if (!role.permisos?.includes(permission)) { console.log("TRACE: permiso fuera de la lista del rol"); return false; }
  if (role.nombre !== "community_admin") { console.log("TRACE: no es community_admin → allow"); return true; }
  if (permission.startsWith("admin:")) { console.log("TRACE: admin: denegado"); return false; }
  if (!resourceId) { console.log("TRACE: sin resourceId"); return assignedLocal.length > 0; }
  const entity = permission.split(":")[0];
  let communityIds;
  if (entity === "community" || d.communities.some(c => c.id === resourceId)) communityIds = [resourceId];
  console.log("TRACE: communityIds =", JSON.stringify(communityIds));
  const ok = communityIds.some(id => assignedLocal.includes(id));
  console.log("TRACE: resultado =", ok);
  return ok;
}

console.log("canDebug:", canDebug(commUser, "community:read", "com-seed-1", data));
console.log("can real:", can(commUser, "community:read", "com-seed-1", data));
process.exit(0);
