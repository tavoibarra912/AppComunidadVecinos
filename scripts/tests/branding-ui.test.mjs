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
    textNode("gestión de comunidades"),
    element("span"),
  ];
  const loginBrand = element("div");
  loginBrand.childNodes = [
    element("img", "login-brand-logo"),
    textNode("gestión de comunidades"),
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
    title: "Gestión de Comunidades",
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
  assert.match(fx.meta.attributes.content, /Gestión de comunidades/);
  assert.equal(
    fx.elements.get("home-greeting-title").textContent,
    "Bienvenido a Vecinos del Parque",
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
  assert.equal(brand.nombre, "Gestión de Comunidades");
  const applied = fx.applyBrand({ nombre: "   " });
  assert.equal(applied.nombre, "Gestión de Comunidades");
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
  assert.equal(single.nombre, undefined);
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

test("brand.js: una única comunidad aporta logo y colores sin cambiar el nombre de la app", () => {
  const fx = fixture({ nombre: "Marca global", colorPrimario: "#0f3057", colorAcento: "#e8743b" });
  const globalBrand = fx.readInjectedBrand();
  const state = {
    currentUserId: "user-1",
    communities: [{ name: "Residencial Peñarrubia", logoDataUrl: communityLogo }],
  };
  assert.equal(fx.getSingleCommunityBrandOverride(state).nombre, undefined);
  assert.equal(fx.getSingleCommunityBrandOverride(state).logoDataUrl, communityLogo);
  const brand = fx.effectiveBrand(globalBrand, state);
  assert.equal(brand.nombre, "Marca global");
  assert.equal(brand.logoDataUrl, communityLogo);
  assert.equal(brand.colorPrimario, "#0f3057");
  assert.equal(brand.colorAcento, "#e8743b");
  fx.applyBrand(brand);
  assert.equal(fx.brandAnchor.childNodes[1].textContent, "Marca global");
  assert.equal(fx.elements.get("topbar-brand-logo").src, communityLogo);
});

test("brand.js: la comunidad aporta logo, pero no cambia el nombre de la app", () => {
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
  assert.equal(onlyName.nombre, "Marca global");
  assert.equal(onlyName.logoDataUrl, "");
});

test("brand.js: una única comunidad aplica su estilo sin cambiar el nombre de la app", () => {
  const fx = fixture({ nombre: "Marca global", colorPrimario: "#0f3057", colorAcento: "#e8743b" });
  const globalBrand = fx.readInjectedBrand();
  const state = {
    currentUserId: "user-1",
    communities: [
      {
        name: "Residencial Verde",
        logoDataUrl: "",
        marca: {
          colorPrimario: "#0b6b3a",
          colorAcento: "#f2a900",
          colorFondo: "#f0f7f2",
          tipografia: "georgia",
          tamanoBase: 16,
          radioBordes: 10,
          densidad: "amplia",
        },
      },
    ],
  };
  const override = fx.getSingleCommunityBrandOverride(state);
  assert.equal(override.colorPrimario, "#0b6b3a");
  assert.equal(override.tipografia, "georgia");
  const brand = fx.effectiveBrand(globalBrand, state);
  assert.equal(brand.nombre, "Marca global");
  assert.equal(brand.colorPrimario, "#0b6b3a");
  assert.equal(brand.colorAcento, "#f2a900");
  assert.equal(brand.tipografia, "georgia");
  assert.equal(brand.tamanoBase, 16);
  // Un campo que la comunidad no define hereda el valor global.
  assert.equal(brand.colorTexto, globalBrand.colorTexto);
  fx.applyBrand(brand);
  const css = fx.elements.get("brand-vars").textContent;
  assert.match(css, /--nav:#0b6b3a/);
  assert.match(css, /--brand:#f2a900/);
  assert.match(css, /--canvas:#f0f7f2/);
  assert.match(css, /--font-ui:Georgia/);
  assert.match(css, /--font-size-base:16px/);
  assert.match(css, /--radius:10px/);
});

test("brand.js: sin marca de estilo la comunidad conserva intactos los colores globales", () => {
  const fx = fixture({ nombre: "Marca global", colorPrimario: "#0f3057", colorAcento: "#e8743b" });
  const globalBrand = fx.readInjectedBrand();
  const state = {
    currentUserId: "user-1",
    communities: [{ name: "Comunidad Simple", logoDataUrl: "", marca: {} }],
  };
  const brand = fx.effectiveBrand(globalBrand, state);
  assert.equal(brand.colorPrimario, "#0f3057");
  assert.equal(brand.colorAcento, "#e8743b");
});

test("brand.js: tipografías añadidas y variables por elemento", () => {
  const fx = fixture({ nombre: "Marca global" });
  const id = "custom-fuente-ui";
  const dataUrl = `data:font/woff2;base64,${Buffer.from("wOF2" + "U".repeat(20)).toString("base64")}`;
  const css = fx.brandStyle({
    ...fx.readInjectedBrand(),
    tipografia: id,
    tipografiaTitulos: "georgia",
    tipografiaBotones: id,
    tipografias: [{ id, nombre: "Fuente UI", respaldo: "serif", dataUrl }],
  });
  assert.match(css, /@font-face/);
  assert.match(css, new RegExp(`--font-ui:ACVFont-${id}, serif`));
  assert.match(css, /--font-heading:Georgia/);
  assert.match(css, new RegExp(`--font-button:ACVFont-${id}, serif`));
});
