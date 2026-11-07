import { openTenantDetail } from "./inquilinos.js";
import { sanitizeHtml } from "../html.js";
import { state, getCurrentOwnerProfile, ownerTenants, getTenantContractStatus, getCurrencies, hasPermission, requirePermission } from "../state.js";
import { navigateToSection } from "./navigation.js";
import { openOwnerEditor, renderOwners, openOwnerDetail } from "./propietarios.js";
import { openCommunityEditor } from "./comunidades.js";
import { updateInboxBadge, openAdminInbox, getOwnerOverallDocStatus, openOwnerInbox } from "./notificaciones.js";

const homeGreetingTitle = document.querySelector("#home-greeting-title");
const homeGreetingDesc = document.querySelector("#home-greeting-desc");
const homeHeroRoleBadge = document.querySelector("#home-hero-role-badge");
const homeHeroActions = document.querySelector("#home-hero-actions");
const homeKpiComms = document.querySelector("#home-kpi-comms");
const homeKpiCommsLabel = document.querySelector("#home-kpi-comms-label");
const homeKpiOwners = document.querySelector("#home-kpi-owners");
const homeKpiOwnersLabel = document.querySelector("#home-kpi-owners-label");
const homeKpiMembers = document.querySelector("#home-kpi-members");
const homeKpiMembersLabel = document.querySelector("#home-kpi-members-label");
const homeKpiMembersSub = document.querySelector("#home-kpi-members-sub");
const homeKpiPendingDocs = document.querySelector("#home-kpi-pending-docs");
const homeKpiPendingLabel = document.querySelector("#home-kpi-pending-label");
const homeKpiPendingSub = document.querySelector("#home-kpi-pending-sub");
const homeDocSummaryList = document.querySelector("#home-doc-summary-list");
const homeQuickActionsContainer = document.querySelector("#home-quick-actions-container");
const homeActivityTitle = document.querySelector("#home-activity-title");
const homeActivitySubtitle = document.querySelector("#home-activity-subtitle");
const homeTodayDay = document.querySelector("#home-today-day");
const homeTodayMonth = document.querySelector("#home-today-month");

const contactVerify = {
  phone: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" },
  email: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" }
};

function populateCurrencySelect(selected) {
  const select = document.querySelector("#owner-form")?.elements.currency;
  if (!select) return;
  select.replaceChildren();
  getCurrencies().forEach(c => select.add(new Option(c.name, c.code)));
  select.value = selected || "EUR";
}

