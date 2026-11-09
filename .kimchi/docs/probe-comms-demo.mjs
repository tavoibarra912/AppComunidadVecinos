import { spawn } from "node:child_process";
import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dir = mkdtempSync(path.join(tmpdir(), "pen-comms-"));
mkdirSync(path.join(dir, "data"), { recursive: true });
copyFileSync("data/penarrubia.db", path.join(dir, "data", "penarrubia.db"));

const antes = new DatabaseSync(path.join(dir, "data", "penarrubia.db"));
let antesPosts = -1; try { antesPosts = antes.prepare("SELECT COUNT(*) n FROM communication_posts").get().n; } catch { /* base vieja sin tablas */ }
antes.close();

const PORT = 3473;
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", d => { log += d; });
server.stderr.on("data", d => { log += d; });

let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 5000));
  const dbPath = path.join(dir, "data", "penarrubia.db");
  if (/error|Error/i.test(log)) console.log("SERVER-LOG:", log.slice(0, 600));
  const abrir = () => new DatabaseSync(dbPath, { readOnly: true });
  let db = abrir();
  const posts = db.prepare("SELECT id, communityId, data FROM communication_posts").all().map(r => ({ ...JSON.parse(r.data), id: r.id, communityId: r.communityId }));
  const porEstado = {};
  for (const p of posts) {
    let estado = p.status === "draft" || p.status === "cancelled" ? p.status : (Date.parse(p.publishAt) > Date.now() ? "scheduled" : (p.archiveAt && Date.parse(p.archiveAt) <= Date.now() ? "archived" : (p.endsAt && Date.parse(p.endsAt) <= Date.now() ? "finished" : (p.startsAt && Date.parse(p.startsAt) > Date.now() ? "upcoming" : "active"))));
    porEstado[estado] = (porEstado[estado] || 0) + 1;
  }
  const tipos = {};
  for (const p of posts) tipos[p.type] = (tipos[p.type] || 0) + 1;
  db = abrir();
  const polls = posts.filter(p => p.poll);
  const reuniones = posts.filter(p => p.type === "meeting" && p.meeting?.agenda);
  const ballots = db.prepare("SELECT COUNT(*) n FROM communication_ballots").get().n;
  const comentarios = db.prepare("SELECT COUNT(*) n FROM communication_comments").get().n;
  const recipients = db.prepare("SELECT COUNT(*) n FROM communication_recipients").get().n;
  const outbox = db.prepare("SELECT COUNT(*) n FROM communication_outbox").get().n;
  console.log("   posts:", posts.length, "| tipos:", JSON.stringify(tipos), "| estados:", JSON.stringify(porEstado));
  db.close();
  console.log("   polls:", polls.length, "| reuniones con agenda:", reuniones.length, "| votos:", ballots, "| comentarios:", comentarios, "| recipients:", recipients, "| outbox:", outbox);
  check(`se cargaron 15 publicaciones (antes: ${antesPosts < 0 ? "sin tablas" : antesPosts})`, posts.length === 15);
  check("mezcla de tipos (notice/event/meeting)", (tipos.notice || 0) >= 9 && (tipos.event || 0) >= 3 && (tipos.meeting || 0) >= 2);
  check("mezcla de estados (draft/cancelled/scheduled/archived/finished/active/upcoming)", Object.keys(porEstado).length >= 6);
  check("encuestas con votos registrados", polls.length === 2 && ballots >= 2);
  check("reuniones con orden del día y tareas", reuniones.length >= 2 && reuniones.every(m => m.meeting.agenda.length > 20));
  check("recipients materializados por materialize()", recipients > 0);
  db.close();
} finally {
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "COMMS-DEMO OK");
process.exit(fails ? 1 : 0);
