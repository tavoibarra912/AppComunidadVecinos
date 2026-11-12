import { api } from "../api.js";
import { state } from "../state.js";
import { toast, makeSelectSearchable } from "../utils.js";

export function buildServiceEditor(ctx, service, ui) {
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
    parseReadingInput,
    formatReading,
    madridDate,
    serviceLabels,
    serviceMethods,
    serviceBillings,
    renderPanel,
    reloadAll,
    showService,
  } = ui;
  const editing = !!service;
  const shell = el("section", undefined, "fee-service-editor");
  const header = el("div", undefined, "fee-editor-heading");
  const copy = el("div");
  copy.append(
    el("p", "SERVICIOS", "eyebrow"),
    el("h2", editing ? "Editar servicio" : "Nuevo servicio"),
  );
  const close = iconButton(
    "Cerrar formulario de servicio",
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
    "Los campos marcados con * son obligatorios. Guardá el borrador y revisá la vista previa antes de emitir los recibos.",
  );
  const error = el("p", undefined, "fee-error");
  error.dataset.feeError = "";
  error.setAttribute("role", "alert");
  error.tabIndex = -1;
  error.hidden = true;
  shell.append(error);
  const form = el("form", undefined, "fee-service-form");
  form.noValidate = true;
  form.setAttribute("aria-label", "Formulario de servicio");
  shell.append(form);
  const panes = new Map();
  const sections = [
    ["general", "General"],
    ["split", "Reparto"],
    ["readings", "Lecturas"],
    ["notices", "Avisos"],
  ];
  const nav = tabBar(
    form,
    sections,
    "general",
    activate,
    "Secciones del servicio",
  );
  const sectionId = `service-${ctx.id}`;
  for (const [id, label] of sections) {
    const pane = el("section", undefined, "fee-editor-pane");
    pane.dataset.servicePane = id;
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
          ? "Datos de la factura"
          : label === "Reparto"
            ? "Inmuebles y criterio de reparto"
            : label === "Lecturas"
              ? "Lecturas de contador"
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
    ctx.serviceEditor = null;
    renderPanel(ctx.root, ctx);
    ctx.root.querySelector(".fee-services button")?.focus();
  }

  const general = panes.get("general");
  const grid = el("div", undefined, "fee-form-grid");
  general.append(grid);
  const serviceInput = field(
    grid,
    "Tipo de suministro *",
    "select",
    service?.service || "agua",
    Object.entries(serviceLabels),
  );
  serviceInput.required = true;
  serviceInput.dataset.noCombo = "";
  const supplier = field(
    grid,
    "Proveedor (opcional)",
    "text",
    service?.supplier || "",
  );
  supplier.maxLength = 120;
  const invoice = field(
    grid,
    "Número de factura (opcional)",
    "text",
    service?.invoiceNumber || "",
  );
  invoice.maxLength = 80;
  const period = field(
    grid,
    "Periodo de la factura *",
    "month",
    service?.period || madridDate().slice(0, 7),
  );
  period.required = true;
  const issueDate = field(
    grid,
    "Fecha de la factura *",
    "date",
    service?.issueDate || madridDate(),
  );
  issueDate.required = true;
  const dueDate = field(
    grid,
    "Vencimiento del recibo *",
    "date",
    service?.dueDate || defaultDueDate(),
  );
  dueDate.required = true;
  const total = euroField(
    grid,
    "Importe total de la factura (€) *",
    service?.totalAmount ?? "",
  );
  hint(total, "Importe íntegro que se repartirá entre los inmuebles.");
  const legalBasis = field(
    grid,
    "Base legal o acuerdo de Junta (opcional)",
    "text",
    service?.legalBasis || "",
  );
  legalBasis.maxLength = 300;
  legalBasis.closest(".fee-field").classList.add("fee-field-wide");
  hint(
    legalBasis,
    "Necesaria para repartos distintos del coeficiente. Indicá el acuerdo, la norma o el criterio aprobado.",
  );
  const centralHeating = field(
    grid,
    "Calefacción o refrigeración centralizada (opcional)",
    "checkbox",
    service?.centralHeating === true,
  );
  hint(
    centralHeating,
    "Si la factura corresponde a calefacción o refrigeración centralizada, se avisará si la parte variable queda fuera del 60–75 % recomendado por el RD 736/2020.",
  );
  const notes = field(
    grid,
    "Notas internas (opcional)",
    "textarea",
    service?.notes || "",
  );
  notes.maxLength = 2000;
  notes.closest(".fee-field").classList.add("fee-field-wide");
  info(
    general,
    "El reparto queda congelado al guardar: los cambios posteriores de coeficientes, censo o titulares no alteran los importes aprobados.",
  );

  const split = panes.get("split");
  const method = field(
    split,
    "Criterio de reparto *",
    "select",
    service?.method || "coefficient",
    Object.entries(serviceMethods),
  );
  method.required = true;
  method.dataset.noCombo = "";
  hint(
    method,
    "Coeficiente: proporcional a la participación. Lecturas: solo consumo. Mixto: parte fija por coeficiente y variable por consumo. Manual: importes por inmueble.",
  );
  const billing = field(
    split,
    "Modo de facturación *",
    "select",
    service?.billing || "receipts",
    Object.entries(serviceBillings),
  );
  billing.required = true;
  billing.dataset.noCombo = "";
  hint(
    billing,
    "Con recibos se genera una deuda por inmueble. Solo reparto deja constancia informativa sin crear deuda ni recibos.",
  );
  const variableShare = field(
    split,
    "Parte variable de la factura (%) *",
    "number",
    service?.variableShare || 60,
  );
  variableShare.min = "1";
  variableShare.max = "99";
  hint(
    variableShare,
    "Porcentaje del total que se reparte por lecturas; el resto se reparte por coeficiente. Para calefacción centralizada se recomienda entre 60 % y 75 %.",
  );
  const variableShareField = variableShare.closest(".fee-field");

  const properties = ctx.data.properties || [];
  const selected = new Set(
    service?.propertyIds || properties.map((property) => property.id),
  );
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
      "Buscá y vinculá los inmuebles que participan en el servicio. Podés quitar cualquiera antes de guardar.",
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
    properties.forEach((property) => selected.add(property.id));
    dirty = true;
    renderProperties();
  });
  propertyActions.append(all, link);
  selectedHeading.append(selectedCopy, propertyActions);
  split.append(selectedHeading);
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
        fail("Elegí un inmueble en el buscador.", "split");
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
  split.append(picker);
  const propertyList = el(
    "div",
    undefined,
    "community-properties-list fee-selected-properties",
  );
  const selectionSummary = el("p", undefined, "fee-selection-summary");
  selectionSummary.setAttribute("aria-live", "polite");
  split.append(propertyList, selectionSummary);

  const readingValues = new Map();
  function latestReading(propertyId) {
    return ctx.data.serviceMeters?.[serviceInput.value]?.[propertyId]?.reading;
  }
  function ensureReading(propertyId) {
    if (readingValues.has(propertyId)) return readingValues.get(propertyId);
    const saved = service?.readings?.[propertyId],
      latest = latestReading(propertyId),
      value = {
        previous: saved
          ? formatReading(saved.previous)
          : latest !== undefined
            ? formatReading(latest)
            : "0",
        current: saved ? formatReading(saved.current) : "",
      };
    readingValues.set(propertyId, value);
    return value;
  }
  function formatCoefficient(property) {
    const number = Number(String(property.coefficient).replace(",", "."));
    return Number.isFinite(number) ? number : 0;
  }
  function effectiveCoefficients() {
    const entries = properties.filter((property) => selected.has(property.id));
    const sum = entries.reduce(
      (total, property) => total + formatCoefficient(property),
      0,
    );
    return new Map(
      entries.map((property) => [
        property.id,
        sum ? (formatCoefficient(property) / sum) * 100 : 0,
      ]),
    );
  }
  function renderProperties() {
    propertyList.replaceChildren();
    selectedTitle.textContent = `Inmuebles incluidos (${selected.size}) *`;
    const available = properties.filter(
      (property) => !selected.has(property.id),
    );
    select.replaceChildren();
    for (const [value, label] of [
      ["", "Buscar inmueble…"],
      ...available.map((property) => [
        property.id,
        `${property.plot} · coeficiente ${property.coefficient} %`,
      ]),
    ]) {
      const option = el("option", label);
      option.value = value;
      select.append(option);
    }
    select.value = "";
    select.dispatchEvent(new Event("change"));
    for (const node of [confirm, link, all]) {
      node.disabled = !available.length;
      node.dataset.feeDisabled = String(!available.length);
    }
    const effective = effectiveCoefficients();
    for (const property of properties) {
      let input = manualInputs.get(property.id);
      if (!input) {
        const holder = el("div");
        input = euroField(
          holder,
          `${property.plot} · importe (€) *`,
          service?.allocations?.[property.id] ?? "",
        );
        input.addEventListener("input", updateSummary);
        manualInputs.set(property.id, input);
      }
      input.disabled = !selected.has(property.id) || method.value !== "manual";
      input.required = !input.disabled;
      input.closest(".fee-field").hidden = method.value !== "manual";
      if (!selected.has(property.id)) continue;
      const card = el(
        "div",
        undefined,
        "community-property-card fee-property-card",
      );
      const copy = el("div", undefined, "community-property-info");
      const live = state.properties.find(
        (candidate) => candidate.id === property.id,
      );
      const coefficient = effective.get(property.id) || 0;
      copy.append(
        el("span", property.plot, "community-property-title"),
        el(
          "span",
          `Coeficiente ${property.coefficient} %${
            method.value === "coefficient" || method.value === "mixed"
              ? ` · efectivo ${coefficient.toFixed(2)} %`
              : ""
          }${live?.address ? ` · ${live.address}` : ""}`,
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
    renderReadings();
  }
  method.addEventListener("change", renderProperties);
  billing.addEventListener("change", updateSummary);
  serviceInput.addEventListener("change", () => {
    if (!editing)
      for (const property of properties)
        if (!ensureReading(property.id).current)
          ensureReading(property.id).previous =
            latestReading(property.id) !== undefined
              ? formatReading(latestReading(property.id))
              : "0";
    renderReadings();
  });

  const readingsPane = panes.get("readings");
  const readingsIntro = el("div");
  readingsPane.append(readingsIntro);
  const readingsBox = el("div", undefined, "fee-readings");
  const readingsSummary = el("p", undefined, "fee-selection-summary");
  readingsSummary.setAttribute("aria-live", "polite");
  readingsPane.append(readingsBox, readingsSummary);
  function renderReadings() {
    readingsBox.replaceChildren();
    readingsIntro.replaceChildren();
    if (!["reading", "mixed"].includes(method.value)) {
      info(
        readingsIntro,
        "Este reparto no usa lecturas. Elegí «Por lecturas de contador» o «Mixto» en Reparto para cargar los contadores.",
      );
      readingsSummary.textContent = "";
      return;
    }
    info(
      readingsIntro,
      "La lectura anterior se propone desde la última factura del mismo suministro. Podés corregirla antes de guardar.",
    );
    const entries = properties.filter((property) => selected.has(property.id));
    if (!entries.length) {
      info(readingsIntro, "Agregá inmuebles en Reparto para cargar sus lecturas.");
      readingsSummary.textContent = "";
      return;
    }
    for (const property of entries) {
      const value = ensureReading(property.id);
      const card = el("div", undefined, "fee-reading-row");
      const title = el("div", undefined, "fee-reading-heading");
      const latest = ctx.data.serviceMeters?.[serviceInput.value]?.[property.id];
      title.append(
        el("strong", property.plot),
        el(
          "span",
          latest
            ? `Última lectura: ${formatReading(latest.reading)} m³ · ${latest.period}`
            : "Sin lectura anterior registrada",
          "fee-field-hint",
        ),
      );
      const previous = field(
        card,
        "Lectura anterior (m³) *",
        "text",
        value.previous,
      );
      previous.inputMode = "decimal";
      previous.maxLength = 12;
      previous.dataset.reading = "previous";
      previous.required = true;
      const current = field(
        card,
        "Lectura actual (m³) *",
        "text",
        value.current,
      );
      current.inputMode = "decimal";
      current.maxLength = 12;
      current.dataset.reading = "current";
      current.required = true;
      const consumption = el("span", "", "fee-reading-consumption");
      consumption.setAttribute("aria-live", "polite");
      function updateReading() {
        value.previous = previous.value;
        value.current = current.value;
        inputChanged();
        const before = parseReadingInput(previous.value),
          after = parseReadingInput(current.value);
        consumption.textContent =
          before === null || after === null
            ? "Lecturas pendientes de completar"
            : after < before
              ? "La lectura actual es menor que la anterior"
              : `Consumo: ${formatReading(after - before)} m³`;
        consumption.classList.toggle(
          "is-invalid",
          before !== null && after !== null && after < before,
        );
        updateSummary();
      }
      function inputChanged() {
        dirty = true;
        error.hidden = true;
      }
      previous.addEventListener("input", updateReading);
      current.addEventListener("input", updateReading);
      card.append(consumption);
      readingsBox.append(card);
      updateReading();
    }
    updateSummary();
  }
  function readingError() {
    if (!["reading", "mixed"].includes(method.value)) return "";
    for (const property of properties.filter((item) =>
      selected.has(item.id),
    )) {
      const value = ensureReading(property.id),
        previous = parseReadingInput(value.previous),
        current = parseReadingInput(value.current);
      if (previous === null)
        return `${property.plot}: la lectura anterior no es válida.`;
      if (current === null)
        return `${property.plot}: la lectura actual no es válida.`;
      if (current < previous)
        return `${property.plot}: la lectura actual no puede ser menor que la anterior.`;
    }
    return "";
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
    ...(service?.reminders || {}),
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
    editing ? "Guardar cambios" : "Crear servicio",
    saveDraft,
    true,
  );
  const back = button("Volver a servicios", requestClose);
  const footerActions = el("div", undefined, "fee-row-actions");
  footerActions.append(back, save);
  footer.append(footerSummary, footerActions);
  form.append(footer);

  function updateSummary() {
    const expected = parseMoneyInput(total.value) || 0;
    const manualSum = [...selected].reduce(
      (sum, id) =>
        sum + (parseMoneyInput(manualInputs.get(id)?.value) || 0),
      0,
    );
    selectionSummary.textContent =
      method.value === "manual"
        ? `${selected.size} ${selected.size === 1 ? "inmueble" : "inmuebles"} · Repartido ${money(manualSum)} de ${money(expected)}`
        : `${selected.size} ${selected.size === 1 ? "inmueble seleccionado" : "inmuebles seleccionados"} · ${
            method.value === "coefficient"
              ? "Reparto proporcional por coeficiente"
              : method.value === "reading"
                ? "Reparto por lecturas"
                : method.value === "mixed"
                  ? `Parte variable ${variableShare.value || 0} % por lecturas`
                  : "Importes manuales"
          }`;
    readingsSummary.textContent = ["reading", "mixed"].includes(method.value)
      ? `${selected.size} ${selected.size === 1 ? "contador" : "contadores"} · Consumo total ${formatReading(
          [...selected].reduce((sum, id) => {
            const value = readingValues.get(id) || {};
            const previous = parseReadingInput(value.previous),
              current = parseReadingInput(value.current);
            return (
              sum +
              (previous !== null && current !== null && current >= previous
                ? current - previous
                : 0)
            );
          }, 0),
        )} m³`
      : "";
    footerSummary.textContent = `${money(expected)} · ${selected.size} ${
      selected.size === 1 ? "inmueble" : "inmuebles"
    } · ${serviceLabels[serviceInput.value]}`;
  }
  total.addEventListener("input", updateSummary);
  variableShare.addEventListener("input", updateSummary);

  async function saveDraft() {
    if (saving) return;
    error.hidden = true;
    for (const input of form.querySelectorAll("input,select,textarea")) {
      if (input.disabled || input.closest(".fee-property-picker")) continue;
      if (input.dataset.money !== undefined)
        input.setCustomValidity(
          parseMoneyInput(input.value) > 0
            ? ""
            : "Introducí un importe positivo con un máximo de dos decimales.",
        );
      if (input.dataset.reading !== undefined)
        input.setCustomValidity(
          parseReadingInput(input.value) !== null
            ? ""
            : "Introducí una lectura válida con hasta tres decimales.",
        );
      if (!input.checkValidity())
        return fail(
          `${input.labels?.[0]?.textContent || "Revisá el campo"}: ${input.validationMessage}`,
          input.closest("[data-service-pane]")?.dataset.servicePane,
          input,
        );
    }
    if (!selected.size) return fail("Elegí al menos un inmueble.", "split");
    const expected = parseMoneyInput(total.value);
    if (
      method.value === "manual" &&
      [...selected].reduce(
        (sum, id) =>
          sum + (parseMoneyInput(manualInputs.get(id)?.value) || 0),
        0,
      ) !== expected
    )
      return fail(
        "La suma de importes por inmueble debe coincidir con el total de la factura.",
        "split",
      );
    const readingMessage = readingError();
    if (readingMessage) return fail(readingMessage, "readings");
    saving = true;
    save.disabled = close.disabled = back.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      const saved = await api.fees(
        editing
          ? `/services/${encodeURIComponent(service.id)}`
          : `/communities/${encodeURIComponent(ctx.id)}/services`,
        editing ? "PUT" : "POST",
        {
          service: serviceInput.value,
          supplier: supplier.value,
          invoiceNumber: invoice.value,
          period: period.value,
          issueDate: issueDate.value,
          dueDate: dueDate.value,
          totalAmount: total.value,
          billing: billing.value,
          method: method.value,
          variableShare: variableShare.value,
          centralHeating: centralHeating.checked,
          legalBasis: legalBasis.value,
          notes: notes.value,
          propertyIds: [...selected],
          manual: Object.fromEntries(
            [...selected].map((id) => [id, manualInputs.get(id).value]),
          ),
          readings: Object.fromEntries(
            [...selected].map((id) => {
              const value = ensureReading(id);
              return [
                id,
                { previous: value.previous, current: value.current },
              ];
            }),
          ),
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
      ctx.serviceEditor = null;
      await reloadAll();
      toast(
        editing
          ? "Servicio actualizado."
          : "Servicio guardado. Todavía no se emitieron recibos.",
      );
      showService(saved.id);
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
  function toggleMethod() {
    variableShareField.hidden = method.value !== "mixed";
    variableShare.disabled = method.value !== "mixed";
    variableShare.required = method.value === "mixed";
    renderReadings();
  }
  method.addEventListener("change", toggleMethod);
  toggleMethod();
  renderProperties();
  makeSelectSearchable(select, "Buscar inmueble…");
  const search = select.closest(".combo-box")?.querySelector("input");
  if (search) {
    search.setAttribute("aria-label", "Buscar inmueble para vincular");
    select.closest(".fee-field").querySelector("label").htmlFor = search.id;
  }
  ctx.serviceEditor = shell;
  ctx.tab = "services";
  renderPanel(ctx.root, ctx);
  serviceInput.focus();

  function defaultDueDate() {
    const due = new Date(`${madridDate()}T12:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 30);
    return due.toISOString().slice(0, 10);
  }
}
