import { api } from "../api.js";
import { state, hasPermission } from "../state.js";
import { escapeHtml as h } from "../html.js";
import { toast, fieldLabel, mensajeDeValidez } from "../utils.js";

const request = api.communication;
const $ = (selector) => document.querySelector(selector);
const types = { notice: "Aviso", event: "Evento", meeting: "Reunión" };
const phases = {
  draft: "Borrador",
  scheduled: "Programado",
  upcoming: "Próximo",
  active: "Vigente",
  finished: "Finalizado",
  archived: "Archivado",
  cancelled: "Cancelado",
};
const audienceLabels = {
  all: "Toda la comunidad",
  owners: "Propietarios",
  tenants: "Inquilinos",
  selected: "Personas o inmuebles seleccionados",
};
const date = (value) =>
  value
    ? new Date(value).toLocaleString("es-ES", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Sin fecha";
const local = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const iso = (value) => (value ? new Date(value).toISOString() : "");
let metadata = null,
  posts = [],
  view = "board",
  loading = null,
  session = null;
let postsLoadedAt = null;
export function getCommunicationSnapshot() {
  return session === state.currentUserId && postsLoadedAt
    ? { posts: [...posts], loadedAt: postsLoadedAt }
    : null;
}
export function openCommunicationPost(id) {
  return openPost(id);
}
export async function openCommunicationComposer() {
  await refreshCommunication();
  if (metadata?.communities.some((c) => c.canManage)) openEditor();
}
let detailTab = "publication",
  editorPost = null,
  editorStep = 0,
  editorSnapshot = "";
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const dialog = document.createElement("dialog");
dialog.id = "comm-dialog";
dialog.className = "comm-dialog";
dialog.setAttribute("aria-labelledby", "comm-dialog-title");
document.body.append(dialog);
function showDialog(title, body) {
  dialog.innerHTML = `<div class="comm-dialog-header"><h2 id="comm-dialog-title">${h(title)}</h2><button type="button" class="icon-action-btn btn-cancel btn-lg" data-comm-close aria-label="Cerrar diálogo" title="Cerrar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="comm-dialog-body">${body}</div><p class="comm-error" id="comm-error" role="alert"></p>`;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector("[data-comm-close]").focus();
}
function closeDialog() {
  if (
    editorSnapshot &&
    JSON.stringify(editorData()) !== editorSnapshot &&
    !window.confirm("Tienes cambios sin guardar. ¿Quieres descartarlos?")
  )
    return;
  editorSnapshot = "";
  editorPost = null;
  dialog.close();
}
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  e.stopImmediatePropagation();
  closeDialog();
});
dialog.addEventListener("click", (e) => {
  if (e.target.closest("[data-comm-close]")) closeDialog();
});
async function action(fn, button) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  const output = $("#comm-error");
  if (output) output.textContent = "";
  try {
    await fn();
  } catch (error) {
    if ($("#comm-error") && dialog.open)
      $("#comm-error").textContent = error.message;
    else toast(error.message);
  } finally {
    if (button) button.disabled = false;
  }
}
function updateBadge() {
  const count = posts.filter(
    (p) =>
      p.recipient &&
      !p.recipient.readAt &&
      !["draft", "scheduled"].includes(p.phase),
  ).length;
  for (const el of document.querySelectorAll(
    "[data-comm-unread],#communication-unread",
  )) {
    el.textContent = count;
    el.hidden = count === 0;
  }
  window.dispatchEvent(new Event("communications:updated"));
}
export async function refreshCommunication() {
  if (!state.currentUserId) return;
  if (loading) return loading;
  const id = state.currentUserId;
  loading = Promise.all([request("/metadata"), request("/posts")])
    .then(([meta, result]) => {
      if (state.currentUserId !== id) return;
      metadata = meta;
      posts = result;
      session = id;
      postsLoadedAt = new Date().toISOString();
      updateBadge();
      $("#comm-new").hidden = !meta.communities.some((c) => c.canManage);
      const select = $("#comm-community"),
        selected = select.value;
      select.innerHTML = `<option value="">Todas mis comunidades</option>${meta.communities.map((c) => `<option value="${h(c.id)}">${h(c.name)}</option>`).join("")}`;
      select.value = selected;
      draw();
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}
export function renderCommunication() {
  if (session !== state.currentUserId) {
    metadata = null;
    posts = [];
    postsLoadedAt = null;
    session = state.currentUserId;
  }
  if (!metadata) $("#comm-status").textContent = "Cargando publicaciones…";
  refreshCommunication().catch((error) => {
    $("#comm-status").textContent = error.message;
  });
}
setInterval(() => {
  if (state.currentUserId && !document.hidden)
    refreshCommunication().catch(() => {});
}, 30000);
window.addEventListener("focus", () => {
  if (state.currentUserId) refreshCommunication().catch(() => {});
});
function filtered() {
  const community = $("#comm-community").value,
    type = $("#comm-type").value,
    status = $("#comm-filter").value,
    search = $("#comm-search").value.trim().toLocaleLowerCase();
  return posts
    .filter(
      (p) =>
        (!community || p.communityId === community) &&
        (!type || p.type === type) &&
        (view !== "meetings" || p.type === "meeting") &&
        (!search ||
          `${p.title} ${p.body}`.toLocaleLowerCase().includes(search)) &&
        (status === "all" ||
          (status === "current" && ["active", "upcoming"].includes(p.phase)) ||
          (status === "unread" && p.recipient && !p.recipient.readAt) ||
          status === p.phase),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        Date.parse(b.publishAt) - Date.parse(a.publishAt),
    );
}
function card(p) {
  return `<article class="comm-card ${p.priority === "urgent" ? "comm-urgent" : ""}"><div class="comm-card-meta"><span>${h(types[p.type])}${p.poll ? ` · ${p.poll.type === "vote" ? "Votación" : "Encuesta"}` : ""}</span><span class="comm-tag">${h(phases[p.phase])}</span>${p.pinned ? '<span class="comm-tag">Fijado</span>' : ""}${p.recipient && !p.recipient.readAt ? '<span class="comm-tag comm-new-tag">Sin leer</span>' : ""}</div><h2><button type="button" class="comm-title-button" data-open-post="${h(p.id)}">${h(p.title)}</button></h2><p class="comm-muted">${h(p.communityName)} · ${h(date(p.startsAt || p.publishAt))}</p><p class="comm-excerpt">${h(p.body.slice(0, 220))}${p.body.length > 220 ? "…" : ""}</p><div class="comm-card-footer"><span>${p.priority === "urgent" ? "Urgente" : p.priority === "important" ? "Importante" : h(audienceLabels[p.audience.mode])}</span><button type="button" class="secondary-button" data-open-post="${h(p.id)}">Ver publicación</button></div></article>`;
}
function draw() {
  if (!metadata) return;
  const list = filtered();
  $("#comm-status").textContent =
    `${list.length} ${list.length === 1 ? "publicación" : "publicaciones"} · Los horarios se muestran en tu zona local.`;
  $("#comm-content").innerHTML =
    view === "calendar"
      ? calendar(list)
      : list.length
        ? `<div class="comm-board">${list.map(card).join("")}</div>`
        : `<div class="comm-empty"><h2>${metadata.communities.length ? "No hay publicaciones con estos filtros" : "Todavía no tienes una comunidad vinculada"}</h2><p>${metadata.communities.length ? "Puedes cambiar los filtros para consultar el histórico, los borradores o las publicaciones programadas." : "Pedile a un administrador que vincule tu cuenta con tu perfil de propietario o inquilino."}</p></div>`;
}
function calendar(list) {
  const first = new Date(month),
    start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dayPosts = list.filter(
      (p) =>
        p.startsAt && new Date(p.startsAt).toDateString() === d.toDateString(),
    );
    return `<div class="comm-calendar-day ${d.getMonth() !== month.getMonth() ? "comm-other-month" : ""}"><span>${d.getDate()}</span>${dayPosts.map((p) => `<button type="button" data-open-post="${h(p.id)}">${h(new Date(p.startsAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }))} ${h(p.title)}</button>`).join("")}</div>`;
  });
  const agenda = list
    .filter(
      (p) =>
        p.startsAt &&
        new Date(p.startsAt).getMonth() === month.getMonth() &&
        new Date(p.startsAt).getFullYear() === month.getFullYear(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return `<div class="comm-month-nav"><button class="secondary-button" type="button" data-month="-1" aria-label="Mes anterior">Anterior</button><h2>${h(month.toLocaleDateString("es-ES", { month: "long", year: "numeric" }))}</h2><button class="secondary-button" type="button" data-month="1" aria-label="Mes siguiente">Siguiente</button></div><div class="comm-calendar">${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => `<strong>${d}</strong>`).join("")}${cells.join("")}</div><h3>Agenda del mes</h3>${agenda.length ? agenda.map((p) => `<p><button class="comm-title-button" type="button" data-open-post="${h(p.id)}">${h(date(p.startsAt))} · ${h(p.title)}</button></p>`).join("") : '<p class="comm-muted">No hay eventos o reuniones en este mes con los filtros elegidos.</p>'}`;
}
for (const id of ["comm-community", "comm-type", "comm-filter", "comm-search"])
  $(`#${id}`).addEventListener("input", draw);
$("#comm-tabs").addEventListener("click", (e) => {
  const button = e.target.closest("[data-comm-view]");
  if (!button) return;
  view = button.dataset.commView;
  $("#comm-tabs")
    .querySelectorAll("[role=tab]")
    .forEach((el) => el.setAttribute("aria-selected", String(el === button)));
  draw();
});
$("#comm-content").addEventListener("click", (e) => {
  const open = e.target.closest("[data-open-post]");
  if (open) action(() => openPost(open.dataset.openPost), open);
  const move = e.target.closest("[data-month]");
  if (move) {
    month = new Date(
      month.getFullYear(),
      month.getMonth() + Number(move.dataset.month),
      1,
    );
    draw();
  }
});
$("#comm-refresh").addEventListener("click", (e) =>
  action(refreshCommunication, e.currentTarget),
);
$("#comm-new").addEventListener("click", () => openEditor());
$("#comm-inbox-link").addEventListener("click", (e) => {
  e.preventDefault();
  action(async () => {
    await refreshCommunication();
    editorSnapshot = "";
    const notifications = posts
      .filter((p) => p.recipient && !["draft", "scheduled"].includes(p.phase))
      .sort(
        (a, b) =>
          Number(!!a.recipient.readAt) - Number(!!b.recipient.readAt) ||
          b.updatedAt.localeCompare(a.updatedAt),
      );
    showDialog(
      "Mis comunicaciones",
      `<p class="comm-muted">Avisos, eventos y reuniones dirigidos a tu cuenta. Las publicaciones sin leer aparecen primero.</p>${notifications.length ? `<div class="comm-inbox-list">${notifications.map((p) => `<button type="button" data-inbox-post="${h(p.id)}"><strong>${h(p.title)}</strong><span>${h(p.communityName)} · ${h(date(p.updatedAt))}${!p.recipient.readAt ? " · Sin leer" : ""}</span></button>`).join("")}</div>` : "<p>No tienes comunicaciones recibidas todavía.</p>"}<a href="#comunicacion" id="comm-inbox-board">Abrir tablón de la comunidad</a>`,
    );
    dialog
      .querySelectorAll("[data-inbox-post]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          action(() => openPost(button.dataset.inboxPost), button),
        ),
      );
    $("#comm-inbox-board").addEventListener("click", () => dialog.close());
  });
});
document.addEventListener("keydown", (e) => {
  const tabs = e.target.closest(".comm-tabs");
  if (!tabs || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
    return;
  const buttons = [...tabs.querySelectorAll('[role="tab"]')];
  const index = buttons.indexOf(e.target);
  if (index < 0) return;
  e.preventDefault();
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? buttons.length - 1
        : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
          buttons.length;
  buttons[next].click();
  buttons[next].focus();
});

function input(name, label, value = "", type = "text", extra = "") {
  // Los campos sin «required» se anuncian como opcionales.
  const marcado = /\brequired\b/.test(extra) ? label : `${label} (opcional)`;
  return `<label>${h(marcado)}<input name="${name}" type="${type}" value="${h(value)}" ${extra}></label>`;
}
function check(name, label, value = false) {
  return `<label class="comm-check"><input name="${name}" type="checkbox" ${value ? "checked" : ""}>${h(label)}</label>`;
}
function options(items, selected) {
  return items
    .map(
      ([id, label]) =>
        `<option value="${h(id)}" ${id === selected ? "selected" : ""}>${h(label)}</option>`,
    )
    .join("");
}
function taskRow(t = {}) {
  return `<div class="comm-task-row">${input("taskTitle", "Acuerdo o tarea", t.title || "", "text", 'maxlength="300"')}${input("taskResponsible", "Responsable", t.responsible || "", "text", 'maxlength="180"')}${input("taskDue", "Vencimiento", local(t.dueAt), "datetime-local")}${check("taskDone", "Realizada", t.done)}<button type="button" class="secondary-button" data-remove-task>Quitar</button></div>`;
}
function openEditor(post = null) {
  editorPost = post;
  editorStep = 0;
  editorSnapshot = "";
  const communityId =
    post?.communityId ||
    $("#comm-community").value ||
    metadata.communities.find((c) => c.canManage)?.id;
  showDialog(
    post ? "Editar publicación" : "Nueva publicación",
    `<form id="comm-editor" novalidate><ol class="comm-steps"><li data-step-label="0">1. Contenido</li><li data-step-label="1">2. Destinatarios</li><li data-step-label="2">3. Revisar y publicar</li></ol>
    <div data-editor-step="0"><div class="comm-form-grid"><label>Comunidad<select name="communityId" ${post ? "disabled" : ""}>${options(
      metadata.communities
        .filter((c) => c.canManage)
        .map((c) => [c.id, c.name]),
      communityId,
    )}</select></label><label>Tipo<select name="type">${options(Object.entries(types), post?.type || "notice")}</select></label>${input("title", "Título *", post?.title || "", "text", 'required maxlength="180"')}<label>Prioridad<select name="priority">${options(
      [
        ["normal", "Normal"],
        ["important", "Importante"],
        ["urgent", "Urgente"],
      ],
      post?.priority || "normal",
    )}</select></label></div><label>Contenido *<textarea name="body" required maxlength="20000" rows="5">${h(post?.body || "")}</textarea></label><div class="comm-form-grid">${input("publishAt", "Publicar a partir de *", local(post?.publishAt || new Date().toISOString()), "datetime-local", "required")}${input("startsAt", "Inicio del evento", local(post?.startsAt), "datetime-local")}${input("endsAt", "Fin del evento", local(post?.endsAt), "datetime-local")}${input("archiveAt", "Archivar a partir de", local(post?.archiveAt), "datetime-local")}${input("reminderMinutes", "Recordatorio: minutos antes del inicio", post?.reminderMinutes || 0, "number", 'min="0" max="43200"')}</div><p class="comm-muted">La fecha de publicación es independiente del horario del evento. Un aviso puede quedar vigente sin fecha de archivo.</p><div class="comm-actions">${check("pinned", "Fijar en el tablón", post?.pinned)}${check("commentsEnabled", "Permitir comentarios", post?.commentsEnabled ?? true)}${check("receiptRequired", "Solicitar confirmación de recepción", post?.receiptRequired)}</div>
    <fieldset id="comm-meeting-fields"><legend>Datos de la reunión</legend><div class="comm-form-grid">${input("meetingLocation", "Lugar", post?.meeting?.location || "")}${input("meetingUrl", "Enlace de videollamada HTTPS", post?.meeting?.url || "", "url")}</div><label>Orden del día *<textarea name="meetingAgenda" rows="4" maxlength="10000">${h(post?.meeting?.agenda || "")}</textarea></label><h3>Acuerdos y tareas</h3><div id="comm-tasks">${(post?.meeting?.tasks || []).map(taskRow).join("")}</div><button type="button" class="secondary-button" id="comm-add-task">Agregar acuerdo o tarea</button><p class="comm-muted">El acta y los adjuntos se suben desde el detalle después de guardar.</p></fieldset>
    <fieldset><legend>Participación</legend>${check("hasPoll", "Incluir una encuesta o votación", !!post?.poll)}<div id="comm-poll-fields"><div class="comm-form-grid"><label>Tipo de consulta<select name="pollType">${options(
      [
        ["survey", "Encuesta"],
        ["vote", "Votación"],
      ],
      post?.poll?.type || "survey",
    )}</select></label><label>Quién puede responder<select name="pollElectorate">${options(
      [
        ["recipients", "Todos los destinatarios"],
        ["owners", "Solo propietarios destinatarios"],
      ],
      post?.poll?.electorate || "recipients",
    )}</select></label></div>${input("pollQuestion", "Pregunta", post?.poll?.question || "", "text", 'maxlength="500"')}<label>Opciones (una por línea, entre 2 y 12)<textarea name="pollOptions" rows="4">${h(post?.poll?.options.join("\n") || "")}</textarea></label>${input("pollClosesAt", "Cierre de la consulta", local(post?.poll?.closesAt), "datetime-local")}<div class="comm-actions">${check("pollMultiple", "Permitir varias opciones", post?.poll?.multiple)}${check("pollResultsLive", "Mostrar resultados antes del cierre", post?.poll?.resultsLive)}${check("pollClosed", "Cerrar manualmente la consulta", post?.poll?.closed)}</div><p class="comm-muted">Una respuesta por cuenta, sin ponderación por coeficiente. Los resultados no muestran la identidad de quienes votaron. La pregunta, las opciones y el electorado quedan fijados al publicar.</p></div></fieldset></div>
    <div data-editor-step="1" hidden><label>Destinatarios<select name="audienceMode">${options(Object.entries(audienceLabels), post?.audience.mode || "all")}</select></label><div id="comm-audience-selectors"></div><fieldset><legend>Canales de aviso</legend><p>El aviso dentro de la app siempre está incluido.</p><div class="comm-actions">${check("channelEmail", "Correo electrónico", post?.channels.includes("email"))}${check("channelSms", "SMS", post?.channels.includes("sms"))}${check("channelWhatsapp", "WhatsApp", post?.channels.includes("whatsapp"))}</div><p class="comm-muted">Los canales externos requieren proveedor habilitado y consentimiento del destinatario en «Mis canales».</p></fieldset></div>
    <div data-editor-step="2" hidden><div id="comm-preview" aria-live="polite"></div><label>Estado al guardar<select name="status">${options([["draft", "Guardar borrador"], ["published", "Publicar o programar"], ...(post && post.status !== "draft" ? [["cancelled", "Cancelar publicación"]] : [])], post?.status || "draft")}</select></label><p class="comm-muted">Las fechas futuras quedan programadas. Los envíos se procesan mientras el servidor está encendido.</p></div>
    <div class="comm-dialog-footer"><button type="button" class="secondary-button" id="comm-prev">Anterior</button><button type="button" class="primary-button" id="comm-next">Siguiente</button><button type="submit" class="primary-button" id="comm-save" hidden>Guardar publicación</button></div></form>`,
  );
  const form = $("#comm-editor");
  form.elements.communityId.addEventListener("change", () =>
    audienceSelectors(),
  );
  form.elements.audienceMode.addEventListener("change", toggleEditorFields);
  for (const name of ["type", "hasPoll"])
    form.elements[name].addEventListener("change", toggleEditorFields);
  form.elements.pollType.addEventListener("change", () => {
    if (!post)
      form.elements.pollElectorate.value =
        form.elements.pollType.value === "vote" ? "owners" : "recipients";
  });
  $("#comm-add-task").addEventListener("click", () =>
    $("#comm-tasks").insertAdjacentHTML("beforeend", taskRow()),
  );
  $("#comm-tasks").addEventListener("click", (e) =>
    e.target.closest("[data-remove-task]")?.closest(".comm-task-row").remove(),
  );
  audienceSelectors(post?.audience);
  if (post?.distributed) {
    form.elements.status.querySelector('option[value="draft"]').remove();
    for (const name of [
      "type",
      "publishAt",
      "audienceMode",
      "hasPoll",
      "pollType",
      "pollElectorate",
      "pollQuestion",
      "pollOptions",
      "pollClosesAt",
      "pollMultiple",
      "pollResultsLive",
    ])
      form.elements[name].disabled = true;
    form.querySelectorAll("[data-audience-list] input").forEach((el) => {
      el.disabled = true;
    });
  }
  toggleEditorFields();
  showStep(0);
  $("#comm-prev").addEventListener("click", () => showStep(editorStep - 1));
  $("#comm-next").addEventListener("click", (e) =>
    action(async () => {
      if (!validateEditorStep()) return;
      if (editorStep === 1) {
        const preview = await request("/preview", "POST", editorData());
        renderPreview(preview);
      }
      showStep(editorStep + 1);
    }, e.currentTarget),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      if (!validateEditorStep()) return;
      const payload = editorData();
      const result = await request(
        post ? `/posts/${post.id}` : "/posts",
        post ? "PUT" : "POST",
        payload,
      );
      editorSnapshot = "";
      editorPost = null;
      await refreshCommunication();
      await openPost(result.id);
      toast(
        payload.status === "draft"
          ? "Borrador guardado."
          : "Publicación guardada.",
      );
    }, $("#comm-save"));
  });
  editorSnapshot = JSON.stringify(editorData());
}
function audienceSelectors(
  a = { ownerIds: [], tenantIds: [], propertyIds: [] },
) {
  const selector = metadata.selectors.find(
    (s) => s.communityId === $("#comm-editor").elements.communityId.value,
  );
  $("#comm-audience-selectors").innerHTML = `<div class="comm-form-grid">${[
    ["ownerIds", "Propietarios", selector?.owners || []],
    ["tenantIds", "Inquilinos", selector?.tenants || []],
    [
      "propertyIds",
      "Inmuebles (propietarios e inquilinos)",
      selector?.properties || [],
    ],
  ]
    .map(
      ([key, label, rows]) =>
        `<fieldset data-audience-list="${key}"><legend>${label}</legend><div class="comm-selector-list">${rows.length ? rows.map((r) => `<label class="comm-check"><input type="checkbox" value="${h(r.id)}" ${a[key]?.includes(r.id) ? "checked" : ""}>${h(r.name)}${r.linked === false ? " · Sin cuenta" : ""}</label>`).join("") : '<p class="comm-muted">No hay registros.</p>'}</div></fieldset>`,
    )
    .join("")}</div>`;
  toggleEditorFields();
}
function toggleEditorFields() {
  const f = $("#comm-editor");
  if (!f) return;
  const meeting = f.elements.type.value === "meeting",
    event = f.elements.type.value !== "notice";
  $("#comm-meeting-fields").hidden = !meeting;
  f.elements.startsAt.required = event;
  f.elements.endsAt.required = event;
  f.elements.meetingAgenda.required = meeting;
  $("#comm-poll-fields").hidden = !f.elements.hasPoll.checked;
  for (const name of ["pollQuestion", "pollOptions", "pollClosesAt"])
    f.elements[name].required = f.elements.hasPoll.checked;
  $("#comm-audience-selectors").hidden =
    f.elements.audienceMode.value !== "selected";
}
function showStep(step) {
  editorStep = Math.max(0, Math.min(2, step));
  dialog.querySelectorAll("[data-editor-step]").forEach((el) => {
    el.hidden = Number(el.dataset.editorStep) !== editorStep;
  });
  dialog.querySelectorAll("[data-step-label]").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.stepLabel) === editorStep);
  });
  $("#comm-prev").hidden = editorStep === 0;
  $("#comm-next").hidden = editorStep === 2;
  $("#comm-save").hidden = editorStep !== 2;
  $("#comm-error").textContent = "";
}
function validateEditorStep() {
  const controls = dialog
    .querySelector(`[data-editor-step="${editorStep}"]`)
    .querySelectorAll("input,textarea,select");
  for (const el of controls) {
    if (el.disabled || el.offsetParent === null || el.checkValidity()) continue;
    const campo = document.querySelector("#comm-error");
    if (campo)
      campo.textContent = `${fieldLabel(el)}: ${mensajeDeValidez(el)}.`;
    return false;
  }
  return true;
}
function editorData() {
  const f = $("#comm-editor");
  if (!f) return {};
  const value = (name) => f.elements[name].value,
    checked = (name) => f.elements[name].checked;
  const a = { mode: value("audienceMode") };
  for (const key of ["ownerIds", "tenantIds", "propertyIds"])
    a[key] = [
      ...f.querySelectorAll(`[data-audience-list="${key}"] input:checked`),
    ].map((el) => el.value);
  return {
    ...(editorPost ? { id: editorPost.id, version: editorPost.version } : {}),
    communityId: value("communityId"),
    type: value("type"),
    title: value("title"),
    body: value("body"),
    priority: value("priority"),
    status: value("status"),
    publishAt: editorPost?.distributed
      ? editorPost.publishAt
      : iso(value("publishAt")),
    startsAt: iso(value("startsAt")),
    endsAt: iso(value("endsAt")),
    archiveAt: iso(value("archiveAt")),
    reminderMinutes: Number(value("reminderMinutes")),
    pinned: checked("pinned"),
    commentsEnabled: checked("commentsEnabled"),
    receiptRequired: checked("receiptRequired"),
    audience: editorPost?.distributed ? editorPost.audience : a,
    channels: [
      ...[
        checked("channelEmail") ? "email" : "",
        checked("channelSms") ? "sms" : "",
        checked("channelWhatsapp") ? "whatsapp" : "",
      ],
    ].filter(Boolean),
    meeting:
      value("type") === "meeting"
        ? {
            location: value("meetingLocation"),
            url: value("meetingUrl"),
            agenda: value("meetingAgenda"),
            tasks: [...f.querySelectorAll(".comm-task-row")].map((row) => ({
              title: row.querySelector('[name="taskTitle"]').value,
              responsible: row.querySelector('[name="taskResponsible"]').value,
              dueAt: iso(row.querySelector('[name="taskDue"]').value),
              done: row.querySelector('[name="taskDone"]').checked,
            })),
          }
        : null,
    poll: editorPost?.distributed
      ? editorPost.poll
        ? { ...editorPost.poll, closed: checked("pollClosed") }
        : null
      : checked("hasPoll")
        ? {
            type: value("pollType"),
            question: value("pollQuestion"),
            options: value("pollOptions")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
            closesAt: iso(value("pollClosesAt")),
            electorate: value("pollElectorate"),
            multiple: checked("pollMultiple"),
            resultsLive: checked("pollResultsLive"),
            closed: checked("pollClosed"),
          }
        : null,
  };
}
function renderPreview(preview) {
  $("#comm-preview").innerHTML =
    `<h3>Revisión de destinatarios</h3><p><strong>${preview.recipients.length} cuentas</strong> recibirán el aviso dentro de la app.</p><p>${preview.recipients.map((r) => h(r.name)).join(", ") || "No hay cuentas vinculadas para esta selección."}</p>${preview.unlinked.length ? `<p class="comm-warning">${preview.unlinked.length} perfiles sin cuenta activa vinculada: ${preview.unlinked.map((r) => h(r.name)).join(", ")}. No recibirán avisos.</p>` : ""}${Object.entries(
      preview.channels,
    )
      .map(
        ([channel, c]) =>
          `<p>${h(channel)}: ${c.enabled ? `${c.optedIn} destinatarios lo habilitaron` : "proveedor desactivado; el envío externo quedará omitido"}.</p>`,
      )
      .join("")}`;
}

