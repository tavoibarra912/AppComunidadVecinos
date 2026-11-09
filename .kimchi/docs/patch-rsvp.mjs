import fs from "node:fs";

const archivo = "src/routes/communications.js";
let t = fs.readFileSync(archivo, "utf8");

const viejo = `  "/posts/:id/rsvp",
  route((req, res) => {
    const p = find(req);
    mutable(p);
    if (p.type !== "meeting" || Date.now() >= Date.parse(p.endsAt))`;

const nuevo = `  "/posts/:id/rsvp",
  route((req, res) => {
    const p = find(req);
    if (!allowed(req.user, "comm:participacion", p.communityId, policyData()))
      throw problem("No tenés permiso para participar en Comunicación (confirmar asistencia).", 403);
    mutable(p);
    if (p.type !== "meeting" || Date.now() >= Date.parse(p.endsAt))`;

if (!t.includes(viejo)) {
  console.error("NO MATCH");
  process.exit(1);
}
t = t.replace(viejo, nuevo);
fs.writeFileSync(archivo, t);
console.log("OK");
