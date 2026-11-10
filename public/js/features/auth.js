import { api } from "../api.js";
// ==========================================
// SESIÓN: acceso por usuario y contraseña
// ==========================================
import { refreshState, clearSession } from "../state.js";
import { toast, limpiarGuardia } from "../utils.js";
import { applyRoleUI, handleRouting, renderUserSelector } from "./navigation.js";

const loginScreen = document.querySelector("#login-screen");
let recoveryToken = "";
export function showRecoveryFromLink() {
  if (!window.location.hash.startsWith("#reset-password=")) return false;
  const match = /^#reset-password=([a-f0-9]{64})$/.exec(window.location.hash);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  showLoginView("forgot");
  recoveryToken = match?.[1] || "";
  document.querySelector("#login-forgot-form").hidden = true;
  document.querySelector("#login-reset-block").hidden = false;
  document.querySelector("#login-reset-error").textContent = recoveryToken ? "" : "El enlace no es válido. Solicitá uno nuevo.";
  return true;
}
window.addEventListener("hashchange", showRecoveryFromLink);
try {
  const notice = sessionStorage.getItem("authNotice");
  if (notice) {
    const element = document.querySelector("#login-signin-notice");
    element.textContent = notice;
    element.hidden = false;
    sessionStorage.removeItem("authNotice");
  }
} catch {}

export function showLoginView(view) {
  if (view === "signup" && document.querySelector("#login-open-signup")?.hidden)
    view = "signin";
  if (view === "forgot" && document.querySelector("#login-open-forgot")?.hidden)
    view = "signin";
  document.querySelector("#login-forgot-form").hidden = false;
  document.querySelector("#login-reset-block").hidden = true;
  recoveryToken = "";
  loginScreen.hidden = false;
  document.querySelector(".topbar").style.display = "none";
  document.querySelector(".mobile-nav").style.display = "none";
  document.querySelector("main.layout").style.display = "none";
  document.querySelectorAll(".login-view").forEach(v => { v.hidden = v.id !== `login-view-${view}`; });
}

export function hideLoginScreen() {
  loginScreen.hidden = true;
  document.querySelector(".topbar").style.display = "";
  document.querySelector(".mobile-nav").style.display = "";
  document.querySelector("main.layout").style.display = "";
}

const loginApi = (path, body) => api.auth(path, body);

async function startSession(user) {
  // El alta y el SSO pueden devolver un usuario que aún no está en el estado.
  await refreshState();

  renderUserSelector();
  limpiarGuardia(document.querySelector("#owner-form"));
  hideLoginScreen();
  applyRoleUI();
  // Tras autenticar, la pantalla a mostrar es Inicio.
  if (window.location.hash !== "#home") {
    window.location.hash = "#home";
  } else {
    handleRouting();
  }
}

// Navegación entre vistas
document.querySelectorAll("[data-login-view]").forEach(btn => {
  btn.addEventListener("click", () => showLoginView(btn.dataset.loginView));
});

// ---------- Sign In ----------
document.querySelector("#login-signin-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const errorEl = document.querySelector("#login-signin-error");
  errorEl.textContent = "";
  try {
    const user = await loginApi("signin", {
      usuario: form.elements.usuario.value,
      password: form.elements.password.value
    });
    await startSession(user);
    toast(`Bienvenido, ${user.nombre || user.usuario}.`);
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

// ---------- Sign Up ----------
document.querySelector("#login-signup-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const errorEl = document.querySelector("#login-signup-error");
  errorEl.textContent = "";
  const password = form.elements.password.value;
  if (password !== form.elements.password2.value) {
    errorEl.textContent = "Las contraseñas no coinciden.";
    return;
  }
  try {
    const user = await loginApi("signup", {
      nombre: form.elements.nombre.value,
      apellido: form.elements.apellido.value,
      usuario: form.elements.usuario.value,
      email: form.elements.email.value,
      password
    });
    await startSession(user);
    toast("Cuenta creada. ¡Bienvenido!");
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

// Los proveedores externos quedan ocultos hasta disponer de OAuth real.
document.querySelectorAll(".sso-btn, .sso-row, .login-divider").forEach(el => { el.hidden = true; });

// ---------- Forgot Password ----------
document.querySelector("#login-forgot-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const errorEl = document.querySelector("#login-forgot-error");
  const okEl = document.querySelector("#login-forgot-ok");
  errorEl.textContent = "";
  okEl.hidden = true;
  try {
    const result = await loginApi("forgot-password", { email: form.elements.email.value });
    okEl.textContent = result.mensaje;
    okEl.hidden = false;

  } catch (error) {
    errorEl.textContent = error.message;
  }
});

// ---------- Reset Password ----------
document.querySelector("#login-reset-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const errorEl = document.querySelector("#login-reset-error");
  errorEl.textContent = "";
  const token = recoveryToken;
  const password = event.target.elements.password.value;
  if (password !== event.target.elements.password2.value) {
    errorEl.textContent = "Las contraseñas no coinciden.";
    return;
  }
  try {
    await loginApi("reset-password", { token, password });
    clearSession();
    event.target.reset();
    showLoginView("signin");
    const notice = document.querySelector("#login-signin-notice");
    notice.textContent = "Contraseña actualizada. Iniciá sesión con la nueva contraseña.";
    notice.hidden = false;
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

function loggedOut() {
  clearSession();
  document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
  document.querySelectorAll(".login-view form").forEach(form => form.reset());
  showLoginView("signin");
  window.location.reload();
}
window.addEventListener("auth:expired", loggedOut);
document.querySelector("#user-logout-btn")?.addEventListener("click", async () => {
  try { await api.auth("logout"); loggedOut(); } catch (error) { if (error.status === 401) loggedOut(); else toast(error.message); }
});