async function openPost(id, tab = "publication") {
  const p = await request(`/posts/${id}`);
  editorSnapshot = "";
  editorPost = null;
  detailTab = tab;
  if (p.recipient && !p.recipient.readAt) {
    await request(`/posts/${id}/read`, "POST", {});
    p.recipient.readAt = new Date().toISOString();
    const item = posts.find((x) => x.id === id);
    if (item?.recipient) item.recipient.readAt = p.recipient.readAt;
    updateBadge();
    draw();
  }
  const tabs = [
    ["publication", "Publicación"],
    ...(p.type === "meeting" ? [["meeting", "Reunión y acta"]] : []),
    ["participation", "Participación"],
    ...(p.canManage ? [["tracking", "Seguimiento"]] : []),
  ];
  showDialog(
    p.title,
    `<div class="comm-detail-meta"><span class="comm-tag comm-tag-type">${h(types[p.type])}</span><span class="comm-tag comm-tag-phase comm-tag-phase-${p.phase}">${h(phases[p.phase])}</span><span class="comm-tag comm-tag-comunidad">${h(p.communityName)}</span>${p.canManage ? '<button type="button" class="secondary-button" data-edit-post>Editar publicación</button>' : ""}</div><div class="comm-tabs" id="comm-detail-tabs" role="tablist" aria-label="Detalle de publicación">${tabs.map(([id, label]) => `<button type="button" role="tab" data-detail-tab="${id}" aria-selected="${detailTab === id}">${label}</button>`).join("")}</div>
    <div data-detail-panel="publication" ${detailTab !== "publication" ? "hidden" : ""}><p class="comm-body-text">${h(p.body)}</p><dl class="comm-detail-dates"><div><dt>Publicación</dt><dd>${h(date(p.publishAt))}</dd></div>${p.startsAt ? `<div><dt>Inicio</dt><dd>${h(date(p.startsAt))}</dd></div><div><dt>Fin</dt><dd>${h(date(p.endsAt))}</dd></div>` : ""}<div><dt>Destinatarios</dt><dd>${h(audienceLabels[p.audience.mode])}</dd></div>${p.archiveAt ? `<div><dt>Archivo</dt><dd>${h(date(p.archiveAt))}</dd></div>` : ""}</dl>${p.receiptRequired && p.recipient ? `<div class="comm-callout">${p.recipient.receiptAt ? `Confirmaste la recepción el ${h(date(p.recipient.receiptAt))}.` : '<p>Se solicita que confirmes la recepción de esta publicación.</p><button type="button" class="primary-button" data-receipt>Confirmar recepción</button>'}</div>` : ""}<h3>Documentos adjuntos</h3>${filesView(p, "attachment")}${p.canManage ? uploadForm("attachment") : ""}</div>
    ${p.type === "meeting" ? `<div data-detail-panel="meeting" ${detailTab !== "meeting" ? "hidden" : ""}>${meetingView(p)}</div>` : ""}
    <div data-detail-panel="participation" ${detailTab !== "participation" ? "hidden" : ""}>${participationView(p)}</div>
    ${p.canManage ? `<div data-detail-panel="tracking" ${detailTab !== "tracking" ? "hidden" : ""}>${trackingView(p)}</div>` : ""}`,
  );
  $("#comm-detail-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-detail-tab]");
    if (!b) return;
    detailTab = b.dataset.detailTab;
    dialog
      .querySelectorAll("[data-detail-tab]")
      .forEach((el) => el.setAttribute("aria-selected", String(el === b)));
    dialog.querySelectorAll("[data-detail-panel]").forEach((el) => {
      el.hidden = el.dataset.detailPanel !== detailTab;
    });
  });
  dialog
    .querySelector("[data-edit-post]")
    ?.addEventListener("click", () => openEditor(p));
  if (["cancelled", "archived"].includes(p.phase)) {
    const receipt = dialog.querySelector("[data-receipt]");
    if (receipt) {
      receipt.disabled = true;
      receipt.textContent = "La recepción está cerrada";
    }
  }
  if (
    ["cancelled", "archived"].includes(p.phase) ||
    Date.now() >= Date.parse(p.endsAt)
  ) {
    dialog.querySelectorAll("[data-rsvp]").forEach((button) => {
      button.disabled = true;
      button.title = "La reunión ya no admite confirmaciones.";
    });
  }
  dialog.querySelector("[data-receipt]")?.addEventListener("click", (e) =>
    action(async () => {
      await request(`/posts/${p.id}/receipt`, "POST", {});
      await openPost(p.id, detailTab);
    }, e.currentTarget),
  );
  dialog.querySelector("#comm-ballot")?.addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      const choices = [
        ...e.target.querySelectorAll('[name="choice"]:checked'),
      ].map((el) => Number(el.value));
      if (!choices.length) throw new Error("Elige al menos una opción.");
      if (
        !window.confirm(
          "¿Confirmás tu respuesta? Una vez enviada no se puede cambiar.",
        )
      )
        return;
      await request(`/posts/${p.id}/ballot`, "POST", { choices });
      await openPost(p.id, "participation");
    }, e.submitter);
  });
  dialog.querySelector("#comm-comment")?.addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      await request(`/posts/${p.id}/comments`, "POST", {
        body: e.target.elements.comment.value,
      });
      await openPost(p.id, "participation");
    }, e.submitter);
  });
  dialog.querySelectorAll("[data-delete-comment]").forEach((b) =>
    b.addEventListener("click", () =>
      action(async () => {
        if (!window.confirm("¿Eliminar este comentario?")) return;
        await request(
          `/posts/${p.id}/comments/${b.dataset.deleteComment}`,
          "DELETE",
        );
        await openPost(p.id, "participation");
      }, b),
    ),
  );
  dialog.querySelectorAll("[data-rsvp]").forEach((b) =>
    b.addEventListener("click", () =>
      action(async () => {
        await request(`/posts/${p.id}/rsvp`, "POST", { rsvp: b.dataset.rsvp });
        await openPost(p.id, "meeting");
      }, b),
    ),
  );
  dialog.querySelectorAll("[data-attendance]").forEach((el) =>
    el.addEventListener("change", () =>
      action(async () => {
        await request(`/posts/${p.id}/attendance`, "POST", {
          userId: el.dataset.attendance,
          attended: el.checked,
        });
        await openPost(p.id, "meeting");
      }, el),
    ),
  );
  dialog.querySelectorAll("[data-upload-form]").forEach((form) =>
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      action(async () => {
        const file = form.elements.file.files[0];
        if (!file) throw new Error("Selecciona un archivo.");
        if (file.size > 10 * 1024 * 1024)
          throw new Error("El archivo supera los 10 MB.");
        const payload = new FormData();
        payload.append("kind", form.dataset.uploadForm);
        payload.append("file", file);
        await request(`/posts/${p.id}/files`, "POST", payload);
        await openPost(p.id, detailTab);
      }, e.submitter);
    }),
  );
  dialog.querySelectorAll("[data-publish-minutes]").forEach((b) =>
    b.addEventListener("click", () =>
      action(async () => {
        if (
          !window.confirm(
            "¿Publicar esta versión del acta y avisar a los destinatarios? Se conservará en el historial.",
          )
        )
          return;
        await request(
          `/posts/${p.id}/files/${b.dataset.publishMinutes}/final`,
          "POST",
          {},
        );
        await refreshCommunication();
        await openPost(p.id, "meeting");
      }, b),
    ),
  );
  dialog.querySelectorAll("[data-delete-file]").forEach((b) =>
    b.addEventListener("click", () =>
      action(async () => {
        if (!window.confirm("¿Eliminar este documento?")) return;
        await request(`/posts/${p.id}/files/${b.dataset.deleteFile}`, "DELETE");
        await openPost(p.id, detailTab);
      }, b),
    ),
  );
  dialog
    .querySelector("[data-retry-deliveries]")
    ?.addEventListener("click", (e) =>
      action(async () => {
        if (
          !window.confirm(
            "Los envíos con respuesta incierta podrían haber llegado. Revisa el panel del proveedor antes de reintentar. ¿Reintentar los envíos fallidos, omitidos o inciertos?",
          )
        )
          return;
        const result = await request(`/posts/${p.id}/retry`, "POST", {});
        toast(`${result.retried} envíos pendientes de reintento.`);
        await openPost(p.id, "tracking");
      }, e.currentTarget),
    );
}
function uploadForm(kind) {
  return `<form data-upload-form="${kind}" class="comm-upload"><label>${kind === "minutes" ? "Subir una nueva versión del acta (borrador)" : "Adjuntar documento"}<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required></label><button class="secondary-button" type="submit">Subir archivo</button><small class="comm-muted">PDF, JPG o PNG · Hasta 10 MB por archivo.</small></form>`;
}
function filesView(p, kind) {
  const files = p.files.filter((f) => f.kind === kind);
  return files.length
    ? `<ul class="comm-file-list">${files.map((f) => `<li><div><a href="/api/communications/posts/${encodeURIComponent(p.id)}/files/${encodeURIComponent(f.id)}" download>${h(f.name)}</a><small>${h(date(f.createdAt))} · ${Math.ceil(f.size / 1024)} KB${kind === "minutes" ? ` · ${f.final ? "Publicada" : "Borrador"}` : ""}</small></div>${p.canManage && !f.final ? `<div class="comm-actions">${kind === "minutes" ? `<button type="button" class="secondary-button" data-publish-minutes="${h(f.id)}">Publicar acta</button>` : ""}<button type="button" class="secondary-button" data-delete-file="${h(f.id)}">Eliminar</button></div>` : ""}</li>`).join("")}</ul>`
    : `<p class="comm-muted">${kind === "minutes" ? "Todavía no hay actas disponibles." : "No hay documentos adjuntos."}</p>`;
}
function meetingView(p) {
  const rsvp = {
    pending: "Pendiente",
    accepted: "Asistiré",
    declined: "No asistiré",
  };
  return `<p><strong>Lugar:</strong> ${h(p.meeting.location || "Reunión en línea")}</p>${p.meeting.url ? `<p><a href="${h(p.meeting.url)}" target="_blank" rel="noopener noreferrer">Abrir videollamada</a></p>` : ""}<h3>Orden del día</h3><p class="comm-body-text">${h(p.meeting.agenda)}</p>${p.recipient && puedeParticipar(p) ? `<div class="comm-callout"><h3>Tu participación: ${rsvp[p.recipient.rsvp]}</h3><div class="comm-actions"><button type="button" class="secondary-button" data-rsvp="accepted">Asistiré</button><button type="button" class="secondary-button" data-rsvp="declined">No asistiré</button><button type="button" class="secondary-button" data-rsvp="pending">Decidir después</button></div></div>` : ""}${p.canManage ? `<h3>Participantes y asistencia real</h3><p class="comm-muted">La invitación y la asistencia registrada se conservan por separado.</p><ul class="comm-participants">${p.recipients.map((r) => `<li><span>${h(r.name)} · ${rsvp[r.rsvp]}</span><label class="comm-check"><input type="checkbox" data-attendance="${h(r.userId)}" ${r.attended ? "checked" : ""}>Asistió</label></li>`).join("") || "<li>No hay cuentas invitadas todavía.</li>"}</ul>` : ""}<h3>Acuerdos y tareas</h3>${p.meeting.tasks.length ? `<ul class="comm-tasks">${p.meeting.tasks.map((t) => `<li><strong>${t.done ? "Realizada" : "Pendiente"} · ${h(t.title)}</strong><span>${h(t.responsible || "Sin responsable")}${t.dueAt ? ` · ${h(date(t.dueAt))}` : ""}</span></li>`).join("")}</ul>` : '<p class="comm-muted">Todavía no se registraron acuerdos o tareas.</p>'}<h3>Actas y versiones</h3>${filesView(p, "minutes")}${p.canManage ? uploadForm("minutes") : ""}`;
}
/** La parte social (comentar/votar/confirmar) se controla con
 * el permiso comm:participacion de cada rol. */
