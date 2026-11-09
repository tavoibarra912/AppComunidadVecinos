import fs from "node:fs";

const archivo = "src/routes/communications.js";
let t = fs.readFileSync(archivo, "utf8");
let n = 0;

// 1) Comentarios: requieren comm:participacion
const commentsViejo = `  const p = find(req);
    mutable(p);
    if (!p.commentsEnabled)
      throw problem("Los comentarios están desactivados.", 409);`;
const commentsNuevo = `  const p = find(req);
    mutable(p);
    if (!allowed(req.user, "comm:participacion", p.communityId, policyData()))
      throw problem("No tenés permiso para participar en Comunicación (comentar).", 403);
    if (!p.commentsEnabled)
      throw problem("Los comentarios están desactivados.", 409);`;

if (t.includes(commentsViejo)) { t = t.replace(commentsViejo, commentsNuevo); n++; }

// 2) Votos (ballot): requieren comm:participacion
const voteViejo = `  const p = find(req);
    if (!mayVote(req.user, p))`;
const voteNuevo = `  const p = find(req);
    if (!allowed(req.user, "comm:participacion", p.communityId, policyData()))
      throw problem("No tenés permiso para participar en Comunicación (votar).", 403);
    if (!mayVote(req.user, p))`;

if (t.includes(voteViejo)) { t = t.replace(voteViejo, voteNuevo); n++; }

// 3) RSVP: requiere comm:participacion
const rsvpViejo = `  const p = find(req);
    mutable(p);`;
// El primero que matchea tras comments es el rsvp? No: hay varios "const p = find(req); mutable(p);"
// Anclar por la ruta:
const rsvpAnchor = `  "/posts/:id/rsvp",
    route((req, res) => {
    const p = find(req);
    mutable(p);`;
if (t.includes(rsvpAnchor)) {
  const rsvpNuevo = `  "/posts/:id/rsvp",
    route((req, res) => {
    const p = find(req);
    if (!allowed(req.user, "comm:participacion", p.communityId, policyData()))
      throw problem("No tenés permiso para participar en Comunicación (confirmar asistencia).", 403);
    mutable(p);`;
  t = t.replace(rsvpAnchor, rsvpNuevo);
  n++;
}

// 4) Detalle: sin el permiso, oculta comentarios y consulta (datos de otros)
const detailViejo = `  route((req, res) => res.json(detail(find(req), req.user))),`;
const detailNuevo = `  route((req, res) => {
    const d = detail(find(req), req.user);
    if (!allowed(req.user, "comm:participacion", d.communityId, policyData())) {
      // Sin participación: no expone comentarios ni consultas (no red social).
      d.comments = [];
      d.poll = null;
    }
    res.json(d);
  }),`;

if (t.includes(detailViejo)) { t = t.replace(detailViejo, detailNuevo); n++; }

fs.writeFileSync(archivo, t);
console.log("bloques:", n);
