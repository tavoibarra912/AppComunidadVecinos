import { api } from "./api.js";
import { toast } from "./utils.js";

// Diálogo de verificación de contacto (OTP) compartido por inquilinos y comunidades.
// Un solo verificador activo a la vez: el que abre el diálogo.

const CONFIG = {
  phone: {
    normalizar: v => (v || "").replace(/\D/g, "").slice(0, 9),
    validar: v => /^[6-9]\d{8}$/.test(v),
    enviar: v => api.contact.sendPhoneCode(v),
    confirmar: (challengeId, code) => api.contact.confirmPhone(challengeId, code),
    nombre: "teléfono",
    titulo: "Verificar teléfono",
    desc: "Enviaremos un código de 6 dígitos por SMS al número indicado.",
    etiqueta: "Teléfono",
    verificadoMsg: "✓ Teléfono verificado por SMS",
    okMsg: "Teléfono verificado correctamente."
  },
  email: {
    normalizar: v => (v || "").trim().toLowerCase(),
    validar: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    enviar: v => api.contact.sendEmailCode(v),
    confirmar: (challengeId, code) => api.contact.confirmEmail(challengeId, code),
    nombre: "email",
    titulo: "Verificar email",
    desc: "Enviaremos un código de 6 dígitos por correo electrónico a la dirección indicada.",
    etiqueta: "Email",
    verificadoMsg: "✓ Correo electrónico verificado",
    okMsg: "Correo electrónico verificado con éxito."
  }
};

const el = id => document.querySelector("#" + id);
const dialogo = () => el("tenant-verification-dialog");
let activo = null;

export function crearVerificadorContacto({ alEstado, alVerificado }) {
  // alEstado(kind, estado: "pending"|"verified"|"error", mensaje)
  // alVerificado(kind, verifiedAt)
  const retos = {
    phone: { value: "", pending: false, challengeId: "", verified: false },
    email: { value: "", pending: false, challengeId: "", verified: false }
  };
  let kind = "";
  let getValue = () => "";

  function setError(msg) { const e = el("tenant-verification-error"); if (e) e.textContent = msg || ""; }

  async function enviarCodigo() {
    const conf = CONFIG[kind];
    const value = conf.normalizar(getValue());
    if (!conf.validar(value)) {
      const msg = `Introduce un ${conf.nombre} válido antes de solicitar el código.`;
      setError(msg); alEstado(kind, "error", msg); return false;
    }
    setError("");
    el("tenant-verification-resend-btn").disabled = true;
    try {
      const res = await conf.enviar(value);
      if (!res.challengeId) throw new Error("El servicio de verificación no devolvió el identificador del reto.");
      Object.assign(retos[kind], { pending: true, challengeId: res.challengeId, value });
      alEstado(kind, "pending", `Código enviado${res.maskedDestination ? ` a ${res.maskedDestination}` : ""}.`);
      const demo = el("tenant-verification-demo"), demoCode = el("tenant-verification-demo-code");
      if (res.devCode && demo && demoCode) { demo.hidden = false; demoCode.textContent = res.devCode; }
      return true;
    } catch (error) {
      retos[kind].challengeId = "";
      const msg = error instanceof Error ? error.message : String(error);
      setError(msg); alEstado(kind, "error", msg);
      return false;
    } finally {
      el("tenant-verification-resend-btn").disabled = false;
    }
  }

  function abrirInterno() {
    const conf = CONFIG[kind];
    const value = conf.normalizar(getValue());
    if (!conf.validar(value)) {
      alEstado(kind, "error", `Introduce un ${conf.nombre} válido antes de verificar.`);
      return;
    }
    el("tenant-verification-title").textContent = conf.titulo;
    el("tenant-verification-desc").textContent = conf.desc;
    el("tenant-verification-target").textContent = `${conf.etiqueta}: ${value}`;
    const demo = el("tenant-verification-demo");
    if (demo) demo.hidden = true;
    el("tenant-verification-code-input").value = "";
    setError("");
    dialogo().showModal();
    enviarCodigo().then(ok => { if (ok) el("tenant-verification-code-input").focus(); });
  }

  // Cableado único del diálogo compartido
  if (dialogo() && !dialogo().dataset.wired) {
    dialogo().dataset.wired = "1";
    el("tenant-verification-resend-btn").addEventListener("click", async () => {
      if (!activo) return;
      await activo.reenviar();
      el("tenant-verification-code-input").focus();
    });
    el("tenant-verification-confirm-btn").addEventListener("click", async () => {
      if (!activo) return;
      const code = el("tenant-verification-code-input").value.trim();
      if (!/^\d{6}$/.test(code)) { setError("Introduce el código de 6 dígitos recibido."); return; }
      const tipo = activo.kind();
      const reto = activo.retos()[tipo];
      if (!reto.pending || !reto.challengeId || reto.value !== CONFIG[tipo].normalizar(activo.valorActual())) {
        setError("Solicita un código nuevo para el valor actual.");
        return;
      }
      const btn = el("tenant-verification-confirm-btn");
      btn.disabled = true;
      try {
        const res = await CONFIG[tipo].confirmar(reto.challengeId, code);
        if (res.verified !== true || !res.verifiedAt) throw new Error("El código de verificación no es válido.");
        activo.confirmar(tipo, res.verifiedAt);
        toast(CONFIG[tipo].okMsg);
        dialogo().close();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setError(msg);
        activo.alEstado(tipo, "error", msg);
      } finally {
        btn.disabled = false;
      }
    });
    el("close-tenant-verification-dialog").addEventListener("click", () => dialogo().close());
    dialogo().addEventListener("click", event => {
      if (event.target === dialogo()) dialogo().close();
    });
  }

  const verificador = {
    abrir(tipo, obtenerValor) {
      activo = verificador;
      kind = tipo;
      getValue = obtenerValor;
      abrirInterno();
    },
    reenviar: () => enviarCodigo(),
    cambiarValor(tipo, value) {
      const normalizado = CONFIG[tipo].normalizar(value);
      if (retos[tipo].value !== normalizado) {
        Object.assign(retos[tipo], { value: normalizado, pending: false, challengeId: "", verified: false });
        alEstado(tipo, "pending", "Pendiente de verificación");
      }
    },
    hidratar(tipo, { value, verified }) {
      Object.assign(retos[tipo], { value: CONFIG[tipo].normalizar(value), verified: !!verified });
    },
    estaVerificado: tipo => retos[tipo].verified,
    kind: () => kind,
    retos: () => retos,
    valorActual: () => CONFIG[kind].normalizar(getValue()),
    confirmar: (tipo, verifiedAt) => alVerificado(tipo, verifiedAt),
    alEstado
  };
  return verificador;
}
