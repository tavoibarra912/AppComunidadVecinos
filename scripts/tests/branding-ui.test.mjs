import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function element(tag = "div", id = "") {
  return {
    tagName: tag, id, hidden: false, childNodes: [], attributes: {},
    textContent: "",
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] || null; },
    removeAttribute(name) { delete this.src; delete this.attributes[name]; },
    querySelector() { return null; },
  };
}
function textNode(value) {
  return { nodeType: 3, textContent: value };
}
function fixture(brandJson = {}) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, element("div", id));
    return elements.get(id);
  };
  const brandAnchor = element("a");
  brandAnchor.childNodes = [element("img", "topbar-brand-logo"), textNode("peñarrubia"), element("span")];
  const loginBrand = element("div");
  loginBrand.childNodes = [element("img", "login-brand-logo"), textNode("peñarrubia"), element("span")];
  const meta = element("meta");
  const brandJsonEl = element("script", "brand-json");
  brandJsonEl.textContent = JSON.stringify(brandJson);
  elements.set("brand-json", brandJsonEl);
  elements.set("brand-vars", element("style", "brand-vars"));
  elements.set("topbar-brand-logo", brandAnchor.childNodes[0]);
  elements.set("login-brand-logo", loginBrand.childNodes[0]);
  elements.set("home-greeting-title", element("h1", "home-greeting-title"));
  const document = {
    title: "Peñarrubia · Comunidades y Propietarios",
    getElementById: get,
    querySelector(selector) {
      if (selector === ".brand") return brandAnchor;
      if (selector === ".login-brand") return loginBrand;
      if (selector === 'meta[name="description"]') return meta;
      if (selector === "#home-greeting-title") return elements.get("home-greeting-title");
      return null;
    },
  };
  const context = { document };
  const source = readFileSync(new URL("../../public/js/brand.js", import.meta.url), "utf8").replace(/^export /gm, "");
  vm.runInNewContext(`${source}\nglobalThis.exposed = { readInjectedBrand, applyBrand, brandStyle };`, context);
  return { ...context.exposed, document, elements, brandAnchor, loginBrand, meta };
}

test("brand.js: aplica nombre, colores, título, descripción y saludo al boot", () => {
  const fx = fixture({ nombre: "Vecinos del Parque", colorPrimario: "#0f3057", colorAcento: "#e8743b", logoDataUrl: "" });
  const brand = fx.readInjectedBrand();
  assert.equal(brand.nombre, "Vecinos del Parque");
  fx.applyBrand(brand);
  assert.equal(fx.brandAnchor.childNodes[1].textContent, "Vecinos del Parque");
  assert.equal(fx.loginBrand.childNodes[1].textContent, "Vecinos del Parque");
  assert.equal(fx.brandAnchor.attributes["aria-label"], "Inicio de Vecinos del Parque");
  assert.equal(fx.document.title, "Vecinos del Parque");
  assert.match(fx.meta.attributes.content, /Asociación Vecinos del Parque/);
  assert.equal(fx.elements.get("home-greeting-title").textContent, "Bienvenido a la gestión de Vecinos del Parque");
  assert.match(fx.elements.get("brand-vars").textContent, /--nav:#0f3057/);
  assert.match(fx.elements.get("brand-vars").textContent, /--brand:#e8743b/);
  assert.equal(fx.elements.get("topbar-brand-logo").hidden, true);
});
test("brand.js: logo se muestra con data URL y se oculta sin él", () => {
  const logo = `data:image/png;base64,${Buffer.from("x").toString("base64")}`;
  const fx = fixture({ nombre: "X", logoDataUrl: logo });
  fx.applyBrand();
  assert.equal(fx.elements.get("topbar-brand-logo").hidden, false);
  assert.equal(fx.elements.get("topbar-brand-logo").src, logo);
  fx.applyBrand({ ...fx.readInjectedBrand(), logoDataUrl: "" });
  assert.equal(fx.elements.get("login-brand-logo").hidden, true);
});
test("brand.js: JSON roto o incompleto cae a los valores por defecto sin romper", () => {
  const fx = fixture();
  fx.elements.get("brand-json").textContent = "{invalid";
  const brand = fx.readInjectedBrand();
  assert.equal(brand.nombre, "Peñarrubia");
  const applied = fx.applyBrand({ nombre: "   " });
  assert.equal(applied.nombre, "Peñarrubia");
});
