import { api } from "../api.js";
import { state } from "../state.js";
import { htmlToText } from "../html.js";
import { createRichText } from "../rich-text.js";
import { toast, makeSelectSearchable } from "../utils.js";

export function buildAssessmentEditor(ctx, assessment, ui) {
  const {
    el,
    button,
    iconButton,
    tabBar,
    field,
    euroField,
    hint,
    info,
    money,
    amount,
    parseMoneyInput,
    defaultAssessmentDueDate,
    renderPanel,
    reloadAll,
    showAssessment,
  } = ui;
  const editing = !!assessment;
  const shell = el("section", undefined, "fee-assessment-editor");
  const header = el("div", undefined, "fee-editor-heading");
  const copy = el("div");
  copy.append(
    el("p", "DERRAMAS", "eyebrow"),
    el("h2", editing ? "Editar derrama" : "Nueva derrama"),
  );
  const close = iconButton(
    "Cerrar formulario de derrama",
    requestClose,
    "cancel",
    "close",
  );
  close.classList.add("btn-lg");
  close.querySelector("svg").setAttribute("width", "20");
  close.querySelector("svg").setAttribute("height", "20");
  header.append(copy, close);
  shell.append(header);
  info(
    shell,
    "Los campos marcados con * son obligatorios. Completá las secciones y guardá el borrador antes de emitir recibos.",
  );
  const error = el("p", undefined, "fee-error");
  error.dataset.feeError = "";
  error.setAttribute("role", "alert");
  error.tabIndex = -1;
  error.hidden = true;
  shell.append(error);
  const form = el("form", undefined, "fee-assessment-form");
  form.noValidate = true;
  form.setAttribute("aria-label", "Formulario de derrama");
  shell.append(form);
  const panes = new Map();
  const sections = [
    ["general", "General"],
    ["properties", "Inmuebles"],
    ["installments", "Plazos"],
    ["notices", "Avisos"],
  ];
  const nav = tabBar(
    form,
    sections,
    "general",
    activate,
    "Secciones de la derrama",
  );
  const sectionId = `assessment-${ctx.id}`;
  for (const [id, label] of sections) {
    const pane = el("section", undefined, "fee-editor-pane");
    pane.dataset.assessmentPane = id;
    pane.id = `${sectionId}-${id}`;
    pane.setAttribute("role", "tabpanel");
    const tab = nav.querySelector(`[data-tab="${id}"]`);
    tab.id = `${pane.id}-tab`;
    tab.setAttribute("aria-controls", pane.id);
    pane.setAttribute("aria-labelledby", tab.id);
    pane.hidden = id !== "general";
    pane.append(
      el(
        "h3",
        label === "General"
          ? "Datos de la derrama"
          : label === "Inmuebles"
            ? "Reparto e inmuebles incluidos"
            : label === "Plazos"
              ? "Calendario de plazos"
              : "Avisos y recordatorios",
      ),
    );
    panes.set(id, pane);
    form.append(pane);
  }
  let dirty = false,
    saving = false;
  form.addEventListener("input", () => {
    dirty = true;
    error.hidden = true;
  });
  form.addEventListener("change", () => {
    dirty = true;
    error.hidden = true;
  });
  function activate(id) {
    if (saving) return;
    for (const [key, pane] of panes) {
      pane.hidden = key !== id;
      const tab = nav.querySelector(`[data-tab="${key}"]`);
      tab.classList.toggle("active", key === id);
      tab.setAttribute("aria-selected", String(key === id));
      tab.tabIndex = key === id ? 0 : -1;
    }
  }
  function fail(message, pane, input) {
    if (pane) activate(pane);
    error.textContent = message;
    error.hidden = false;
    if (input) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
    } else error.focus();
    return false;
  }
  const discard = el("div", undefined, "fee-discard-notice");
  discard.hidden = true;
  discard.setAttribute("role", "alert");
  discard.append(
    el("p", "Tenés cambios sin guardar. ¿Querés descartarlos?"),
    button("Seguir editando", () => {
      discard.hidden = true;
    }),
    button("Descartar cambios", leave),
  );
  shell.append(discard);
  function requestClose() {
    if (saving) return;
    if (dirty) {
      discard.hidden = false;
      discard.querySelector("button").focus();
    } else leave();
  }
  function leave() {
    ctx.assessmentEditor = null;
    renderPanel(ctx.root, ctx);
    ctx.root.querySelector(".fee-assessments button")?.focus();
  }
  const general = panes.get("general");
  const grid = el("div", undefined, "fee-form-grid");
  general.append(grid);
  const name = field(
    grid,
    "Nombre de la derrama *",
    "text",
    assessment?.name || "",
  );
  name.required = true;
  name.maxLength = 120;
  name.closest(".fee-field").classList.add("fee-field-wide");
  name.placeholder = "Por ejemplo, rehabilitación de la fachada";
  const agreement = field(
    grid,
    "Acuerdo de Junta que la aprueba *",
    "text",
    assessment?.agreement || "",
  );
  agreement.required = true;
  agreement.maxLength = 300;
  hint(agreement, "Fecha de la Junta o referencia del acta.");
  const total = euroField(
    grid,
    "Importe total de la derrama (€) *",
    assessment?.totalAmount ?? "",
  );
  hint(total, "Importe aprobado para todos los inmuebles y plazos.");
  const rich = el("div", undefined, "rich-text-field fee-field-wide");
  const richLabel = el(
    "span",
    "Motivo de la derrama (opcional)",
    "rich-text-label",
  );
  richLabel.id = `${sectionId}-purpose-label`;
  const richBox = el("div", undefined, "rich-text-editor");
  const toolbar = el("div", undefined, "rich-text-toolbar");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Formato del motivo de la derrama");
  for (const [command, label, html] of [
    ["bold", "Negrita", "<strong>B</strong>"],
    ["italic", "Cursiva", "<em>I</em>"],
    ["underline", "Subrayado", "<u>U</u>"],
    ["insertUnorderedList", "Lista con viñetas", "• Lista"],
    ["insertOrderedList", "Lista numerada", "1. Lista"],
    ["createLink", "Insertar enlace", "Enlace"],
    ["removeFormat", "Quitar formato", "Limpiar"],
  ]) {
    const control = el("button");
    control.type = "button";
    control.dataset.richCommand = command;
    control.title = label;
    control.setAttribute("aria-label", label);
    control.innerHTML = html;
    toolbar.append(control);
  }
  const editor = el("div", undefined, "rich-text-content");
  editor.setAttribute("contenteditable", "true");
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-multiline", "true");
  editor.setAttribute("aria-labelledby", richLabel.id);
  editor.dataset.placeholder =
    "Explicá el motivo, el alcance de las obras o el gasto extraordinario…";
  editor.dataset.maxlength = "2000";
  const purpose = el("textarea");
  purpose.name = "purpose";
  purpose.hidden = true;
  richBox.append(toolbar, editor);
  rich.append(richLabel, richBox, purpose);
  grid.append(rich);
  const purposeEditor = createRichText({ editor, input: purpose, toolbar });
  purposeEditor.setValue(assessment?.purpose || "");
  info(
    general,
    editing
      ? "Al guardar los cambios se actualizará el reparto con los coeficientes actuales. Después de emitir el primer plazo ya no se podrá editar."
      : "El reparto se congela al guardar. Los cambios posteriores de coeficientes o del censo no alteran los importes aprobados.",
  );

  const propertiesPane = panes.get("properties");
  const mode = field(
    propertiesPane,
    "Criterio de reparto *",
    "select",
    assessment?.mode || "coefficient",
    [
      ["coefficient", "Por coeficiente de participación"],
      ["manual", "Importes manuales por inmueble"],
    ],
  );
  mode.required = true;
  mode.dataset.noCombo = "";
  hint(
    mode,
    "Por coeficiente: proporcional entre los inmuebles incluidos. Manual: la suma debe coincidir con el total aprobado.",
  );
  const properties = ctx.data.properties || [];
  const selected = new Set(assessment?.propertyIds || []);
  const manualInputs = new Map();
  const selectedHeading = el(
    "div",
    undefined,
    "detail-section-heading fee-included-heading",
  );
  const selectedCopy = el("div");
  const selectedTitle = el("h4");
  selectedCopy.append(
    selectedTitle,
    el(
      "p",
      "Buscá y vinculá los inmuebles que participan en la derrama. Podés quitar cualquiera antes de guardar.",
      "detail-section-subtitle",
    ),
  );
  const propertyActions = el("div", undefined, "heading-actions");
  const link = iconButton(
    "Vincular inmueble",
    () => {
      picker.hidden = !picker.hidden;
      if (!picker.hidden) picker.querySelector("input")?.focus();
    },
    "info",
    "link",
  );
  const all = button("Agregar todos", () => {
    properties.forEach((p) => selected.add(p.id));
    dirty = true;
    renderProperties();
  });
  propertyActions.append(all, link);
  selectedHeading.append(selectedCopy, propertyActions);
  propertiesPane.append(selectedHeading);
  const picker = el(
    "div",
    undefined,
    "community-edit-link-panel fee-property-picker",
  );
  picker.hidden = true;
  const select = field(picker, "Inmueble a vincular (opcional)", "select");
  const confirm = iconButton(
    "Agregar inmueble seleccionado",
    () => {
      if (!select.value) {
        fail("Elegí un inmueble en el buscador.", "properties");
        return;
      }
      selected.add(select.value);
      dirty = true;
      renderProperties();
    },
    "save",
  );
  picker.append(
    confirm,
    iconButton(
      "Cerrar buscador de inmuebles",
      () => {
        picker.hidden = true;
      },
      "cancel",
      "close",
    ),
  );
  propertiesPane.append(picker);
  const propertyList = el(
    "div",
    undefined,
    "community-properties-list fee-selected-properties",
  );
  const selectionSummary = el("p", undefined, "fee-selection-summary");
  selectionSummary.setAttribute("aria-live", "polite");
  propertiesPane.append(propertyList, selectionSummary);
  function renderProperties() {
    propertyList.replaceChildren();
    selectedTitle.textContent = `Inmuebles incluidos (${selected.size}) *`;
    const available = properties.filter((p) => !selected.has(p.id));
    select.replaceChildren();
    for (const [value, text] of [
      ["", "Buscar inmueble…"],
      ...available.map((p) => [
        p.id,
        `${p.plot} · coeficiente ${p.coefficient} %`,
      ]),
    ]) {
      const option = el("option", text);
      option.value = value;
      select.append(option);
    }
    select.value = "";
    select.dispatchEvent(new Event("change"));
    for (const node of [confirm, link, all]) {
      node.disabled = !available.length;
      node.dataset.feeDisabled = String(!available.length);
    }
    for (const property of properties) {
      let input = manualInputs.get(property.id);
      if (!input) {
        const holder = el("div");
        input = euroField(
          holder,
          `${property.plot} · importe (€) *`,
          assessment?.allocations?.[property.id] ?? "",
        );
        input.addEventListener("input", updateSummary);
        manualInputs.set(property.id, input);
      }
      input.disabled = !selected.has(property.id) || mode.value !== "manual";
      input.required = !input.disabled;
      input.closest(".fee-field").hidden = mode.value !== "manual";
      if (!selected.has(property.id)) continue;
      const card = el(
        "div",
        undefined,
        "community-property-card fee-property-card",
      );
      const copy = el("div", undefined, "community-property-info");
      const live = state.properties.find((p) => p.id === property.id);
      copy.append(
        el("span", property.plot, "community-property-title"),
        el(
          "span",
          `Coeficiente ${property.coefficient} %${live?.address ? ` · ${live.address}` : ""}`,
          "community-property-sub",
        ),
      );
      card.append(
        copy,
        input.closest(".fee-field"),
        iconButton(
          `Quitar inmueble ${property.plot}`,
          () => {
            selected.delete(property.id);
            dirty = true;
            renderProperties();
          },
          "delete",
          "remove",
        ),
      );
      propertyList.append(card);
    }
    if (!selected.size)
      info(
        propertyList,
        "No hay inmuebles incluidos. Usá el botón de vincular o agregá todos los de la comunidad.",
      );
    updateSummary();
  }
  mode.addEventListener("change", renderProperties);

  const installmentsPane = panes.get("installments");
  const installmentHeading = el("div", undefined, "detail-section-heading");
  const installmentCopy = el("div");
  installmentCopy.append(
    el(
      "p",
      "Definí el importe y el vencimiento de cada plazo. La suma debe coincidir con el total aprobado.",
      "detail-section-subtitle",
    ),
  );
  const add = iconButton("Agregar plazo", () => {
    autoSingle = false;
    addInstallment();
    dirty = true;
  });
  installmentHeading.append(installmentCopy, add);
  installmentsPane.append(installmentHeading);
  const installmentsBox = el("div", undefined, "fee-installments");
  const installmentsSummary = el("div", undefined, "fee-payment-summary");
  installmentsSummary.setAttribute("aria-live", "polite");
  installmentsPane.append(installmentsBox, installmentsSummary);
  const rows = [];
  let autoSingle = !editing;
  function nextDueDate() {
    const previous = rows.at(-1)?.dueDate.value;
    if (!previous) return defaultAssessmentDueDate();
    const date = new Date(`${previous}T12:00:00Z`),
      day = date.getUTCDate();
    date.setUTCMonth(date.getUTCMonth() + 1, 1);
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, last));
    return date.toISOString().slice(0, 10);
  }
  function addInstallment(item = null) {
    if (rows.length >= 36) return;
    const row = el("div", undefined, "fee-installment-row");
    const title = el("strong", undefined, "fee-installment-number");
    const fields = el("div", undefined, "fee-installment-fields");
    const amountInput = euroField(
      fields,
      "Importe del plazo (€) *",
      item?.amount ?? "",
    );
    if (!item && rows.length) {
      const remaining =
        (parseMoneyInput(total.value) || 0) -
        rows.reduce(
          (sum, row) => sum + (parseMoneyInput(row.amount.value) || 0),
          0,
        );
      if (remaining > 0) amountInput.value = amount(remaining);
    }
    const dueInput = field(
      fields,
      "Vencimiento del plazo *",
      "date",
      item?.dueDate || nextDueDate(),
    );
    dueInput.required = true;
    const remove = iconButton(
      "Eliminar plazo",
      () => {
        rows.splice(
          rows.findIndex((entry) => entry.row === row),
          1,
        );
        row.remove();
        dirty = true;
        updateSummary();
      },
      "delete",
      "remove",
    );
    amountInput.addEventListener("input", () => {
      autoSingle = false;
      updateSummary();
    });
    dueInput.addEventListener("input", updateSummary);
    rows.push({ row, title, amount: amountInput, dueDate: dueInput, remove });
    row.append(title, fields, remove);
    installmentsBox.append(row);
    updateSummary();
  }

  const noticesPane = panes.get("notices");
  info(
    noticesPane,
    "Opcional: elegí los canales y ajustá los recordatorios. Si no cambiás nada se usan los valores iniciales de la comunidad.",
  );
  const defaults = {
    beforeDays: 3,
    afterDays: 7,
    repeatDays: 0,
    internal: true,
    email: false,
    ...(ctx.data.defaults || {}),
    ...(assessment?.reminders || {}),
  };
  const channels = el("div", undefined, "fee-notice-channels");
  noticesPane.append(channels);
  const internal = field(
    channels,
    "Avisos en el buzón de la app (opcional)",
    "checkbox",
    defaults.internal,
  );
  const email = field(
    channels,
    "Avisos por email a quienes habiliten el canal (opcional)",
    "checkbox",
    defaults.email,
  );
  const noticeGrid = el("div", undefined, "fee-form-grid");
  noticesPane.append(noticeGrid);
  const before = field(
    noticeGrid,
    "Días antes del vencimiento (opcional)",
    "number",
    defaults.beforeDays,
  );
  const after = field(
    noticeGrid,
    "Días después del vencimiento (opcional)",
    "number",
    defaults.afterDays,
  );
  const repeat = field(
    noticeGrid,
    "Repetir cada N días (opcional)",
    "number",
    defaults.repeatDays,
  );
  before.min = after.min = repeat.min = "0";
  before.max = "60";
  after.max = repeat.max = "365";
  hint(before, "0 desactiva el aviso previo.");
  hint(after, "0 avisa al día siguiente de vencer.");
  hint(repeat, "0 envía un único aviso de vencimiento.");
  const footer = el("div", undefined, "fee-editor-footer");
  const footerSummary = el("p", undefined, "fee-editor-summary");
  const save = button(
    editing ? "Guardar cambios" : "Crear derrama",
    saveDraft,
    true,
  );
  const back = button("Volver a derramas", requestClose);
  const footerActions = el("div", undefined, "fee-row-actions");
  footerActions.append(back, save);
  footer.append(footerSummary, footerActions);
  form.append(footer);
  function updateSummary() {
    const expected = parseMoneyInput(total.value) || 0;
    const sum = rows.reduce(
      (sum, row) => sum + (parseMoneyInput(row.amount.value) || 0),
      0,
    );
    rows.forEach((row, index) => {
      row.title.textContent = `Plazo ${index + 1}`;
      row.remove.disabled = rows.length === 1;
      row.remove.setAttribute("aria-label", `Eliminar plazo ${index + 1}`);
      row.remove.title =
        rows.length === 1
          ? "Debe quedar al menos un plazo"
          : `Eliminar plazo ${index + 1}`;
    });
    add.disabled = rows.length >= 36;
    add.dataset.feeDisabled = String(rows.length >= 36);
    const balance = !expected
      ? "Completá el importe total en General"
      : sum === expected
        ? "Correcto"
        : sum > expected
          ? `Exceso de ${money(sum - expected)}`
          : `Faltan por distribuir ${money(expected - sum)}`;
    installmentsSummary.textContent = `Total aprobado: ${money(expected)} · Suma de plazos: ${money(sum)} · ${balance}`;
    installmentsSummary.classList.toggle(
      "is-balanced",
      sum === expected && expected > 0,
    );
    const manualSum = [...selected].reduce(
      (sum, id) => sum + (parseMoneyInput(manualInputs.get(id)?.value) || 0),
      0,
    );
    selectionSummary.textContent =
      mode.value === "manual"
        ? `${selected.size} ${selected.size === 1 ? "inmueble" : "inmuebles"} · Repartido ${money(manualSum)} de ${money(expected)}`
        : `${selected.size} ${selected.size === 1 ? "inmueble seleccionado" : "inmuebles seleccionados"} · Reparto proporcional por coeficiente`;
    footerSummary.textContent = `${money(expected)} · ${selected.size} ${selected.size === 1 ? "inmueble" : "inmuebles"} · ${rows.length} ${rows.length === 1 ? "plazo" : "plazos"}`;
  }
  total.addEventListener("input", () => {
    if (autoSingle && rows.length === 1) rows[0].amount.value = total.value;
    updateSummary();
  });
  async function saveDraft() {
    if (saving) return;
    error.hidden = true;
    for (const input of form.querySelectorAll("input,select,textarea")) {
      if (
        input.disabled ||
        input === purpose ||
        input.closest(".fee-property-picker")
      )
        continue;
      if (input.dataset.money !== undefined)
        input.setCustomValidity(
          parseMoneyInput(input.value) > 0
            ? ""
            : "Introducí un importe positivo con un máximo de dos decimales.",
        );
      if (!input.checkValidity())
        return fail(
          `${input.labels?.[0]?.textContent || "Revisá el campo"}: ${input.validationMessage}`,
          input.closest("[data-assessment-pane]")?.dataset.assessmentPane,
          input,
        );
    }
    if (htmlToText(purposeEditor.sync()).length > 2000)
      return fail(
        "El motivo no puede superar 2000 caracteres.",
        "general",
        editor,
      );
    if (!selected.size)
      return fail("Elegí al menos un inmueble.", "properties");
    const expected = parseMoneyInput(total.value);
    const sum = rows.reduce(
      (sum, row) => sum + (parseMoneyInput(row.amount.value) || 0),
      0,
    );
    if (sum !== expected)
      return fail(
        `La suma de los plazos (${money(sum)}) debe coincidir con el total (${money(expected)}).`,
        "installments",
      );
    if (
      rows.some(
        (row, index) =>
          index && row.dueDate.value <= rows[index - 1].dueDate.value,
      )
    )
      return fail(
        "Los vencimientos de los plazos deben ser crecientes.",
        "installments",
      );
    if (
      mode.value === "manual" &&
      [...selected].reduce(
        (sum, id) => sum + (parseMoneyInput(manualInputs.get(id).value) || 0),
        0,
      ) !== expected
    )
      return fail(
        "La suma de los importes por inmueble debe coincidir con el total de la derrama.",
        "properties",
      );
    saving = true;
    save.disabled = close.disabled = back.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      const saved = await api.fees(
        editing
          ? `/assessments/${encodeURIComponent(assessment.id)}`
          : `/communities/${encodeURIComponent(ctx.id)}/assessments`,
        editing ? "PUT" : "POST",
        {
          name: name.value,
          purpose: purpose.value,
          agreement: agreement.value,
          totalAmount: total.value,
          mode: mode.value,
          propertyIds: [...selected],
          manual: Object.fromEntries(
            [...selected].map((id) => [id, manualInputs.get(id).value]),
          ),
          installments: rows.map((row) => ({
            amount: row.amount.value,
            dueDate: row.dueDate.value,
          })),
          reminders: {
            beforeDays:
              before.value === "" ? defaults.beforeDays : Number(before.value),
            afterDays:
              after.value === "" ? defaults.afterDays : Number(after.value),
            repeatDays:
              repeat.value === "" ? defaults.repeatDays : Number(repeat.value),
            internal: internal.checked,
            email: email.checked,
          },
        },
      );
      ctx.assessmentEditor = null;
      await reloadAll();
      toast(
        editing
          ? "Derrama actualizada."
          : "Derrama guardada. Todavía no se emitieron recibos.",
      );
      showAssessment(saved.id);
    } catch (failure) {
      fail(failure.message);
    } finally {
      saving = false;
      save.disabled = close.disabled = back.disabled = false;
      form.removeAttribute("aria-busy");
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDraft();
  });
  renderProperties();
  for (const item of assessment?.installments || [null]) addInstallment(item);
  makeSelectSearchable(select, "Buscar inmueble…");
  const search = select.closest(".combo-box")?.querySelector("input");
  if (search) {
    search.setAttribute("aria-label", "Buscar inmueble para vincular");
    select.closest(".fee-field").querySelector("label").htmlFor = search.id;
  }
  ctx.assessmentEditor = shell;
  ctx.tab = "assessments";
  renderPanel(ctx.root, ctx);
  name.focus();
}
