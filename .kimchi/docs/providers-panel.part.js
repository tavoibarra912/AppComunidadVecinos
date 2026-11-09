export async function renderProvidersPanel(container) {
  const config = await request("/providers");
  container.innerHTML = `<p class="comm-muted">Configuración global de envío. Las credenciales guardadas no se muestran; dejá el campo vacío para conservarlas.</p><form id="comm-provider-form" autocomplete="off"><fieldset data-provider="smtp"><legend>Correo electrónico · SMTP</legend>${check("smtpEnabled", "Habilitar correo SMTP", config.smtp.enabled)}<div class="comm-form-grid">${input("smtpHost", "Servidor SMTP", config.smtp.host)}${input("smtpPort", "Puerto", config.smtp.port, "number", 'min="1" max="65535" required')}${input("smtpUser", "Usuario", config.smtp.user)}${input("smtpPassword", config.smtp.hasSecret ? "Contraseña (ya guardada)" : "Contraseña", "", "password", 'autocomplete="new-password" maxlength="1000"')}${input("smtpFrom", "Email remitente", config.smtp.from, "email")}${input("smtpFromName", "Nombre remitente", config.smtp.fromName)}</div>${check("smtpSecure", "TLS desde el inicio (habitualmente puerto 465)", config.smtp.secure)}${check("smtpClear", "Eliminar contraseña guardada")}<p class="comm-muted">Si no se usa TLS desde el inicio, se exige STARTTLS. La conexión debe tener un certificado válido.</p></fieldset>${["sms", "whatsapp"].map((channel) => `<fieldset data-provider="${channel}"><legend>${channel === "sms" ? "SMS" : "WhatsApp"}</legend>${check(`${channel}Enabled`, `Habilitar ${channel === "sms" ? "SMS" : "WhatsApp"}`, config[channel].enabled)}<label>Proveedor<select name="${channel}Provider"><option value="twilio">Twilio</option></select></label><div class="comm-form-grid">${input(`${channel}Sid`, "Account SID", config[channel].accountSid)}${input(`${channel}Token`, config[channel].hasSecret ? "Auth Token (ya guardado)" : "Auth Token", "", "password", 'autocomplete="new-password" maxlength="1000"')}${input(`${channel}From`, "Número emisor internacional", config[channel].from, "tel", 'placeholder="+34600111222"')}${channel === "whatsapp" ? input("whatsappContentSid", "Content SID de plantilla aprobada", config.whatsapp.contentSid) : ""}</div>${check(`${channel}Clear`, "Eliminar token guardado")}${channel === "whatsapp" ? '<p class="comm-muted">Configurá un emisor de WhatsApp autorizado en Twilio y una plantilla aprobada cuya variable {{1}} sea el texto del aviso. El Content SID comienza con HX.</p>' : ""}</fieldset>`).join("")}<button type="submit" class="primary-button">Guardar proveedores</button></form><fieldset><legend>Enviar un mensaje de prueba</legend><form id="comm-provider-test"><div class="comm-form-grid"><label>Canal<select name="channel"><option value="email">Correo electrónico</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select></label>${input("to", "Destino de la prueba", "", "text", 'required maxlength="254"')}</div><p class="comm-muted">Guardá la configuración antes de probar. Este botón envía un mensaje real al destino indicado.</p><button type="submit" class="secondary-button">Enviar prueba</button><p id="comm-test-result" role="status"></p></form></fieldset>`;
  $("#comm-provider-form").addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      const f = e.target,
        value = (name) => f.elements[name].value,
        checked = (name) => f.elements[name].checked;
      const payload = {
        smtp: {
          enabled: checked("smtpEnabled"),
          host: value("smtpHost"),
          port: Number(value("smtpPort")),
          secure: checked("smtpSecure"),
          user: value("smtpUser"),
          password: value("smtpPassword"),
          from: value("smtpFrom"),
          fromName: value("smtpFromName"),
          clearSecret: checked("smtpClear"),
        },
      };
      for (const c of ["sms", "whatsapp"])
        payload[c] = {
          enabled: checked(`${c}Enabled`),
          provider: value(`${c}Provider`),
          accountSid: value(`${c}Sid`),
          token: value(`${c}Token`),
          from: value(`${c}From`),
          clearSecret: checked(`${c}Clear`),
          ...(c === "whatsapp"
            ? { contentSid: value("whatsappContentSid") }
            : {}),
        };
      await request("/providers", "PUT", payload);
      await renderProvidersPanel(container);
      toast("Proveedores guardados. Las credenciales se almacenan cifradas.");
    }, e.submitter);
  });
  $("#comm-provider-test").addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      const result = await request("/providers/test", "POST", {
        channel: e.target.elements.channel.value,
        to: e.target.elements.to.value,
      });
      $("#comm-test-result").textContent = result.message;
    }, e.submitter);
  });
}

export function gotoProviders() {
  window.dispatchEvent(new CustomEvent("admin:goto-proveedores"));
  window.location.hash = "#administracion";
}
$("#comm-providers").addEventListener("click", gotoProviders);
