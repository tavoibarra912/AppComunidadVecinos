/**
 * npm run restart — mata cualquier proceso escuchando en el puerto de la
 * app y vuelve a levantar el servidor limpio.
 *
 * Útil cuando queda un server viejo colgado y aparece EADDRINUSE o
 * comportamientos imposibles (código viejo siendo servido).
 */
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

export function parseListeningPids(output, port) {
  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const [protocol, localAddress, , status, rawPid] = line.trim().split(/\s+/);
    // Solo el puerto LOCAL exacto: :3000 no debe coincidir con :30001
    // ni con una conexión cuyo puerto remoto sea 3000.
    if (protocol !== "TCP" || status !== "LISTENING") continue;
    if (localAddress?.slice(localAddress.lastIndexOf(":") + 1) !== String(port)) continue;
    const pid = Number(rawPid);
    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) pids.add(pid);
  }
  return [...pids];
}

function pidsOnPort(port) {
  const output = execFileSync("netstat", ["-ano"], { encoding: "utf8", windowsHide: true });
  return parseListeningPids(output, port);
}

async function appPid(port) {
  try {
    const response = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) return null;
    const health = await response.json();
    return health.app === "app-comunidad-vecinos" && Number.isInteger(health.pid) && health.pid > 0
      ? health.pid : null;
  } catch {
    return null;
  }
}

async function restart() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT debe ser un puerto entre 1 y 65535.");
  }
  // La propia app identifica su proceso incluso si netstat no muestra el listener.
  const currentPid = await appPid(port);
  const listeners = pidsOnPort(port);
  if (!currentPid && listeners.length) throw new Error(`El puerto ${port} está ocupado por un proceso que no se identifica como esta app. Detenelo manualmente antes de reiniciar.`);
  const stale = currentPid ? [currentPid] : [];
  for (const pid of stale) {
    try {
      process.kill(pid, "SIGKILL");
      console.log(`[restart] proceso viejo ${pid} terminado (puerto ${port})`);
    } catch (error) {
      if (error.code !== "ESRCH") throw new Error(`No se pudo terminar el proceso ${pid}: ${error.message}`);
    }
  }
  if (stale.length === 0) {
    console.log(`[restart] puerto ${port} libre, no hay procesos que matar`);
  } else {
    const deadline = Date.now() + 5000;
    while (pidsOnPort(port).length) {
      if (Date.now() >= deadline) throw new Error(`El puerto ${port} sigue ocupado.`);
      await setTimeout(100);
    }
  }

  console.log(`[restart] levantando el servidor en el puerto ${port}...`);
  const root = fileURLToPath(new URL("../", import.meta.url));
  const server = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root, stdio: "inherit", env: process.env
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.kill(signal));
  }
  server.on("error", error => {
    console.error(`[restart] No se pudo iniciar Node: ${error.message}`);
    process.exitCode = 1;
  });
  server.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  restart().catch(error => {
    console.error(`[restart] ${error.message}`);
    process.exitCode = 1;
  });
}