function puedeParticipar(p) {
  return hasPermission("comm:participacion", p.communityId);
}

function participationView(p) {
  const interactive = !["draft", "scheduled", "cancelled", "archived"].includes(
    p.phase,
  );
  // La parte social (encuestas y comentarios con nombre) se controla con el
  // permiso comm:participacion; sin él la publicación es solo informativa.
  const participa = puedeParticipar(p);
  let poll = "";
  if (p.poll) {
    poll = `<section class="comm-poll"><p class="eyebrow">${p.poll.type === "vote" ? "VOTACIÓN" : "ENCUESTA"}</p><h3>${h(p.poll.question)}</h3><p class="comm-muted">Cierre: ${h(date(p.poll.closesAt))} · ${p.poll.electorate === "owners" ? "Propietarios destinatarios" : "Todos los destinatarios"} · Una respuesta por cuenta.</p>${p.ballot.length ? `<p class="comm-callout">Tu respuesta quedó registrada: ${p.ballot.map((i) => h(p.poll.options[i])).join(", ")}.</p>` : p.pollOpen && p.canVote ? `<form id="comm-ballot">${p.poll.options.map((o, i) => `<label class="comm-check"><input type="${p.poll.multiple ? "checkbox" : "radio"}" name="choice" value="${i}">${h(o)}</label>`).join("")}<button class="primary-button" type="submit">Confirmar respuesta</button></form>` : `<p>${p.votingSuspended ? "Tu derecho de voto está suspendido en esta comunidad." : p.pollOpen ? "Tu cuenta no pertenece al electorado de esta consulta." : "La consulta no está abierta."}</p>`}${p.pollResults ? `<h4>Resultados · ${p.pollResults.total} respuestas</h4>${p.poll.options.map((o, i) => `<div class="comm-result"><span>${h(o)}</span><progress max="${Math.max(1, p.pollResults.total)}" value="${p.pollResults.counts[i]}"></progress><strong>${p.pollResults.counts[i]}</strong></div>`).join("")}` : '<p class="comm-muted">Los resultados se mostrarán al cerrar la consulta.</p>'}</section>`;
  }
  if (!participa)
    return '<p class="comm-muted">La participación (comentarios y consultas) no está habilitada para tu rol.</p>';
  return `${poll}<h3>Comentarios</h3>${p.comments.length ? `<div class="comm-comments">${p.comments.map((c) => `<article><div class="comm-card-meta"><strong>${h(c.author)}</strong><span>${h(date(c.createdAt))}</span>${c.canDelete ? `<button type="button" class="text-link-button" data-delete-comment="${h(c.id)}">Eliminar</button>` : ""}</div><p class="comm-body-text">${h(c.body)}</p></article>`).join("")}</div>` : '<p class="comm-muted">Todavía no hay comentarios.</p>'}${p.commentsEnabled && interactive ? '<form id="comm-comment"><label>Tu comentario<textarea name="comment" rows="3" required maxlength="3000"></textarea></label><button type="submit" class="primary-button">Publicar comentario</button></form>' : `<p class="comm-muted">${p.commentsEnabled ? "Esta publicación no admite nuevas respuestas por su estado." : "Los comentarios están desactivados."}</p>`}`;
}
function trackingView(p) {
  const states = {
    pending: "Pendiente",
    sending: "Procesando",
    accepted: "Aceptado por el proveedor",
    failed: "Fallido",
    skipped: "Omitido",
    uncertain: "Respuesta incierta",
  };
  const actions = {
    created: "Publicación creada",
    published: "Publicación distribuida",
    updated: "Publicación editada",
    cancelled: "Publicación cancelada",
    "minutes-uploaded": "Borrador de acta subido",
    "minutes-published": "Acta publicada",
    "attachment-uploaded": "Documento adjuntado",
    "attachment-deleted": "Documento eliminado",
    "comment-deleted": "Comentario eliminado",
    "attendance-updated": "Asistencia actualizada",
    "delivery-retry-requested": "Reintento de envío solicitado",
  };
  return `<h3>Lectura y confirmaciones</h3><div class="comm-table-wrap"><table><thead><tr><th>Destinatario</th><th>Primera lectura</th><th>Confirmación</th></tr></thead><tbody>${p.recipients.map((r) => `<tr><td>${h(r.name)}</td><td>${r.readAt ? h(date(r.readAt)) : "Pendiente"}</td><td>${r.receiptAt ? h(date(r.receiptAt)) : p.receiptRequired ? "Pendiente" : "No solicitada"}</td></tr>`).join("") || '<tr><td colspan="3">Todavía no se distribuyó a cuentas activas.</td></tr>'}</tbody></table></div><h3>Envíos externos</h3><p class="comm-muted">«Aceptado» significa que el proveedor recibió la solicitud; no confirma entrega ni lectura. Los avisos dentro de la app son independientes.</p>${p.deliveries.length ? `<div class="comm-table-wrap"><table><thead><tr><th>Destinatario</th><th>Canal</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>${p.deliveries.map((d) => `<tr><td>${h(d.name)}</td><td>${h(d.channel)}</td><td>${h(states[d.state] || d.state)}</td><td>${h(d.error)}</td></tr>`).join("")}</tbody></table></div>${p.deliveries.some((d) => ["failed", "skipped", "uncertain"].includes(d.state)) ? '<button type="button" class="secondary-button" data-retry-deliveries>Reintentar envíos</button>' : ""}` : '<p class="comm-muted">No se solicitaron envíos externos.</p>'}<h3>Historial de cambios</h3><ol class="comm-history">${p.history.map((a) => `<li><strong>${h(actions[a.action] || a.action)}</strong><span>${h(a.name)} · ${h(date(a.createdAt))}</span></li>`).join("")}</ol>`;
}

