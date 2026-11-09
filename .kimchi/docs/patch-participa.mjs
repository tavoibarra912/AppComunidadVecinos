import fs from "node:fs";

const archivo = "public/js/features/communication.js";
let t = fs.readFileSync(archivo, "utf8");
let n = 0;

// 3) meetingView: RSVP solo si puede participar (con ${} escapado)
const rsvpViejo = "\${p.recipient ? `<div class=\"comm-callout\"><h3>Tu participación: \${rsvp[p.recipient.rsvp]}</h3><div class=\"comm-actions\"><button type=\"button\" class=\"secondary-button\" data-rsvp=\"accepted\">Asistiré</button><button type=\"button\" class=\"secondary-button\" data-rsvp=\"declined\">No asistiré</button><button type=\"button\" class=\"secondary-button\" data-rsvp=\"pending\">Decidir después</button></div></div>` : \"\"}";
const rsvpNuevo = "\${p.recipient && puedeParticipar(p) ? `<div class=\"comm-callout\"><h3>Tu participación: \${rsvp[p.recipient.rsvp]}</h3><div class=\"comm-actions\"><button type=\"button\" class=\"secondary-button\" data-rsvp=\"accepted\">Asistiré</button><button type=\"button\" class=\"secondary-button\" data-rsvp=\"declined\">No asistiré</button><button type=\"button\" class=\"secondary-button\" data-rsvp=\"pending\">Decidir después</button></div></div>` : \"\"}";

if (t.includes(rsvpViejo)) {
  t = t.replace(rsvpViejo, rsvpNuevo);
  n++;
  fs.writeFileSync(archivo, t);
  console.log("bloques:", n);
} else {
  console.error("RSVP VIEJO NO ENCONTRADO — ¿ya aplicado?", t.includes("puedeParticipar(p) ? `<div class=\"comm-callout\""));
  process.exit(1);
}
