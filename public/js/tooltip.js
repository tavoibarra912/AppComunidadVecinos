// ==========================================
// TOOLTIPS DE ACCIÓN
// Explican qué hace cada botón al mantener el mouse encima o al enfocarlo.
// ==========================================
const SELECTOR =
  'button, [role="button"], a.primary-button, a.secondary-button, a.icon-action-btn, a.text-link-button, a.nav-item';
const SHOW_DELAY = 700;
const GAP = 9;
const EDGE = 8;
let layer = null;
let showTimer = 0;
let hoverTarget = null;
let focusTarget = null;
let shownFor = null;

function ensureLayer() {
  if (layer?.isConnected) return layer;
  layer = document.createElement("div");
  layer.id = "app-tooltip";
  layer.className = "app-tooltip";
  layer.setAttribute("role", "tooltip");
  layer.setAttribute("aria-hidden", "true");
  // La capa superior del navegador mantiene el tooltip por encima de los diálogos modales.
  if ("showPopover" in HTMLElement.prototype) layer.setAttribute("popover", "manual");
  document.body.append(layer);
  return layer;
}

function actionTarget(node) {
  if (!node || typeof node.closest !== "function") return null;
  return node.closest(SELECTOR);
}

function description(target) {
  const title = target.getAttribute("title")?.trim();
  if (title) {
    // El tooltip propio sustituye al nativo para no mostrar dos a la vez.
    target.dataset.tooltip = title;
    target.removeAttribute("title");
    if (!target.getAttribute("aria-label") && !target.textContent.trim())
      target.setAttribute("aria-label", title);
    return title;
  }
  const custom = target.dataset.tooltip?.trim();
  if (custom) return custom;
  const aria = target.getAttribute("aria-label")?.trim();
  if (aria) return aria;
  // En el menú lateral el texto visible ya explica la acción; solo hay tooltip al contraerlo.
  if (target.matches("a.nav-item")) return "";
  return target.textContent.replace(/\s+/g, " ").trim().slice(0, 160);
}

function position(target) {
  const box = target.getBoundingClientRect();
  const size = layer.getBoundingClientRect();
  const below = box.top - size.height - GAP < EDGE;
  const top = below ? box.bottom + GAP : box.top - size.height - GAP;
  const centered = box.left + box.width / 2 - size.width / 2;
  const left = Math.min(
    Math.max(centered, EDGE),
    Math.max(EDGE, window.innerWidth - size.width - EDGE),
  );
  layer.classList.toggle("is-below", below);
  layer.style.top = `${Math.round(top)}px`;
  layer.style.left = `${Math.round(left)}px`;
}

function show(target) {
  if (!target?.isConnected) return hide();
  const text = description(target);
  if (!text) return hide();
  ensureLayer();
  layer.textContent = text;
  try {
    if (layer.hasAttribute("popover") && !layer.matches(":popover-open")) layer.showPopover();
  } catch {
    // Sin Popover API la capa fija sigue funcionando fuera de diálogos.
  }
  layer.classList.add("is-visible");
  shownFor = target;
  position(target);
}

function hide() {
  clearTimeout(showTimer);
  showTimer = 0;
  shownFor = null;
  if (!layer) return;
  layer.classList.remove("is-visible");
  try {
    if (layer.hasAttribute("popover") && layer.matches(":popover-open")) layer.hidePopover();
  } catch {
    // Sin soporte de Popover no hay nada que cerrar.
  }
}

function keyboardFocus(target) {
  try {
    return target.matches(":focus-visible");
  } catch {
    return true;
  }
}

function schedule() {
  clearTimeout(showTimer);
  showTimer = 0;
  const target = focusTarget || hoverTarget;
  if (!target) return hide();
  if (shownFor && shownFor !== target) {
    layer?.classList.remove("is-visible");
    shownFor = null;
  }
  // El foco de teclado muestra el tooltip de inmediato; el mouse espera un instante.
  if (focusTarget && keyboardFocus(focusTarget)) return show(focusTarget);
  if (shownFor === target) return;
  showTimer = setTimeout(() => show(target), SHOW_DELAY);
}

export function installTooltips() {
  document.addEventListener("mouseover", (event) => {
    const target = actionTarget(event.target);
    if (target === hoverTarget) return;
    hoverTarget = target;
    schedule();
  });
  document.addEventListener("mouseout", (event) => {
    if (!hoverTarget) return;
    if (event.relatedTarget && hoverTarget.contains(event.relatedTarget)) return;
    if (actionTarget(event.target) !== hoverTarget) return;
    hoverTarget = null;
    schedule();
  });
  document.addEventListener("focusin", (event) => {
    const target = actionTarget(event.target);
    if (!target || target === focusTarget) return;
    focusTarget = target;
    schedule();
  });
  document.addEventListener("focusout", (event) => {
    if (!focusTarget) return;
    if (event.relatedTarget && focusTarget.contains(event.relatedTarget)) return;
    if (actionTarget(event.target) !== focusTarget) return;
    focusTarget = null;
    schedule();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
  document.addEventListener("pointerdown", hide, true);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}
