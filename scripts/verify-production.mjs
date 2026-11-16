import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export async function verifyProduction({
  url,
  release,
  scope = "full",
  fetchImpl = fetch,
  wait = setTimeout,
  attempts = 12,
}) {
  const origin = new URL(url);
  if (origin.protocol !== "https:" || !/^[a-f0-9]{40}$/.test(release || ""))
    throw new Error("Se requieren una URL HTTPS y APP_RELEASE válido.");
  if (!["full", "frontend"].includes(scope)) throw new Error("Ámbito de verificación inválido.");
  let failure;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      if (scope === "full") {
        const health = await fetchImpl(new URL("/api/health", origin), {
          signal: AbortSignal.timeout(10000),
        });
        if (!health.ok) throw new Error(`salud HTTP ${health.status}`);
        const data = await health.json();
        if (
          data.status !== "ok" ||
          data.app !== "app-comunidad-vecinos" ||
          data.release !== release
        )
          throw new Error("el backend no sirve el commit esperado");
        const page = await fetchImpl(origin, { signal: AbortSignal.timeout(10000) });
        if (!page.ok || !(await page.text()).includes("js/main.js"))
          throw new Error(`HTML de aplicación inaccesible (HTTP ${page.status})`);
      }
      const asset = await fetchImpl(new URL("/release.json", origin), {
        signal: AbortSignal.timeout(10000),
      });
      if (!asset.ok || (await asset.json()).release !== release)
        throw new Error("los estáticos no corresponden al commit esperado");
      if (scope === "frontend") {
        const entry = await fetchImpl(new URL("/js/main.js", origin), {
          signal: AbortSignal.timeout(10000),
        });
        if (
          !entry.ok ||
          !/javascript/i.test(entry.headers.get("content-type") || "") ||
          !(await entry.text()).trim()
        )
          throw new Error(`JavaScript público inaccesible (HTTP ${entry.status})`);
      }
      console.log(
        `${origin.origin}: ${scope === "frontend" ? "estáticos" : "HTML, API y estáticos"} de ${release} verificados.`,
      );
      return;
    } catch (error) {
      failure = error;
      await wait(2000);
    }
  }
  throw new Error(`${origin.origin}: ${failure.message}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await verifyProduction({
    url: process.argv[2],
    release: process.env.APP_RELEASE,
    scope: process.argv[3] || "full",
  });
