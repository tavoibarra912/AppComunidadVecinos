import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import createDOMPurify from "dompurify";

const html = readFileSync("public/index.html", "utf8");
const source = readFileSync("public/js/features/issue-reporter.js", "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/\bexport (?=(async )?function|const |let )/g, "");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const richTextSource = readFileSync("public/js/rich-text.js", "utf8")
  .replace(/^import[^\n]+\r?\n/gm, "")
  .replace(/\bexport function/g, "function");

function fixture({ config = { enabled: true }, report } = {}) {
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
  });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new dom.window.Event("close"));
  };
  const calls = { config: 0, reports: [] };
  const purifier = createDOMPurify(dom.window);
  const state = { currentUserId: "user-1" };
  const api = {
    getIssueReporterConfig: async () => {
      calls.config += 1;
      return config;
    },
    reportIssue: async (formData) => {
      calls.reports.push(formData);
      if (report) return report;
      return { number: 77, url: "https://github.com/example/repo/issues/77" };
    },
  };
  Object.assign(dom.window, {
    api,
    state,
    toast: () => {},
    sanitizeHtml: (value) => purifier.sanitize(value),
    htmlToText: (value) => {
      const container = dom.window.document.createElement("div");
      container.innerHTML = value;
      return (container.textContent || "").trim();
    },
  });
  const module = vm.runInContext(
    `(()=>{${richTextSource}\n${source}\nreturn {renderIssueReporter};})()`,
    dom.getInternalVMContext(),
  );
  const query = (selector) => dom.window.document.querySelector(selector);
  return { dom, calls, state, ...module, query };
}

test("UI reportes: icono visible con sesión, modal validado y agradecimiento al enviar", async () => {
  const ui = fixture();
  const fab = ui.query("#issue-reporter-fab");
  const dialog = ui.query("#issue-reporter-dialog");
  const form = ui.query("#issue-reporter-form");
  const error = ui.query("#issue-reporter-error");
  const success = ui.query("#issue-reporter-success");
  const editor = ui.query("#issue-reporter-description-editor");
  const hint = ui.query("#issue-reporter-files-hint");

  assert.equal(fab.hidden, true);
  ui.renderIssueReporter();
  assert.equal(fab.hidden, false);

  fab.click();
  assert.equal(dialog.open, true);
  await flush();
  assert.equal(ui.calls.config, 1);
  assert.match(hint.textContent, /Hasta 20 archivos de 15 MB/);

  form.elements.title.value = "";
  form.elements.description.value = "";
  form.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.match(error.textContent, /El título es obligatorio/);
  assert.equal(ui.calls.reports.length, 0);

  form.elements.title.value = "abc";
  form.elements.description.value = "Una descripción suficientemente larga";
  form.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.match(error.textContent, /al menos 5/);
  assert.equal(ui.calls.reports.length, 0);

  form.elements.title.value = "El botón de guardar no responde";
  form.elements.description.value = "";
  form.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.match(error.textContent, /La descripción es obligatoria/);
  assert.equal(ui.calls.reports.length, 0);

  editor.innerHTML = "<p>Una descripción <strong>suficientemente</strong> larga</p>";
  editor.dispatchEvent(new ui.dom.window.Event("input", { bubbles: true }));
  assert.match(form.elements.description.value, /<strong>suficientemente<\/strong>/);
  form.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(ui.calls.reports.length, 1);
  assert.equal(ui.calls.reports[0].get("title"), "El botón de guardar no responde");
  assert.equal(ui.calls.reports[0].get("screen"), "/");
  assert.match(ui.calls.reports[0].get("description"), /<strong>suficientemente<\/strong>/);
  assert.equal(success.hidden, false);
  assert.equal(form.hidden, true);
  assert.match(success.textContent, /Gracias por notificar el inconveniente/);
  assert.doesNotMatch(success.textContent, /GitHub|issue|#77|Crear otro reporte/i);
  assert.equal(success.querySelector("a"), null);
  assert.equal(dialog.getAttribute("aria-labelledby"), "issue-reporter-success-title");

  success.querySelector("[data-close-issue-reporter]").click();
  assert.equal(dialog.open, false);
  fab.click();
  assert.equal(editor.innerHTML, "");
  assert.equal(form.elements.description.value, "");
  assert.equal(form.elements.steps.value, "");
  assert.equal(success.hidden, true);
  assert.equal(form.hidden, false);
  assert.equal(dialog.getAttribute("aria-labelledby"), "issue-reporter-title");

  ui.state.currentUserId = null;
  ui.renderIssueReporter();
  assert.equal(fab.hidden, true);
});

test("UI reportes: avisa cuando el servidor no tiene la integración configurada", async () => {
  const ui = fixture({ config: { enabled: false, repository: "owner/repo" } });
  ui.renderIssueReporter();
  const fab = ui.query("#issue-reporter-fab");
  fab.click();
  await flush();
  const warning = ui.query("#issue-reporter-config");
  assert.equal(warning.hidden, false);
  assert.match(warning.textContent, /no está configurado/);
  assert.equal(ui.query("#issue-reporter-submit").disabled, true);
});

test("UI reportes: los adjuntos usan la configuración general y admiten varios", async () => {
  const ui = fixture({
    config: {
      enabled: true,
      attachments: {
        maxFiles: 3,
        maxBytes: 2 * 1024 * 1024,
        maxTotalBytes: 6 * 1024 * 1024,
        allowed: ["png", "pdf"],
        labels: "PNG, PDF",
      },
    },
  });
  ui.renderIssueReporter();
  ui.query("#issue-reporter-fab").click();
  await flush();

  const input = ui.query("#issue-reporter-files");
  const hint = ui.query("#issue-reporter-files-hint");
  assert.match(
    hint.textContent,
    /Hasta 3 archivos de 2 MB por archivo \(6 MB en total\): PNG, PDF/,
  );
  assert.equal(input.multiple, true);
  assert.match(input.accept, /\.png/);
  assert.match(input.accept, /\.pdf/);
  assert.doesNotMatch(input.accept, /\.docx/);

  const png = new ui.dom.window.File(["png"], "captura.png", {
    type: "image/png",
    lastModified: 1,
  });
  const pdf = new ui.dom.window.File(["pdf"], "consola.pdf", {
    type: "application/pdf",
    lastModified: 2,
  });
  Object.defineProperty(input, "files", { value: [png, pdf], configurable: true });
  input.dispatchEvent(new ui.dom.window.Event("change", { bubbles: true }));
  await flush();
  await flush();

  const list = ui.query("#issue-reporter-file-list");
  assert.equal(list.hidden, false);
  assert.equal(list.children.length, 2);
  assert.match(list.textContent, /captura\.png/);
  assert.match(list.textContent, /consola\.pdf/);
});