$("#comm-preferences").addEventListener("click", (e) =>
  action(async () => {
    const p = await request("/preferences");
    editorSnapshot = "";
    showDialog(
      "Mis canales de comunicación",
      `<form id="comm-preference-form"><p>Los avisos dentro de la app siempre están disponibles. Elige si también quieres recibirlos por canales externos.</p>${input("email", "Correo electrónico", p.email, "email", 'maxlength="254"')}${input("phone", "Teléfono internacional", p.phone, "tel", 'placeholder="+34600111222" maxlength="16"')}<div class="comm-preference-checks">${check("emailEnabled", "Acepto recibir avisos por correo electrónico", p.emailEnabled)}${check("smsEnabled", "Acepto recibir avisos por SMS", p.smsEnabled)}${check("whatsappEnabled", "Acepto recibir avisos por WhatsApp", p.whatsappEnabled)}</div><p class="comm-muted">Puedes desactivarlos en cualquier momento. El administrador debe tener configurado el proveedor correspondiente.</p><button type="submit" class="primary-button">Guardar preferencias</button></form>`,
    );
    $("#comm-preference-form").addEventListener("submit", (event) => {
      event.preventDefault();
      action(async () => {
        const f = event.target;
        await request("/preferences", "PUT", {
          email: f.elements.email.value,
          phone: f.elements.phone.value,
          emailEnabled: f.elements.emailEnabled.checked,
          smsEnabled: f.elements.smsEnabled.checked,
          whatsappEnabled: f.elements.whatsappEnabled.checked,
        });
        dialog.close();
        toast("Preferencias de comunicación guardadas.");
      }, event.submitter);
    });
  }, e.currentTarget),
);
export async function renderProvidersPanel(container) {
  const config = await request("/providers");
  container.classList.add("proveedores-panel");
  container.innerHTML = `<p class="form-intro">Configuración global de envío. Las credenciales guardadas no se muestran; deja el campo vacío para conservarlas. Si tu proveedor rechaza las llamadas por restricción de IP, autoriza la IP pública del servidor donde se ejecuta la aplicación en el panel del proveedor (Brevo → Seguridad → Direcciones IP autorizadas) (en desarrollo, la IP pública de tu conexión; «localhost» no es una IP válida ahí).</p><form id="comm-provider-form" autocomplete="off"><section class="proveedor-card"><h3 class="proveedor-titulo">📧 Correo electrónico</h3><p class="proveedor-desc">Configura el envío de correos con tu proveedor: por API (solo la API key) o mediante un servidor SMTP propio.</p>${check("smtpEnabled", "Habilitar correo electrónico", config.smtp.enabled)}<label class="proveedor-campo">Modo de envío<select name="smtpProvider"><option value="brevo" ${config.smtp.provider === "brevo" ? "selected" : ""}>API del proveedor (solo API key)</option><option value="smtp" ${config.smtp.provider !== "brevo" ? "selected" : ""}>SMTP propio</option></select></label><div class="form-grid"><div data-smtp-relay>${input("smtpHost", "Servidor SMTP", config.smtp.host)}</div><div data-smtp-relay>${input("smtpPort", "Puerto", config.smtp.port, "number", 'min="1" max="65535" required')}</div><div data-smtp-relay>${input("smtpUser", "Usuario", config.smtp.user)}</div>${input("smtpPassword", config.smtp.hasSecret ? "Credencial (ya guardada)" : "API key o contraseña del proveedor", "", "password", 'autocomplete="new-password" maxlength="1000"')}${input("smtpFrom", "Correo electrónico del remitente", config.smtp.from, "email")}${input("smtpFromName", "Nombre del remitente", config.smtp.fromName)}</div>${check("smtpSecure", "TLS desde el inicio (solo SMTP genérico)", config.smtp.secure)}${check("smtpClear", "Eliminar la contraseña/API key guardada")}</section>${["sms", "whatsapp"].map((channel) => `<section class="proveedor-card"><h3 class="proveedor-titulo">${channel === "sms" ? "💬 SMS" : "🟢 WhatsApp"}</h3><p class="proveedor-desc">${channel === "sms" ? "Envío de mensajes de texto con tu proveedor de mensajería." : "Envío de mensajes de WhatsApp con tu proveedor. Según el proveedor puede requerirse una plantilla aprobada para el primer mensaje."}</p>${check(`${channel}Enabled`, `Habilitar ${channel === "sms" ? "SMS" : "WhatsApp"}`, config[channel].enabled)}<label class="proveedor-campo">Proveedor<select name="${channel}Provider">${channel === "sms" ? '<option value="twilio">Twilio</option><option value="brevo">Brevo</option>' : '<option value="twilio">Twilio</option><option value="brevo">Brevo</option>'}</select></label><div class="form-grid"><div data-twilio-sid>${input(`${channel}Sid`, "Account SID", config[channel].accountSid)}</div>${input(`${channel}Token`, config[channel].hasSecret ? "API key / Auth Token (ya guardado)" : "API key o Auth Token", "", "password", 'autocomplete="new-password" maxlength="1000"')}${input(`${channel}From`, channel === "sms" ? "Número o remitente emisor" : "Número de WhatsApp emisor (con código de país)", config[channel].from, "tel", 'placeholder="+34600111222"')}${channel === "whatsapp" ? input("whatsappContentSid", "Content SID o ID de plantilla", config.whatsapp.contentSid) : ""}</div>${check(`${channel}Clear`, "Eliminar la API key guardada")}</section>`).join("")}<div class="proveedor-acciones"><button type="submit" class="primary-button">Guardar proveedores</button></div></form><section class="proveedor-card"><h3 class="proveedor-titulo">🧪 Enviar un mensaje de prueba</h3><p class="proveedor-desc">Guarda la configuración antes de probar. Este botón envía un mensaje real al destino indicado.</p><form id="comm-provider-test"><div class="form-grid"><label>Canal<select name="channel"><option value="email">Correo electrónico</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select></label>${input("to", "Destino de la prueba", "", "text", 'required maxlength="254"')}</div><button type="submit" class="secondary-button">Enviar prueba</button><p id="comm-test-result" role="status"></p></form></section>`;
  // Modo de envío por canal: muestra/oculta campos y Habilitar habilita/deshabilita
  const smtpProviderSelect = container.querySelector('[name="smtpProvider"]');
  const smsProviderSelect = container.querySelector('[name="smsProvider"]');
  function aplicarModoProveedor() {
    const brevoMail = smtpProviderSelect?.value === "brevo";
    container.querySelectorAll("[data-smtp-relay]").forEach((d) => {
      d.hidden = brevoMail;
    });
    container.querySelectorAll("[data-twilio-sid]").forEach((d) => {
      d.hidden = smsProviderSelect?.value === "brevo";
    });
    const passLabel = [...container.querySelectorAll("label")].find((l) =>
      l.querySelector('[name="smtpPassword"]'),
    );
    if (passLabel && passLabel.childNodes[0]) {
      passLabel.childNodes[0].textContent = brevoMail
        ? config.smtp.hasSecret
          ? "Credencial (ya guardada)"
          : "API key de Brevo"
        : config.smtp.hasSecret
          ? "Contraseña (ya guardada)"
          : "Contraseña SMTP";
    }
  }
  smtpProviderSelect?.addEventListener("change", aplicarModoProveedor);
  smsProviderSelect?.addEventListener("change", aplicarModoProveedor);
  function aplicarEstadoCampos() {
    container.querySelectorAll("section.proveedor-card").forEach((card) => {
      const toggle = card.querySelector('input[name$="Enabled"]');
      if (!toggle) return;
      card.querySelectorAll("input, select").forEach((el) => {
        if (el === toggle) return;
        el.disabled = !toggle.checked;
      });
    });
  }
  container
    .querySelectorAll('input[name$="Enabled"]')
    .forEach((chk) => chk.addEventListener("change", aplicarEstadoCampos));
  aplicarModoProveedor();
  aplicarEstadoCampos();
  $("#comm-provider-form").addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      const f = e.target,
        value = (name) => f.elements[name].value,
        checked = (name) => f.elements[name].checked;
      const payload = {
        smtp: {
          enabled: checked("smtpEnabled"),
          provider: value("smtpProvider") || "smtp",
          host: value("smtpHost"),
          port: Number(value("smtpPort")),
          secure: checked("smtpSecure"),
          user: value("smtpUser"),
          password: value("smtpPassword"),
          from: value("smtpFrom"),
          fromName: value("smtpFromName"),
          clearSecret: checked("smtpClear"),
        },
      };
      for (const c of ["sms", "whatsapp"])
        payload[c] = {
          enabled: checked(`${c}Enabled`),
          provider: value(`${c}Provider`),
          accountSid: value(`${c}Sid`),
          token: value(`${c}Token`),
          from: value(`${c}From`),
          clearSecret: checked(`${c}Clear`),
          ...(c === "whatsapp"
            ? { contentSid: value("whatsappContentSid") }
            : {}),
        };
      await request("/providers", "PUT", payload);
      await renderProvidersPanel(container);
      toast("Proveedores guardados. Las credenciales se almacenan cifradas.");
    }, e.submitter);
  });
  $("#comm-provider-test").addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      const result = await request("/providers/test", "POST", {
        channel: e.target.elements.channel.value,
        to: e.target.elements.to.value,
      });
      $("#comm-test-result").textContent = result.message;
    }, e.submitter);
  });
}
