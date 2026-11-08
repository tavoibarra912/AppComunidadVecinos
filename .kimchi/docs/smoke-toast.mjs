// Smoke del toast rediseñado con stub mínimo de DOM.
function elemento() {
  const clases = new Set();
  const e = {
    dataset: {}, hijos: [], textContent: "", className: "",
    classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c) },
    matches: () => false,
    showPopover: () => {}, hidePopover: () => {},
    append: (...nodos) => e.hijos.push(...nodos),
    appendChild: nodo => { e.hijos.push(nodo); return nodo; },
    replaceChildren: (...nodos) => { e.hijos.length = 0; e.hijos.push(...nodos); },
    get offsetWidth() { return 10; },
    parentElement: null, isConnected: true,
  };
  return e;
}

const toastEl = elemento();
globalThis.document = { querySelector: sel => (sel === "#toast" ? toastEl : null), createElement: () => elemento(), body: elemento() };
globalThis.window = { setTimeout: () => 1, clearTimeout: () => {} };

const { toast } = await import("../../public/js/utils.js");

let fallos = 0; const check = (l, c) => { fallos += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };
const claseVisible = () => toastEl.classList.contains("visible");

toast("Configuración guardada.");
check("éxito detectado", toastEl.dataset.tipo === "success");
check("estructura icono + texto", toastEl.hijos.length === 2 && toastEl.hijos[0].className === "toast-icono" && !!toastEl.hijos[0].innerHTML && toastEl.hijos[1].textContent === "Configuración guardada.");
check("clase visible aplicada", claseVisible());

toast("No se pudo guardar el usuario");
check("error detectado", toastEl.dataset.tipo === "error");

toast("No se puede eliminar el inmueble: tiene un inquilino asociado.");
check("advertencia detectada", toastEl.dataset.tipo === "warning");

toast("Bienvenido a la plataforma");
check("info por defecto", toastEl.dataset.tipo === "info");

toast("Guardado", "error");
check("tipo explícito gana al automático", toastEl.dataset.tipo === "error");

console.log(fallos ? `${fallos} fallos` : "SMOKE TOAST OK");
process.exit(fallos ? 1 : 0);
