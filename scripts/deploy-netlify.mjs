import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export async function deployNetlify({
  token,
  site,
  release,
  zip,
  fetchImpl = fetch,
  wait = setTimeout,
  attempts = 90,
}) {
  if (!token || !site || !/^[a-f0-9]{40}$/.test(release || ""))
    throw new Error("Faltan NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID o APP_RELEASE válido.");
  const api = "https://api.netlify.com/api/v1";
  async function request(endpoint, options = {}) {
    const response = await fetchImpl(`${api}${endpoint}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
      signal: AbortSignal.timeout(120_000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        `Netlify HTTP ${response.status}: ${typeof data === "string" ? data : data.message || data.error || "publicación rechazada"}`,
      );
    return data;
  }
  // production es el parámetro de la API; draft=false en la query no lo sustituye.
  const query = new URLSearchParams({ production: "true", title: `main ${release}` });
  let deploy = await request(`/sites/${encodeURIComponent(site)}/deploys?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: zip,
  });
  if (!deploy.id) throw new Error("Netlify no devolvió un identificador de despliegue.");
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (deploy.state === "error" || deploy.error_message)
      throw new Error(`Netlify: ${deploy.error_message || deploy.state}`);
    if (deploy.state === "ready") {
      const current = await request(`/sites/${encodeURIComponent(site)}`);
      if (current.published_deploy?.id === deploy.id && deploy.context === "production") {
        console.log(`Netlify: producción publicada (${deploy.id}, ${release}).`);
        return deploy;
      }
    }
    await wait(3000);
    deploy = await request(`/deploys/${encodeURIComponent(deploy.id)}`);
  }
  throw new Error(`Netlify no confirmó producción para ${deploy.id} (estado ${deploy.state}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await deployNetlify({
    token: process.env.NETLIFY_AUTH_TOKEN,
    site: process.env.NETLIFY_SITE_ID,
    release: process.env.APP_RELEASE,
    zip: await readFile(process.argv[2] || "frontend.zip"),
  });
