import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const richSource = readFileSync("public/js/rich-text.js", "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/\bexport (?=(async )?function)/g, "");

test("H-04: el editor enriquecido queda en solo lectura y oculta la barra de formato", () => {
  const dom = new JSDOM(
    `<form>
      <div id="editor" contenteditable="true" data-maxlength="500"></div>
      <div id="toolbar"><button type="button" data-rich-command="bold">B</button></div>
      <textarea id="input"></textarea>
    </form>`,
    { url: "http://localhost", runScripts: "outside-only" },
  );
  try {
    const w = dom.window;
    w.sanitizeHtml = (value) => String(value ?? "");
    w.eval(
      `${richSource}\nwindow.richTest = createRichText({ editor: document.querySelector("#editor"), input: document.querySelector("#input"), toolbar: document.querySelector("#toolbar") });`,
    );
    const rich = w.richTest;
    const editor = w.document.querySelector("#editor");
    const toolbar = w.document.querySelector("#toolbar");

    rich.setValue("Observación original");
    rich.setReadOnly(true);
    assert.equal(editor.getAttribute("contenteditable"), "false");
    assert.equal(editor.getAttribute("aria-readonly"), "true");
    assert.equal(toolbar.hidden, true);

    rich.setReadOnly(false);
    assert.equal(editor.getAttribute("contenteditable"), "true");
    assert.equal(editor.getAttribute("aria-readonly"), "false");
    assert.equal(toolbar.hidden, false);
  } finally {
    dom.window.close();
  }
});

test("H-05: la cabecera usa el breakpoint de 820 px y el texto solo para lectores no aporta ancho", () => {
  const css = readFileSync("public/styles.css", "utf8");
  assert.match(
    css,
    /@media \(max-width: 820px\)[\s\S]*?\.topbar \.account-toggle #user-role-label\s*\{\s*display:\s*none/,
  );
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.layout\s*\{\s*display:\s*block/);
  const srOnly = css.match(/\.sr-only\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.match(srOnly, /left:\s*0/);
  assert.match(srOnly, /clip-path:\s*inset\(50%\)/);
});
