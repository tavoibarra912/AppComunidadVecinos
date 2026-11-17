import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function element(tag = "div", id = "") {
  return {
    tagName: tag,
    id,
    hidden: false,
    childNodes: [],
    attributes: {},
    textContent: "",
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return this.attributes[name] || null;
    },
    removeAttribute(name) {
      delete this.src;
      delete this.attributes[name];
    },
    querySelector() {
      return null;
    },
  };
}
function textNode(value) {
  return { nodeType: 3, textContent: value };
}
function fixture(brandJson = {}) {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, element("div", id));
    return elements.get(id);
  };
  const brandAnchor = element("a");
  brandAnchor.childNodes = [
    element("img", "topbar-brand-logo"),
    textNode("peñarrubia"),
    element("span"),
  ];
  const loginBrand = element("div");
  loginBrand.childNodes = [
    element("img", "login-brand-logo"),
    textNode("peñarrubia"),
    element("span"),
  ];
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
  const source = readFileSync(new URL("../../public/js/brand.js", import.meta.url), "utf8").replace(
    /^export /gm,
    "",
  );
  vm.runInNewContext(
    `${source}\nglobalThis.exposed = { readInjectedBrand, applyBrand, brandStyle, getSingleCommunityBrandOverride, effectiveBrand };`,
    context,
  );
  return { ...context.exposed, document, elements, brandAnchor, loginBrand, meta };
}

test("brand.js: aplica nombre, colores, título, descripción y saludo al boot", () => {
  const fx = fixture({
    nombre: "Vecinos del Parque",
    colorPrimario: "#0f3057",
    colorAcento: "#e8743b",
    logoDataUrl: "",
  });
  const brand = fx.readInjectedBrand();
  assert.equal(brand.nombre, "Vecinos del Parque");
  fx.applyBrand(brand);
  assert.equal(fx.brandAnchor.childNodes[1].textContent, "Vecinos del Parque");
  assert.equal(fx.loginBrand.childNodes[1].textContent, "Vecinos del Parque");
  assert.equal(fx.brandAnchor.attributes["aria-label"], "Inicio de Vecinos del Parque");
  assert.equal(fx.document.title, "Vecinos del Parque");
  assert.match(fx.meta.attributes.content, /Asociación Vecinos del Parque/);
  assert.equal(
    fx.elements.get("home-greeting-title").textContent,
    "Bienvenido a la gestión de Vecinos del Parque",
  );
  assert.match(fx.elements.get("brand-vars").textContent, /--nav:#0f3057/);
  assert.match(fx.elements.get("brand-vars").textContent, /--brand:#e8743b/);
  // El logo siempre está disponible: sin logo configurado se usa el por defecto.
  assert.equal(fx.elements.get("topbar-brand-logo").hidden, false);
  assert.match(fx.elements.get("topbar-brand-logo").src, /logo-default\.svg$/);
});
test("brand.js: logo se muestra con data URL y usa el por defecto sin él", () => {
  const logo = `data:image/png;base64,${Buffer.from("x").toString("base64")}`;
  const fx = fixture({ nombre: "X", logoDataUrl: logo });
  fx.applyBrand();
  assert.equal(fx.elements.get("topbar-brand-logo").hidden, false);
  assert.equal(fx.elements.get("topbar-brand-logo").src, logo);
  fx.applyBrand({ ...fx.readInjectedBrand(), logoDataUrl: "" });
  assert.equal(fx.elements.get("login-brand-logo").hidden, false);
  assert.match(fx.elements.get("login-brand-logo").src, /logo-default\.svg$/);
});
test("brand.js: JSON roto o incompleto cae a los valores por defecto sin romper", () => {
  const fx = fixture();
  fx.elements.get("brand-json").textContent = "{invalid";
  const brand = fx.readInjectedBrand();
  assert.equal(brand.nombre, "Peñarrubia");
  const applied = fx.applyBrand({ nombre: "   " });
  assert.equal(applied.nombre, "Peñarrubia");
});

const communityLogo = `data:image/png;base64,${Buffer.from("comunidad").toString("base64")}`;

test("brand.js: sin sesión o con varias comunidades no hay marca por comunidad", () => {
  const fx = fixture({ nombre: "Marca global", colorPrimario: "#0f3057" });
  const globalBrand = fx.readInjectedBrand();
  assert.equal(fx.getSingleCommunityBrandOverride({ communities: [] }), null);
  const single = fx.getSingleCommunityBrandOverride({
    currentUserId: "user-1",
    communities: [{ name: "Una", logoDataUrl: communityLogo }],
  });
  assert.equal(single.nombre, "Una");
  assert.equal(single.logoDataUrl, communityLogo);
  assert.equal(
    fx.getSingleCommunityBrandOverride({
      currentUserId: "user-1",
      communities: [
        { name: "Una", logoDataUrl: communityLogo },
        { name: "Otra", logoDataUrl: "" },
      ],
    }),
    null,
  );
  assert.equal(
    fx.effectiveBrand(globalBrand, {
      currentUserId: "user-1",
      communities: [
        { name: "Una", logoDataUrl: communityLogo },
        { name: "Otra", logoDataUrl: "" },
      ],
    }),
    globalBrand,
  );
});

test("brand.js: una única comunidad sustituye nombre y logo sin tocar los colores globales", () => {
  const fx = fixture({ nombre: "Marca global", colorPrimario: "#0f3057", colorAcento: "#e8743b" });
  const globalBrand = fx.readInjectedBrand();
  const state = {
    currentUserId: "user-1",
    communities: [{ name: "Residencial Peñarrubia", logoDataUrl: communityLogo }],
  };
  assert.equal(fx.getSingleCommunityBrandOverride(state).nombre, "Residencial Peñarrubia");
  assert.equal(fx.getSingleCommunityBrandOverride(state).logoDataUrl, communityLogo);
  const brand = fx.effectiveBrand(globalBrand, state);
  assert.equal(brand.nombre, "Residencial Peñarrubia");
  assert.equal(brand.logoDataUrl, communityLogo);
  assert.equal(brand.colorPrimario, "#0f3057");
  assert.equal(brand.colorAcento, "#e8743b");
  fx.applyBrand(brand);
  assert.equal(fx.brandAnchor.childNodes[1].textContent, "Residencial Peñarrubia");
  assert.equal(fx.elements.get("topbar-brand-logo").src, communityLogo);
});

test("brand.js: la comunidad puede aportar solo logo o solo nombre", () => {
  const fx = fixture({ nombre: "Marca global", logoDataUrl: "" });
  const globalBrand = fx.readInjectedBrand();
  const onlyLogo = fx.effectiveBrand(globalBrand, {
    currentUserId: "user-1",
    communities: [{ name: "", logoDataUrl: communityLogo }],
  });
  assert.equal(onlyLogo.nombre, "Marca global");
  assert.equal(onlyLogo.logoDataUrl, communityLogo);
  const onlyName = fx.effectiveBrand(globalBrand, {
    currentUserId: "user-1",
    communities: [{ name: "Comunidad Norte", logoDataUrl: "" }],
  });
  assert.equal(onlyName.nombre, "Comunidad Norte");
  assert.equal(onlyName.logoDataUrl, "");
});
