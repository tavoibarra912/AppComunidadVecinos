import { api } from "../api.js";
import { state, ROLE_LABELS, hasPermission } from "../state.js";
import { accountView } from "../account-view.js";
import { navigateToSection } from "./navigation.js";
import { openOwnerDetail } from "./propietarios.js";
import { openTenantDetail } from "./inquilinos.js";

const container = document.querySelector("#user-account-badge");
const toggle = document.querySelector("#user-menu-toggle");
const menu = document.querySelector("#user-menu");
const profileDialog = document.querySelector("#account-profile-dialog");
const passwordDialog = document.querySelector("#account-password-dialog");
const passwordForm = document.querySelector("#account-password-form");
const passwordError = document.querySelector("#account-password-error");
const passwordSubmit = document.querySelector("#account-password-submit");

function items() {
  return [...menu.querySelectorAll('[role="menuitem"]')].filter(
    (item) => !item.hidden && !item.disabled,
  );
}
function closeMenu(restoreFocus = false) {
  menu.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  if (restoreFocus) toggle.focus();
}
function openMenu(last = false) {
  if (!state.currentUserId) return;
  renderAccountMenu();
  menu.hidden = false;
  toggle.setAttribute("aria-expanded", "true");
  const choices = items();
  choices[last ? choices.length - 1 : 0]?.focus();
}
toggle.addEventListener("click", () =>
  menu.hidden ? openMenu() : closeMenu(true),
);
toggle.addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  openMenu(event.key === "ArrowUp");
});
menu.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeMenu(true);
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const choices = items();
  let index = choices.indexOf(document.activeElement);
  if (event.key === "Home") index = 0;
  else if (event.key === "End") index = choices.length - 1;
  else
    index =
      (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) %
      choices.length;
  choices[index]?.focus();
});
document.addEventListener("pointerdown", (event) => {
  if (!container.contains(event.target)) closeMenu();
});
container.addEventListener("focusout", (event) => {
  if (!container.contains(event.relatedTarget)) closeMenu();
});
window.addEventListener("hashchange", () => closeMenu());
window.addEventListener("auth:expired", () => closeMenu());

export function renderAccountMenu() {
  const view = accountView(state, ROLE_LABELS);
  document.querySelector("#user-menu-name").textContent = view.displayName;
  document.querySelector("#user-menu-email").textContent =
    view.user?.email || view.roleLabel;
  document.querySelector("#account-menu-community").textContent =
    state.activeRole === "owner" ? "Mi comunidad" : "Comunidades";
  if (!view.user) closeMenu();
}

function openProfile() {
  const view = accountView(state, ROLE_LABELS);
  if (!view.user) return;
  for (const [id, value] of [
    ["account-profile-name", view.displayName],
    ["account-profile-username", view.user.usuario],
    ["account-profile-email", view.user.email],
    ["account-profile-role", view.roleLabel],
  ]) {
    document.getElementById(id).textContent = value || "No indicado";
  }
  const links = document.querySelector("#account-profile-links");
  links.replaceChildren();
  for (const owner of view.owners) {
    if (!hasPermission("owner:read", owner.id)) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = `Ver ficha de propietario: ${owner.name} ${owner.surname}`;
    button.addEventListener("click", () => {
      profileDialog.close();
      navigateToSection("#propietarios");
      openOwnerDetail(owner.id);
    });
    links.append(button);
  }
  for (const tenant of view.tenants) {
    if (!hasPermission("tenant:read", tenant.id)) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = `Ver contrato: ${tenant.name} ${tenant.surname}`;
    button.addEventListener("click", () => {
      profileDialog.close();
      navigateToSection("#inquilinos");
      openTenantDetail(tenant.ownerId, tenant.id);
    });
    links.append(button);
  }
  const hint = document.querySelector("#account-profile-hint");
  hint.textContent = view.hasProfile
    ? view.communities.length
      ? `Comunidades vinculadas: ${view.communities.map((item) => item.name).join(", ")}.`
      : view.communityMessage
    : state.activeRole === "owner"
      ? view.communityMessage
      : "Tu acceso a la aplicación depende de los permisos de tu rol. No necesitás un perfil de propietario o inquilino para administrar.";
  closeMenu();
  profileDialog.showModal();
}
document
  .querySelector("#account-menu-profile")
  .addEventListener("click", openProfile);
document
  .querySelector("#account-menu-community")
  .addEventListener("click", () => {
    closeMenu();
    navigateToSection("#comunidades");
  });
document
  .querySelector("#account-menu-password")
  .addEventListener("click", () => {
    closeMenu();
    passwordForm.reset();
    passwordError.textContent = "";
    passwordDialog.showModal();
  });
document
  .querySelector("#user-logout-btn")
  .addEventListener("click", () => closeMenu());
for (const button of document.querySelectorAll("[data-close-account-dialog]")) {
  button.addEventListener("click", () =>
    document.getElementById(button.dataset.closeAccountDialog).close(),
  );
}
for (const dialog of [profileDialog, passwordDialog])
  dialog.addEventListener("close", () => toggle.focus());
passwordDialog.addEventListener("close", () => {
  passwordForm.reset();
  passwordError.textContent = "";
});
passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (passwordSubmit.disabled) return;
  passwordError.textContent = "";
  const { currentPassword, newPassword, confirmPassword } =
    passwordForm.elements;
  if (!currentPassword.value) {
    passwordError.textContent = "Indicá tu contraseña actual.";
    currentPassword.focus();
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.textContent = "Las contraseñas nuevas no coinciden.";
    confirmPassword.focus();
    return;
  }
  if (newPassword.value.length < 8 || newPassword.value.length > 128) {
    passwordError.textContent =
      "La contraseña debe tener entre 8 y 128 caracteres.";
    newPassword.focus();
    return;
  }
  passwordSubmit.disabled = true;
  passwordForm.setAttribute("aria-busy", "true");
  try {
    await api.auth("change-password", {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });
    try {
      sessionStorage.setItem(
        "authNotice",
        "Contraseña actualizada. Iniciá sesión con tu nueva contraseña.",
      );
    } catch {}
    window.dispatchEvent(new Event("auth:expired"));
  } catch (error) {
    if (error.status === 401) {
      try {
        await api.getCurrentUser();
      } catch (sessionError) {
        if (sessionError.status === 401)
          window.dispatchEvent(new Event("auth:expired"));
        else passwordError.textContent = sessionError.message;
        return;
      }
    }
    passwordError.textContent = error.message;
    currentPassword.value = "";
    currentPassword.focus();
  } finally {
    passwordSubmit.disabled = false;
    passwordForm.removeAttribute("aria-busy");
  }
});
