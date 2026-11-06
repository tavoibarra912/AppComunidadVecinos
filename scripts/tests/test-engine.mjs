const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const base = "http://localhost:3000";

async function dump(url) {
  try {
    const { stdout, stderr } = await run(edge, ["--headless=new", "--disable-gpu", "--enable-logging=stderr", "--v=0", "--virtual-time-budget=10000", "--dump-dom", url], { maxBuffer: 60 * 1024 * 1024 });
    return { dom: stdout, log: stderr };
  } catch (e) {
    return { dom: String(e.stdout || ""), log: String(e.stderr || e.message) };
  }
}

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "OK   " : "FALTA"} ${label}`);
  if (!ok) failures++;
};

for (const hash of ["", "#comunidades", "#propietarios", "#inmuebles", "#inquilinos"]) {
  const { log } = await dump(`${base}/${hash}`);
  const errors = (log.match(/CONSOLE[^\n]*(?:Uncaught|TypeError|ReferenceError|SyntaxError)[^\n]*/g) || [])
    .filter(l => !l.includes("ProtocolLaunch"));
  check(errors.length === 0, `sin errores de consola en "${hash || "#home"}"${errors.length ? " -> " + errors[0].slice(0, 140) : ""}`);
  if (hash === "") global.__homeDom = (await dump(`${base}/`)).dom;
}

const home = global.__homeDom || "";

// Etiquetas nuevas
check(home.includes('>Comunidad</span>') || home.includes('>Comunidad<'), "header 'Comunidad' (sin 'Identificador')");
check(!/<th[^>]*>[^<]*Identificador /.test(home), "sin labels 'Identificador ...' en encabezados de tabla");
check(home.includes("data-community-tab=\"docs\"") && home.includes("community-document-input"), "tab Documentación en comunidad");
check(home.includes('data-property-tab="docs"') && home.includes("property-doc-count"), "tab Documentación en inmueble");
check(!home.includes("entity-subnav"), "sin subnav Propietarios/Inquilinos");
check(!home.includes("owner-detail-new-tenant"), "sin botón crear inquilino en ficha");
check(home.includes("owner-property-link-select"), "tab Inmueble del propietario intacto");

// Primera fila de comunidades: 5 celdas (Comunidad, Dirección, Municipio, Email, Acciones)
const m = home.match(/id="comunidades-table"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
if (m) {
  const firstRow = m[1].split("</tr>")[0];
  const cells = (firstRow.match(/<td>/g) || []).length;
  check(cells === 5, `comunidades: 5 columnas visibles (hay ${cells})`);
  check((firstRow.match(/icon-action-btn/g) || []).length === 3, "acciones: ver + editar + borrar");
  check(firstRow.includes("btn-edit") && firstRow.includes("btn-delete"), "editar y borrar presentes");
} else {
  check(false, "no se encontró tbody de comunidades");
}

console.log(failures === 0 ? "\nTODOS LOS CHECKS PASARON" : `\n${failures} CHECKS FALLARON`);
process.exit(failures === 0 ? 0 : 1);
