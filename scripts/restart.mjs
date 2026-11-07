/**
 * npm run restart — mata cualquier proceso escuchando en el puerto de la
 * app y vuelve a levantar el servidor limpio.
 *
 * Útil cuando queda un server viejo colgado y aparece EADDRINUSE o
 * comportamientos imposibles (código viejo siendo servido).
 */
import { execSync, spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 3000);

function pidsOnPort(port) {
  try {
    // sin -p tcp: los listeners IPv6 ([::]:puerto) no aparecen con ese filtro
    const out = execSync("netstat -ano", { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (line.includes(`:${port}`) && /LISTENING/i.test(line)) {
        const pid = Number(line.trim().split(/\s+/).pop());
        if (pid && pid !== process.pid) pids.add(pid);
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

const stale = pidsOnPort(PORT);
for (const pid of stale) {
  try {
    process.kill(pid, "SIGKILL");
    console.log(`[restart] proceso viejo ${pid} terminado (puerto ${PORT})`);
  } catch {
    console.log(`[restart] no se pudo terminar el proceso ${pid}`);
  }
}
if (stale.length === 0) {
  console.log(`[restart] puerto ${PORT} libre, no hay procesos que matar`);
}

console.log(`[restart] levantando el servidor en el puerto ${PORT}...`);
const server = spawn("node", ["server.js"], { stdio: "inherit", env: process.env });
server.on("exit", code => process.exit(code ?? 0));
