import fs from "node:fs";

const archivo = "public/js/features/communication.js";
let t = fs.readFileSync(archivo, "utf8");

// RSVP de reuniones: solo con comm:participacion (la información queda)
const viejo = `${p.recipient ? `<div class="comm-callout"><h3>Tu participación: ${rsvp[p.recipient.rsvp]}</h3><div class="comm-actions"><button type="button" class="secondary-button" data-rsvp="accepted">Asistiré</button><button type="button" class="secondary-button" data-rsvp="declined">No asistiré</button><button type="button" class="secondary-button" data-rsvp="pending">Decidir después</button></div></div>` : ""}`;
const nuevo = `${p.recipient && participa ? `<div class="comm-callout"><h3>Tu participación: ${rsvp[p.recipient.rsvp]}</h3><div class="comm-actions"><button type="button" class="secondary-button" data-rsvp="accepted">Asistiré</button><button type="button" class="secondary-button" data-rsvp="declined">No asistiré</button><button type="button" class="secondary-button" data-rsvp="pending">Decidir después</button></div></div>` : ""}`;

if (t.includes(viejo)) {
  t = t.replace(viejo, nuevo);
  fs.writeFileSync(archivo, t);
  console.log("RSVP: gate aplicado");
} else console.error("RSVP NO MATCH");
