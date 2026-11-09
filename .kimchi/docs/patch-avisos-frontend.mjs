import fs from "node:fs";

const archivo = "public/index.html";
let t = fs.readFileSync(archivo, "utf8");
let n = 0;

// 1) Campo de configuración en General (sección propia tras OTP)
const configAnchor = `<p class="form-section-title full">Documentos</p>`;
if (t.includes(configAnchor)) {
  const campo = `<p class="form-section-title full">Notificaciones de cambios</p>
              <label class="full">Email(s) para avisar cambios de perfiles (opcional)
                <input name="avisosCambiosEmail" maxlength="300" placeholder="asociacionpenarubia@gmail.com, otra@gmail.com" />
              </label>
              <p class="form-intro full">Separá varias direcciones con comas. Vacío = desactivado. El envío usa el correo habilitado en Proveedores de comunicación. Requiere tildar «Habilitar correo electrónico».</p>
              <p class="form-section-title full">Documentos</p>`;
  t = t.replace(configAnchor, campo + configAnchor);
  n++;
}

// 2) Plantillas en Textos de envío (tras recordatorio)
const textoAnchor = `<label class="full">Asunto del email de recuperación de contraseña`;
if (t.includes(textoAnchor)) {
  const plantillas = `<label class="full">Asunto del email de cambio de perfiles
                  <input name="texto_cambioAsunto" data-texto="cambioAsunto" maxlength="200" />
                </label>
                <label class="full">Cuerpo del email de cambio de perfiles
                  <textarea name="texto_cambioCuerpo" data-texto="cambioCuerpo" rows="4" maxlength="5000"></textarea>
                </label>
                <label class="full">Asunto del email de recuperación de contraseña`;
  t = t.replace(textoAnchor, plantillas);
  n++;
}

fs.writeFileSync(archivo, t);
console.log("bloques:", n);