export function renderHomeDashboard() {
  const isOwner = state.activeRole === "owner";
  const now = new Date();
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  if (homeTodayDay) homeTodayDay.textContent = now.getDate();
  if (homeTodayMonth) homeTodayMonth.textContent = months[now.getMonth()] + " " + now.getFullYear();

  if (isOwner) {
    const currentOwner = getCurrentOwnerProfile();
    const comName = currentOwner?.communityName || "Sin comunidad asignada";
    
    if (homeHeroRoleBadge) homeHeroRoleBadge.textContent = "Área de Asociado";
    if (homeGreetingTitle) homeGreetingTitle.textContent = currentOwner ? `Hola, ${currentOwner.name}` : "Perfil no disponible";
    if (homeGreetingDesc) homeGreetingDesc.textContent = "Bienvenido a tu panel personal de Peñarrubia. Desde aquí puedes consultar el estado de tu comunidad (" + comName + "), tus parcelas y gestionar tu documentación oficial.";
    
    if (homeHeroActions) {
      homeHeroActions.innerHTML = sanitizeHtml(`
        <button class="primary-button" id="home-owner-btn-docs" type="button">📄 Ver mi expediente</button>
        <button class="secondary-button" id="home-owner-btn-comm" type="button">🏠 Mi Comunidad</button>
      `);
      const btnDocs = document.querySelector("#home-owner-btn-docs");
      if (btnDocs) btnDocs.addEventListener("click", () => {
        navigateToSection("#propietarios");
        if (currentOwner) setTimeout(() => openOwnerDetail(currentOwner.id), 50);
      });
      const btnComm = document.querySelector("#home-owner-btn-comm");
      if (btnComm) btnComm.addEventListener("click", () => navigateToSection("#comunidades"));
    }

    if (homeKpiComms) homeKpiComms.textContent = currentOwner ? "1" : "0";
    if (homeKpiCommsLabel) homeKpiCommsLabel.textContent = comName;
    if (homeKpiOwners) homeKpiOwners.textContent = currentOwner?.plot || "—";
    if (homeKpiOwnersLabel) homeKpiOwnersLabel.textContent = "Inmueble / Parcela";
    if (homeKpiMembers) homeKpiMembers.textContent = currentOwner ? (currentOwner.isMember ? "Activo" : "No") : "—";
    if (homeKpiMembersLabel) homeKpiMembersLabel.textContent = "Condición de asociado";
    if (homeKpiMembersSub) homeKpiMembersSub.textContent = "Derecho a voto y servicios";

    const docStatus = currentOwner ? getOwnerOverallDocStatus(currentOwner) : { label: "Sin perfil", class: "" };
    if (homeKpiPendingDocs) homeKpiPendingDocs.textContent = docStatus.label.split(" ")[0];
    if (homeKpiPendingLabel) homeKpiPendingLabel.textContent = "Estado documentación";
    if (homeKpiPendingSub) homeKpiPendingSub.textContent = docStatus.label;

    if (homeActivityTitle) homeActivityTitle.textContent = "Tus Documentos de Propietario";
    if (homeActivitySubtitle) homeActivitySubtitle.textContent = "Comprobación y validez de tus títulos acreditativos";

    if (homeDocSummaryList && !currentOwner) {
      homeDocSummaryList.replaceChildren();
    } else if (homeDocSummaryList) {
      const docs = currentOwner.documents || {};
      const items = [
        { key: "dni", title: "Copia de DNI (ambas caras)", data: docs.dni },
        { key: "bankReceipt", title: "Recibo bancario / Certificado", data: docs.bankReceipt },
        { key: "propertyDeed", title: "Copia de escritura notarial", data: docs.propertyDeed }
      ];

      homeDocSummaryList.innerHTML = sanitizeHtml(items.map(item => {
        const d = item.data;
        let badgeText = "No aportado";
        let dotClass = "dot-none";
        let subtext = "Pendiente de adjuntar por el asociado";

        if (d && d.fileName) {
          if (d.adminApproval && d.adminApproval.status === "approved") {
            badgeText = "Aprobado";
            dotClass = "dot-approved";
            subtext = "Convalidado oficialmente por administración";
          } else if (d.adminApproval && d.adminApproval.status === "rejected") {
            badgeText = "Rechazado";
            dotClass = "dot-rejected";
            subtext = "Requiere subsanación";
          } else {
            badgeText = "En revisión";
            dotClass = "dot-pending";
            subtext = "Pendiente de revisión administrativa";
          }
        }

        return `
          <div class="home-summary-row">
            <div class="home-summary-row-info">
              <span class="home-summary-dot ${dotClass}"></span>
              <div>
                <p class="home-summary-text-title">${item.title}</p>
                <p class="home-summary-text-desc">${subtext}</p>
              </div>
            </div>
            <span class="home-summary-badge-count">${badgeText}</span>
          </div>
        `;
      }).join(""));
    }

    if (homeQuickActionsContainer) {
      homeQuickActionsContainer.innerHTML = sanitizeHtml(`
        <button class="home-quick-btn" id="hq-btn-notifs" type="button">
          <span class="home-quick-icon">🔔</span>
          <div>
            <div>Ver mis avisos y convocatorias</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Buzón con notificaciones de la comunidad</div>
          </div>
        </button>
        <button class="home-quick-btn" id="hq-btn-profile" type="button">
          <span class="home-quick-icon">📋</span>
          <div>
            <div>Consultar mi expediente completo</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Datos personales, bancarios y documentación</div>
          </div>
        </button>
        <button class="home-quick-btn" id="hq-btn-comm-view" type="button">
          <span class="home-quick-icon">🏢</span>
          <div>
            <div>Datos de mi comunidad de vecinos</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Ficha informativa y contacto del administrador</div>
          </div>
        </button>
      `);
      const qNotif = document.querySelector("#hq-btn-notifs");
      if (qNotif) qNotif.addEventListener("click", openOwnerInbox);
      const qProf = document.querySelector("#hq-btn-profile");
      if (qProf) qProf.addEventListener("click", () => {
        navigateToSection("#propietarios");
        if (currentOwner) setTimeout(() => openOwnerDetail(currentOwner.id), 50);
      });
      const qComm = document.querySelector("#hq-btn-comm-view");
      if (qComm) qComm.addEventListener("click", () => navigateToSection("#comunidades"));
    }

  } else {
    // Vista Administrador
    if (homeHeroRoleBadge) homeHeroRoleBadge.textContent = "Panel Principal · Administrador";
    if (homeGreetingTitle) homeGreetingTitle.textContent = "Bienvenido a la gestión de Peñarrubia";
    if (homeGreetingDesc) homeGreetingDesc.textContent = "Plataforma integral para el censo territorial, gestión de comunidades y convalidación documental de propietarios asociados.";
    
    if (homeHeroActions) {
      homeHeroActions.innerHTML = sanitizeHtml(`
        <button class="icon-action-btn btn-add btn-lg" id="home-btn-new-comm" type="button" title="Nueva comunidad" aria-label="Nueva comunidad">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button class="icon-action-btn btn-info btn-lg" id="home-btn-new-owner" type="button" title="Nuevo propietario" aria-label="Nuevo propietario">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <line x1="19" y1="8" x2="19" y2="14"></line>
            <line x1="22" y1="11" x2="16" y2="11"></line>
          </svg>
        </button>
      `);
      const btnC = document.querySelector("#home-btn-new-comm");
      if (btnC) btnC.addEventListener("click", () => openCommunityEditor());
      const btnO = document.querySelector("#home-btn-new-owner");
      if (btnO) btnO.addEventListener("click", () => openOwnerEditor(null, "data"));
    }

    const totalComms = state.communities.length;
    const totalOwners = state.owners.length;
    const activeMembers = state.owners.filter(o => o.isMember).length;
    
    let countPending = 0;
    let countApproved = 0;
    let countIncomplete = 0;
    let countNone = 0;
    let countRejected = 0;

    state.owners.forEach(o => {
      const st = getOwnerOverallDocStatus(o).status;
      if (st === "pending_admin") countPending++;
      else if (st === "approved") countApproved++;
      else if (st === "incomplete") countIncomplete++;
      else if (st === "rejected") countRejected++;
      else countNone++;
    });

    if (homeKpiComms) homeKpiComms.textContent = totalComms;
    if (homeKpiCommsLabel) homeKpiCommsLabel.textContent = "Comunidades censadas";
    if (homeKpiOwners) homeKpiOwners.textContent = totalOwners;
    if (homeKpiOwnersLabel) homeKpiOwnersLabel.textContent = "Propietarios censados";
    if (homeKpiMembers) homeKpiMembers.textContent = activeMembers + " (" + (totalOwners ? Math.round((activeMembers/totalOwners)*100) : 0) + "%)";
    if (homeKpiMembersLabel) homeKpiMembersLabel.textContent = "Socios activos";
    if (homeKpiMembersSub) homeKpiMembersSub.textContent = "Cuotas y derechos al día";
    if (homeKpiPendingDocs) homeKpiPendingDocs.textContent = countPending;
    if (homeKpiPendingLabel) homeKpiPendingLabel.textContent = "Expedientes ptes. revisión";
    if (homeKpiPendingSub) homeKpiPendingSub.textContent = countPending > 0 ? "Requieren tu aprobación" : "Sin pendientes";

    if (homeActivityTitle) homeActivityTitle.textContent = "Estado Global de Documentación";
    if (homeActivitySubtitle) homeActivitySubtitle.textContent = "Resumen del censo de expedientes documentales";

    if (homeDocSummaryList) {
      homeDocSummaryList.innerHTML = sanitizeHtml(`
        <div class="home-summary-row">
          <div class="home-summary-row-info">
            <span class="home-summary-dot dot-pending"></span>
            <div>
              <p class="home-summary-text-title">Pendientes de Aprobación Admin</p>
              <p class="home-summary-text-desc">Documentos verificados por sistema esperando visto bueno</p>
            </div>
          </div>
          <span class="home-summary-badge-count">${countPending}</span>
        </div>
        <div class="home-summary-row">
          <div class="home-summary-row-info">
            <span class="home-summary-dot dot-approved"></span>
            <div>
              <p class="home-summary-text-title">Expedientes Aprobados</p>
              <p class="home-summary-text-desc">Convalidación administrativa completada</p>
            </div>
          </div>
          <span class="home-summary-badge-count">${countApproved}</span>
        </div>
        <div class="home-summary-row">
          <div class="home-summary-row-info">
            <span class="home-summary-dot dot-incomplete"></span>
            <div>
              <p class="home-summary-text-title">Incompletos / Parciales</p>
              <p class="home-summary-text-desc">Falta aportar DNI, recibo bancario o escritura</p>
            </div>
          </div>
          <span class="home-summary-badge-count">${countIncomplete}</span>
        </div>
        <div class="home-summary-row">
          <div class="home-summary-row-info">
            <span class="home-summary-dot dot-none"></span>
            <div>
              <p class="home-summary-text-title">Sin Documentación Aportada</p>
              <p class="home-summary-text-desc">Expedientes iniciales sin adjuntos</p>
            </div>
          </div>
          <span class="home-summary-badge-count">${countNone}</span>
        </div>
      `);
    }

    if (homeQuickActionsContainer) {
      homeQuickActionsContainer.innerHTML = sanitizeHtml(`
        <button class="home-quick-btn" id="hq-admin-inbox" type="button">
          <span class="home-quick-icon">📬</span>
          <div>
            <div>Buzón de avisos de verificación</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Revisar solicitudes de propietarios y convalidaciones</div>
          </div>
        </button>
        <div class="home-quick-btn">
          <span class="home-quick-icon">🏢</span>
          <div>
            <div>Dar de alta nueva comunidad</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Formulario con validación INE y NIF</div>
          </div>
          <button class="icon-action-btn btn-add" id="hq-admin-new-comm" type="button" title="Nueva comunidad" aria-label="Nueva comunidad">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
        <div class="home-quick-btn">
          <span class="home-quick-icon">👤</span>
          <div>
            <div>Censar nuevo propietario o asociado</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Alta con verificación oficial de DNI/NIE e IBAN</div>
          </div>
          <button class="icon-action-btn btn-info" id="hq-admin-new-owner" type="button" title="Nuevo propietario" aria-label="Nuevo propietario">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <line x1="19" y1="8" x2="19" y2="14"></line>
              <line x1="22" y1="11" x2="16" y2="11"></line>
            </svg>
          </button>
        </div>
        <button class="home-quick-btn" id="hq-admin-filter-pending" type="button">
          <span class="home-quick-icon">⏳</span>
          <div>
            <div>Ver propietarios con revisión pendiente</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Filtra directamente la tabla por expedientes pendientes</div>
          </div>
        </button>
      `);

      const qInbox = document.querySelector("#hq-admin-inbox");
      if (qInbox) qInbox.addEventListener("click", openAdminInbox);
      const qNewC = document.querySelector("#hq-admin-new-comm");
      if (qNewC) qNewC.addEventListener("click", () => openCommunityEditor());
      const qNewO = document.querySelector("#hq-admin-new-owner");
      if (qNewO) qNewO.addEventListener("click", () => openOwnerEditor(null, "data"));
      const qFilt = document.querySelector("#hq-admin-filter-pending");
      if (qFilt) qFilt.addEventListener("click", () => {
        navigateToSection("#propietarios");
        const search = document.querySelector("#search-owners");
        if (search) { search.value = "Pendiente"; search.dispatchEvent(new Event("input", { bubbles: true })); }
      });
    }
  }

  const memberCard = document.querySelector("#kpi-card-members");
  if (memberCard) memberCard.hidden = false;
  if (homeQuickActionsContainer?.parentElement) homeQuickActionsContainer.parentElement.hidden = false;
  const propertyLink = document.querySelector("#kpi-card-owners a");
  if (propertyLink) { propertyLink.href = "#propietarios"; propertyLink.textContent = "Ver propietarios →"; }
  if (state.activeRole === "owner" && !getCurrentOwnerProfile()) {
    if (memberCard) memberCard.hidden = true;
    if (homeQuickActionsContainer?.parentElement) homeQuickActionsContainer.parentElement.hidden = true;
    if (propertyLink) { propertyLink.href = "#inmuebles"; propertyLink.textContent = "Ver inmueble →"; }
    const currentTenant = state.tenants.find(t => t.userId === state.currentUserId);
    const property = state.properties.find(p => p.id === currentTenant?.propertyId);
    homeGreetingTitle.textContent = currentTenant ? `Hola, ${currentTenant.name}` : "Cuenta creada";
    homeGreetingDesc.textContent = currentTenant ? "Consultá los datos de tu contrato y de la comunidad donde vivís." : "Un administrador puede vincular tu cuenta a un perfil de propietario o inquilino.";
    homeHeroRoleBadge.textContent = currentTenant ? "Área de inquilino" : "Mi cuenta";
    homeHeroActions.replaceChildren(); homeQuickActionsContainer.replaceChildren(); homeDocSummaryList.replaceChildren();
    homeActivityTitle.textContent = currentTenant ? "Tu contrato" : "Perfil pendiente de asignación";
    homeActivitySubtitle.textContent = currentTenant ? "Datos disponibles para tu cuenta" : "Tus datos aparecerán cuando se vincule un perfil.";
    if (currentTenant) {
      const button = document.createElement("button"); button.type = "button"; button.className = "primary-button"; button.textContent = "Ver mi contrato";
      button.addEventListener("click", () => openTenantDetail(currentTenant.ownerId, currentTenant.id)); homeHeroActions.append(button);
      const summary = document.createElement("p"); summary.textContent = `${property?.plot || "Inmueble"} · ${getTenantContractStatus(currentTenant)}`; homeDocSummaryList.append(summary);
      homeKpiComms.textContent = property?.communityId ? "1" : "0"; homeKpiCommsLabel.textContent = property?.communityName || "Sin comunidad asignada";
      homeKpiOwners.textContent = property?.plot || "—"; homeKpiPendingDocs.textContent = getTenantContractStatus(currentTenant); homeKpiPendingLabel.textContent = "Estado del contrato"; homeKpiPendingSub.textContent = "";
    }
  }
}

