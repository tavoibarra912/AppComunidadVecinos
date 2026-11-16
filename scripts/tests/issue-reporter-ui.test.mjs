import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";

const html = readFileSync("public/index.html", "utf8");
const source = readFileSync("public/js/features/issue-reporter.js", "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/\bexport (?=(async )?function|const |let )/g, "");
const flush = () => new Promise((resolve) => setImmediate(resolve));

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
  };
  const calls = { config: 0, reports: [] };
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
  Object.assign(dom.window, { api, state, toast: () => {} });
  const module = vm.runInContext(
    `(()=>{${source}\nreturn {renderIssueReporter};})()`,
    dom.getInternalVMContext(),
  );
  const query = (selector) => dom.window.document.querySelector(selector);
  return { dom, calls, state, ...module, query };
}

test("UI reportes: icono visible con sesión, modal validado y confirmación del issue", async () => {
  const ui = fixture();
  const fab = ui.query("#issue-reporter-fab");
  const dialog = ui.query("#issue-reporter-dialog");
  const form = ui.query("#issue-reporter-form");
  const error = ui.query("#issue-reporter-error");
  const success = ui.query("#issue-reporter-success");

  assert.equal(fab.hidden, true);
  ui.renderIssueReporter();
  assert.equal(fab.hidden, false);

  fab.click();
  assert.equal(dialog.open, true);
  await flush();
  assert.equal(ui.calls.config, 1);

  form.elements.title.value = "abc";
  form.elements.description.value = "Una descripción suficientemente larga";
  form.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.match(error.textContent, /al menos 5/);
  assert.equal(ui.calls.reports.length, 0);

  form.elements.title.value = "El botón de guardar no responde";
  form.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(ui.calls.reports.length, 1);
  assert.equal(ui.calls.reports[0].get("title"), "El botón de guardar no responde");
  assert.equal(ui.calls.reports[0].get("screen"), "/");
  assert.equal(success.hidden, false);
  assert.equal(form.hidden, true);
  assert.equal(ui.query("#issue-reporter-success-number").textContent, "#77");
  assert.equal(
    ui.query("#issue-reporter-success-link").href,
    "https://github.com/example/repo/issues/77",
  );

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
