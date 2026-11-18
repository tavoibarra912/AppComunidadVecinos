import { api } from "../api.js";
import { state, refreshState, hasPermission } from "../state.js";
import { toast } from "../utils.js";

const WIZARD_ICONS = {
  close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  back: '<path d="M19 12H5m7 7-7-7 7-7"/>',
  next: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
  execute: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h12M13 6v3M5 6v14a1 1 0 0 0 1 1h4M7 6V4h4v2"/><path d="M8 10v7"/><path d="M15 12h7M17 10v4M12 18h10M19 16v4"/></svg>`,
};
function wizardIcon(button, label, kind) {
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML =
    kind === "execute"
      ? WIZARD_ICONS.execute
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${WIZARD_ICONS[kind]}</svg>`;
}
const LABELS = {
  keep: "Conservar",
  orphan: "Dejar inmueble sin este vínculo",
  reassign_owner: "Reasignar titularidad",
  delete_property: "Eliminar inmueble",
  reassign_community: "Trasladar a otra comunidad",
  create_temp_community: "Trasladar a comunidad temporal nueva",
  delete_owner: "Eliminar propietario globalmente",
  reassign_tenant: "Mover a otro inmueble",
  orphan_tenant: "Desvincular inmueble y titular",
  remove_tenant: "Eliminar perfil de inquilino",
  end_contract: "Finalizar contrato y desvincular",
  keep_historical: "Conservar histórico",
  liquidate_final: "Liquidación final: anular recibos y liberar cobros como saldo a favor",
  delete: "Eliminar definitivamente",
  unlink: "Conservar cuenta de acceso",
  delete_user: "Eliminar cuenta si no tiene otros perfiles",
};
const STEPS = ["Selección", "Dependencias", "Opciones", "Resumen", "Resultado"];
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function list(parent, items) {
  if (!items.length) return;
  const ul = element("ul");
  for (const text of items) ul.append(element("li", text));
  parent.append(ul);
}
function select(parent, title, value, options, onChange) {
  const label = element("label", undefined, "cascade-field");
  label.append(element("span", title));
  const input = element("select");
  for (const option of options) {
    const [key, text] = Array.isArray(option) ? option : [option, LABELS[option]];
    const node = element("option", text);
    node.value = key;
    input.append(node);
  }
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  label.append(input);
  parent.append(label);
  return input;
}
function checkbox(parent, text, checked, onChange) {
  const label = element("label", undefined, "cascade-check");
  const input = element("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  label.append(input, element("span", text));
  parent.append(label);
  return input;
}
function textInput(parent, title, value, onChange) {
  const label = element("label", undefined, "cascade-field");
  label.append(element("span", title));
  const input = element("input");
  input.value = value;
  input.required = true;
  input.addEventListener("input", () => onChange(input.value));
  label.append(input);
  parent.append(label);
}

export async function openCascadeWizard(collection, id) {
  if (!hasPermission("cascade-delete", id)) {
    toast("No tienes permiso de borrado avanzado.");
    return;
  }
  if (document.querySelector("#cascade-wizard")) return;
  const dialog = element("dialog", undefined, "cascade-wizard");
  dialog.id = "cascade-wizard";
  dialog.setAttribute("aria-labelledby", "cascade-title");
  const header = element("div", undefined, "dialog-header");
  const heading = element("h2", "Eliminar con asistente");
  heading.id = "cascade-title";
  const close = element("button", undefined, "icon-action-btn btn-cancel btn-lg");
  wizardIcon(close, "Cerrar", "close");
  close.type = "button";
  close.id = "cascade-close";
  header.append(heading, close);
  const progress = element("p", undefined, "cascade-progress"),
    content = element("div", undefined, "cascade-content");
  const error = element("p", "", "form-error");
  error.setAttribute("role", "alert");
  const footer = element("div", undefined, "cascade-footer");
  const back = element("button", undefined, "icon-action-btn btn-info btn-lg"),
    next = element("button", undefined, "icon-action-btn btn-save btn-lg");
  back.id = "cascade-back";
  next.id = "cascade-next";
  wizardIcon(back, "Anterior", "back");
  back.type = next.type = "button";
  footer.append(back, next);
  dialog.append(header, progress, content, error, footer);
  document.body.append(dialog);
  let step = 0,
    data,
    busy = false,
    result,
    review,
    confirmed = false,
    global = false,
    financial = false,
    shared = false;
  const body = {
    actions: {
      properties: {},
      owners: {},
      tenants: {},
      finance: "keep_historical",
      documents: "keep",
      notifications: "keep",
      posts: "keep_historical",
      user: "unlink",
      temporaryCommunity: { name: "", nif: "" },
    },
  };
  const actions = body.actions;
  function destroy() {
    if (!busy) {
      dialog.close();
      dialog.remove();
    }
  }
  close.addEventListener("click", destroy);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    destroy();
  });
  dialog.addEventListener("close", () => dialog.remove());
  back.addEventListener("click", () => {
    if (!busy && step > 0) {
      step--;
      render();
    }
  });
  function resetConfirmation() {
    confirmed = false;
    global = false;
    financial = false;
    shared = false;
  }
  function choose(row, key, value) {
    row[key] = value;
    resetConfirmation();
    render();
  }
  function optionsForProperty() {
    if (collection === "properties") return ["delete_property"];
    if (collection === "tenants") return ["keep"];
    return collection === "communities"
      ? ["orphan", "reassign_community", "create_temp_community", "delete_property"]
      : [
          "keep",
          "reassign_owner",
          "orphan",
          "reassign_community",
          "create_temp_community",
          "delete_property",
        ];
  }
  function configure() {
    for (const property of data.properties) {
      const row = actions.properties[property.id];
      const section = element("fieldset");
      section.append(
        element(
          "legend",
          `Inmueble: ${property.name} · ${property.communityName || "sin comunidad"}`,
        ),
      );
      select(section, "Acción", row.action, optionsForProperty(), (value) =>
        choose(row, "action", value),
      );
      if (row.action === "reassign_owner")
        select(
          section,
          "Propietario destino",
          row.newOwnerId || "",
          [
            ["", "Selecciona propietario"],
            ...state.owners
              .filter((o) => o.id !== id && hasPermission("owner:manage", o.id))
              .map((o) => [o.id, `${o.name} ${o.surname}`]),
          ],
          (value) => choose(row, "newOwnerId", value),
        );
      if (row.action === "reassign_community")
        select(
          section,
          "Comunidad destino",
          row.newCommunityId || "",
          [
            ["", "Selecciona comunidad"],
            ...state.communities
              .filter(
                (c) =>
                  (collection !== "communities" || c.id !== id) &&
                  hasPermission("community:edit", c.id),
              )
              .map((c) => [c.id, c.name]),
          ],
          (value) => choose(row, "newCommunityId", value),
        );
      content.append(section);
    }
    if (Object.values(actions.properties).some((p) => p.action === "create_temp_community")) {
      const section = element("fieldset");
      section.append(
        element("legend", "Comunidad temporal (una para todos los inmuebles seleccionados)"),
      );
      textInput(section, "Nombre", actions.temporaryCommunity.name, (value) => {
        actions.temporaryCommunity.name = value;
        resetConfirmation();
      });
      textInput(
        section,
        "NIF de la comunidad temporal",
        actions.temporaryCommunity.nif,
        (value) => {
          actions.temporaryCommunity.nif = value;
          resetConfirmation();
        },
      );
      content.append(section);
    }
    if (data.owners.length) {
      const section = element("fieldset");
      section.append(element("legend", "Propietarios"));
      content.append(
        element(
          "p",
          "Conservar un propietario mantiene sus otros inmuebles. El borrado global también quita su titularidad en otras comunidades.",
        ),
      );
      for (const owner of data.owners)
        select(
          section,
          owner.name,
          actions.owners[owner.id].action,
          collection === "owners"
            ? ["delete_owner"]
            : collection === "tenants"
              ? ["keep"]
              : ["keep", "delete_owner"],
          (value) => choose(actions.owners[owner.id], "action", value),
        );
      content.append(section);
    }
    if (data.tenants.length) {
      const section = element("fieldset");
      section.append(element("legend", "Inquilinos y contratos"));
      for (const tenant of data.tenants) {
        const row = actions.tenants[tenant.id];
        select(
          section,
          `${tenant.name} · contrato ${tenant.contractStart || "sin inicio"} / ${tenant.contractEnd || "sin fin"}`,
          row.action,
          ["keep", "reassign_tenant", "orphan_tenant", "end_contract", "remove_tenant"],
          (value) => choose(row, "action", value),
        );
        if (row.action === "reassign_tenant")
          select(
            section,
            `Inmueble destino de ${tenant.name}`,
            row.newPropertyId || "",
            [
              ["", "Selecciona inmueble"],
              ...state.properties
                .filter(
                  (p) =>
                    (collection !== "properties" || p.id !== id) &&
                    hasPermission("property:manage", p.id),
                )
                .map((p) => [p.id, `${p.plot} · ${p.communityName}`]),
            ],
            (value) => choose(row, "newPropertyId", value),
          );
      }
      content.append(section);
    }
    const section = element("fieldset");
    section.append(element("legend", "Histórico y acceso"));
    if (collection !== "tenants")
      select(
        section,
        "Cuotas, pagos, derramas y servicios afectados",
        actions.finance,
        [
          "keep_historical",
          "liquidate_final",
          "delete",
          ...(collection === "communities" ? ["reassign_community"] : []),
        ],
        (value) => choose(actions, "finance", value),
      );
    content.append(
      element(
        "p",
        "Los recibos conservados mantienen su fotografía original. La liquidación anula los recibos, perdona el saldo pendiente y libera los cobros aplicados como saldo a favor; no registra un pago nuevo. Trasladar inmuebles conserva el histórico en la comunidad original salvo traslado financiero conjunto.",
      ),
    );
    select(
      section,
      "Documentos de los perfiles eliminados",
      actions.documents,
      ["keep", "delete"],
      (value) => choose(actions, "documents", value),
    );
    select(
      section,
      "Notificaciones de los propietarios eliminados",
      actions.notifications,
      ["keep", "delete"],
      (value) => choose(actions, "notifications", value),
    );
    if (collection === "communities")
      select(
        section,
        "Publicaciones",
        actions.posts,
        ["keep_historical", "delete", "reassign_community"],
        (value) => choose(actions, "posts", value),
      );
    if (
      collection === "communities" &&
      [actions.finance, actions.posts].includes("reassign_community")
    ) {
      const destinations = [
        ...new Set(
          Object.values(actions.properties)
            .map(
              (p) => p.newCommunityId || (p.action === "create_temp_community" ? "temporary" : ""),
            )
            .filter(Boolean),
        ),
      ];
      const options = [
        ["", "Usar el destino de los inmuebles"],
        ...state.communities
          .filter((c) => c.id !== id && hasPermission("community:edit", c.id))
          .map((c) => [c.id, c.name]),
      ];
      if (destinations.includes("temporary"))
        options.push(["temporary", "Comunidad temporal nueva"]);
      select(
        section,
        "Destino del histórico",
        actions.destinationCommunityId || "",
        options,
        (value) => choose(actions, "destinationCommunityId", value),
      );
    }
    select(
      section,
      "Cuentas de los perfiles eliminados",
      actions.user,
      ["unlink", ...(hasPermission("admin:users") ? ["delete_user"] : [])],
      (value) => choose(actions, "user", value),
    );
    content.append(section);
  }
  function describe() {
    const lines = [];
    for (const [key, rows, title] of [
      ["properties", data.properties, "Inmueble"],
      ["owners", data.owners, "Propietario"],
      ["tenants", data.tenants, "Inquilino"],
    ])
      for (const row of rows) {
        const action = actions[key][row.id];
        const target = action.newCommunityId
          ? state.communities.find((c) => c.id === action.newCommunityId)?.name
          : action.newPropertyId
            ? state.properties.find((p) => p.id === action.newPropertyId)?.plot
            : action.newOwnerId
              ? state.owners.find((o) => o.id === action.newOwnerId)?.name
              : "";
        lines.push(`${title} ${row.name}: ${LABELS[action.action]}${target ? ` → ${target}` : ""}`);
      }
    lines.push(
      `Finanzas: ${LABELS[actions.finance]}`,
      `Documentos: ${LABELS[actions.documents]}`,
      `Notificaciones: ${LABELS[actions.notifications]}`,
      `Cuentas: ${LABELS[actions.user]}`,
    );
    if (collection === "communities") lines.push(`Publicaciones: ${LABELS[actions.posts]}`);
    if (Object.values(actions.properties).some((p) => p.action === "create_temp_community"))
      lines.push(
        `Comunidad temporal: ${actions.temporaryCommunity.name} (${actions.temporaryCommunity.nif})`,
      );
    return lines;
  }
  async function showArchive() {
    renderArchive(content, await api.cascadeArchive(result.archiveId), result.archiveId);
  }
  function render() {
    error.textContent = "";
    content.replaceChildren();
    progress.textContent = `Paso ${step + 1} de 5 · ${STEPS[step]}`;
    back.hidden = step === 0 || step === 4;
    next.hidden = step === 4;
    wizardIcon(
      next,
      step === 0 ? "Evaluar dependencias" : step === 3 ? "Ejecutar operación" : "Continuar",
      step === 3 ? "execute" : "next",
    );
    next.className = `icon-action-btn ${step === 3 ? "btn-delete" : "btn-save"} btn-lg`;
    if (step === 0) {
      const row = (state[collection] || []).find((r) => r.id === id);
      content.append(
        element(
          "h3",
          row
            ? row.name
              ? `${row.name} ${row.surname || ""}`
              : row.plot
            : "Registro seleccionado",
        ),
        element(
          "p",
          "El asistente evaluará las relaciones de este registro. Podrás conservar, reasignar o eliminar dependencias antes de confirmar la operación.",
        ),
      );
    } else if (step === 1) {
      content.append(
        element("h3", data.entity.name),
        element(
          "p",
          `${data.properties.length} inmuebles · ${data.owners.length} propietarios · ${data.tenants.length} inquilinos · ${data.finance.receipts} recibos · ${data.finance.payments} pagos · ${data.documents} documentos · ${data.notifications} notificaciones · ${data.posts} publicaciones`,
        ),
      );
      list(
        content,
        data.communities.map(
          (c) => `${c.name}${c.reasons?.length ? `: ${c.reasons.join("; ")}` : ""}`,
        ),
      );
      for (const owner of data.owners) {
        content.append(
          element(
            "h4",
            `${owner.name} · ${owner.finance.receipts} recibos y ${owner.finance.payments} pagos en su histórico global`,
          ),
        );
        list(
          content,
          owner.relationships.map((p) => `${p.name} · ${p.communityName || "sin comunidad"}`),
        );
      }
      list(
        content,
        data.tenants.map(
          (t) =>
            `${t.name}: contrato ${t.contractStart || "sin inicio"} / ${t.contractEnd || "sin fin"}`,
        ),
      );
      content.append(
        element(
          "p",
          "Eliminar un propietario globalmente puede afectar a todas estas comunidades. Los recibos compartidos también afectan a sus cotitulares.",
        ),
      );
    } else if (step === 2) configure();
    else if (step === 3) {
      content.append(
        element("h3", "Revisa el alcance antes de ejecutar"),
        element(
          "p",
          `Alcance financiero exacto: ${review.finance.receipts} recibos, ${review.finance.payments} pagos y ${review.finance.sharedReceipts} recibos compartidos.`,
        ),
      );
      if (review.otherReceiptsAffected)
        content.append(
          element(
            "p",
            `Borrar estos pagos también retirará sus aplicaciones en otros ${review.otherReceiptsAffected} recibos conservados, cuyo pendiente aumentará.`,
          ),
        );
      if (review.closedDistributions?.length) {
        content.append(
          element(
            "p",
            "Estos repartos se cerrarán para nuevas emisiones porque sus inmuebles se retiran o cambian de comunidad. Sus recibos ya emitidos conservan el saldo actual salvo la acción financiera elegida.",
          ),
        );
        list(
          content,
          review.closedDistributions.map(
            (row) => `${row.name}${row.shared ? " · reparto compartido con otros inmuebles" : ""}`,
          ),
        );
      }
      list(content, describe());
      list(
        content,
        (review.accounts || []).map(
          (account) => `Cuenta de acceso que se eliminará: ${account.usuario} (${account.rol})`,
        ),
      );
      if (review.requiresGlobalDelete)
        checkbox(
          content,
          "Confirmo eliminar globalmente al propietario en todas las comunidades indicadas.",
          global,
          (value) => {
            global = value;
          },
        );
      if (actions.finance === "delete")
        checkbox(
          content,
          "Eliminar también todos los datos financieros afectados, incluidos cuotas activas, pagos, aplicaciones de cobro y justificantes. No se exige liquidación previa.",
          financial,
          (value) => {
            financial = value;
          },
        );
      if (review.requiresSharedFinancial)
        checkbox(
          content,
          "Confirmo las acciones sobre recibos o repartos compartidos y su efecto en otros titulares e inmuebles.",
          shared,
          (value) => {
            shared = value;
          },
        );
      checkbox(
        content,
        "He revisado las relaciones y entiendo que esta operación no se puede deshacer.",
        confirmed,
        (value) => {
          confirmed = value;
        },
      );
    } else {
      content.append(
        element("h3", "Operación completada"),
        element("p", "Los cambios se guardaron y las vistas se actualizaron."),
      );
      if (result.temporaryCommunityId)
        content.append(
          element("p", `Comunidad temporal creada: ${actions.temporaryCommunity.name}`),
        );
      if (actions.finance === "liquidate_final")
        content.append(
          element(
            "p",
            `${result.settlement.cancelledReceipts} recibos anulados. Consulta el acta para ver el saldo perdonado y el crédito liberado.`,
          ),
        );
      const archive = element(
        "button",
        "Consultar acta y documentos conservados",
        "secondary-button",
      );
      archive.type = "button";
      archive.addEventListener("click", async () => {
        archive.disabled = true;
        try {
          await showArchive();
        } catch (e) {
          error.textContent = e.message;
          archive.disabled = false;
        }
      });
      content.append(archive);
    }
  }
  next.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    next.disabled = back.disabled = close.disabled = true;
    error.textContent = "";
    try {
      if (step === 0) {
        data = await api.cascadePreview(collection, id);
        body.previewToken = data.previewToken;
        actions.properties = {};
        actions.owners = {};
        actions.tenants = {};
        for (const row of data.properties)
          actions.properties[row.id] = {
            action:
              collection === "properties"
                ? "delete_property"
                : collection === "communities"
                  ? "orphan"
                  : "keep",
          };
        for (const row of data.owners)
          actions.owners[row.id] = { action: collection === "owners" ? "delete_owner" : "keep" };
        for (const row of data.tenants)
          actions.tenants[row.id] = { action: collection === "tenants" ? "remove_tenant" : "keep" };
        actions.temporaryCommunity.name = `Temporal · ${data.entity.name}`;
      }
      if (step === 2) review = await api.cascadeReview(collection, id, body);
      if (step === 3) {
        if (!confirmed) throw new Error("Confirma que has revisado la operación.");
        if (review.requiresGlobalDelete && !global)
          throw new Error("Confirma el borrado global en todas las comunidades.");
        if (review.requiresSharedFinancial && !shared)
          throw new Error("Confirma el alcance sobre los recibos compartidos.");
        if (actions.finance === "delete" && !financial)
          throw new Error("Confirma el borrado definitivo de los datos financieros.");
        body.executionToken = review.executionToken;
        body.confirmDelete = confirmed;
        body.confirmGlobalDelete = global;
        body.confirmDeleteFinancial = financial;
        body.confirmSharedFinancial = shared;
        result = await api.cascadeDelete(collection, id, body);
        step = 4;
        // Do not report a failed delete when only refreshing the screen fails.
        try {
          await refreshState();
        } catch {
          toast("Operación guardada. Recarga la página para actualizar las vistas.");
        }
      } else step++;
      render();
    } catch (e) {
      error.textContent = e.message;
      if (e.code === "CASCADE_STALE") {
        step = 0;
        render();
        error.textContent = e.message;
        resetConfirmation();
        wizardIcon(next, "Volver a evaluar", "next");
      }
    } finally {
      busy = false;
      next.disabled = back.disabled = close.disabled = false;
    }
  });
  render();
  dialog.showModal();
}

function renderArchive(parent, archive, archiveId) {
  const section = element("section");
  section.append(
    element("h3", archive.entity.name),
    element("p", `Operación: ${archive.createdAt}`),
  );
  list(section, [
    `Finanzas: ${LABELS[archive.actions.finance]}`,
    `Documentos: ${LABELS[archive.actions.documents]}`,
    `Notificaciones: ${LABELS[archive.actions.notifications]}`,
    `Cuentas: ${LABELS[archive.actions.user]}`,
  ]);
  const affected = archive.affected || {};
  for (const [key, title] of [
    ["properties", "Inmuebles"],
    ["owners", "Propietarios"],
    ["tenants", "Inquilinos"],
  ]) {
    if (!affected[key]?.length) continue;
    section.append(element("h4", title));
    list(
      section,
      affected[key].map(
        (row) => `${row.name}: ${LABELS[archive.actions[key][row.id]?.action] || "Conservar"}`,
      ),
    );
  }
  if (archive.settlement.cancelledReceipts) {
    section.append(element("p", `${archive.settlement.cancelledReceipts} recibos anulados.`));
    list(
      section,
      Object.entries(archive.settlement.byCurrency || {}).map(
        ([currency, amounts]) =>
          `${currency} · Pendiente perdonado: ${(amounts.forgiven / 100).toFixed(2)} · Crédito liberado: ${(amounts.releasedCredit / 100).toFixed(2)}`,
      ),
    );
  }
  if (archive.financial) {
    section.append(element("h4", "Histórico financiero al iniciar la operación"));
    list(
      section,
      archive.financial.receipts.map((row) => {
        const snapshot = JSON.parse(row.snapshot);
        return `${snapshot.property || row.propertyId} · ${row.period} · ${(row.amount / 100).toFixed(2)} ${snapshot.currency || "EUR"}${row.cancelledAt ? " · Anulado previamente" : ""}`;
      }),
    );
    list(
      section,
      archive.financial.payments.map(
        (row) => `Cobro ${row.paidOn} · ${(row.amount / 100).toFixed(2)} · ${row.method}`,
      ),
    );
  }
  for (const post of archive.posts || []) {
    const data = JSON.parse(post.data);
    section.append(
      element("h4", data.title || "Publicación conservada"),
      element("p", data.body || ""),
    );
  }
  for (const rows of Object.values(archive.notifications || {}))
    if (rows.length) {
      section.append(element("h4", "Notificaciones conservadas"));
      list(
        section,
        rows.map(
          (row) =>
            `${row.date || ""} · ${row.title || row.subject || "Aviso"}${row.message ? `: ${row.message}` : ""}`,
        ),
      );
    }
  for (const doc of archive.documents || []) {
    const link = element("a", doc.fileName, "cascade-archive-link");
    link.href = `/api/cascade-archives/${encodeURIComponent(archiveId)}/files/${encodeURIComponent(doc.id)}`;
    section.append(link);
  }
  for (const file of archive.communicationFiles || []) {
    const link = element("a", file.name, "cascade-archive-link");
    link.href = `/api/cascade-archives/${encodeURIComponent(archiveId)}/communications/${encodeURIComponent(file.id)}`;
    section.append(link);
  }
  for (const file of archive.embeddedDocuments || []) {
    const link = element("a", file.fileName, "cascade-archive-link");
    link.href = `/api/cascade-archives/${encodeURIComponent(archiveId)}/embedded/${file.entityIndex}/${encodeURIComponent(file.key)}`;
    section.append(link);
  }
  if (archive.closedDistributions?.length) {
    section.append(element("h4", "Repartos cerrados para nuevas emisiones"));
    list(
      section,
      archive.closedDistributions.map((row) => row.name),
    );
  }
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob),
    download = element("a", "Descargar datos del acta (.json)", "cascade-archive-link");
  download.href = url;
  download.download = `acta-${archiveId}.json`;
  if (parent.closest("#audit-cascade-history")) historyDownloads.add(url);
  else
    parent
      .closest("dialog")
      ?.addEventListener("close", () => URL.revokeObjectURL(url), { once: true });
  section.append(download);
  parent.append(section);
}

const historyDownloads = new Set();
let historyRequest = 0;
export async function renderCascadeArchiveHistory(host) {
  for (const url of historyDownloads) URL.revokeObjectURL(url);
  historyDownloads.clear();
  const current = ++historyRequest,
    userId = state.currentUserId;
  host.replaceChildren();
  if (!hasPermission("audit:read")) return;
  const error = element("p");
  error.setAttribute("role", "status");
  host.append(error);
  const currentRequest = () =>
    current === historyRequest && userId === state.currentUserId && hasPermission("audit:read");
  async function load(offset = 0) {
    error.textContent = "Cargando histórico de borrados…";
    try {
      const page = await api.cascadeArchives(offset);
      if (!currentRequest()) return;
      error.textContent =
        !page.items.length && offset === 0 ? "No hay operaciones conservadas en tu ámbito." : "";
      for (const item of page.items) {
        const row = element("div", undefined, "cascade-history-row");
        row.append(
          element("p", `${new Date(item.createdAt).toLocaleString("es-ES")} · ${item.entity.name}`),
        );
        const open = element("button", "Consultar acta y documentos", "secondary-button");
        open.type = "button";
        open.onclick = async () => {
          open.disabled = true;
          try {
            const archive = await api.cascadeArchive(item.id);
            if (!currentRequest()) return;
            renderArchive(row, archive, item.id);
          } catch (e) {
            if (currentRequest()) {
              error.textContent = e.message;
              open.disabled = false;
            }
          }
        };
        row.append(open);
        host.append(row);
      }
      if (page.nextOffset !== null) {
        const more = element("button", "Ver anteriores", "secondary-button");
        more.type = "button";
        more.onclick = async () => {
          more.disabled = true;
          await load(page.nextOffset);
          more.remove();
        };
        host.append(more);
      }
    } catch (e) {
      if (currentRequest()) error.textContent = e.message;
    }
  }
  await load();
}
