import fs from "node:fs";

const archivo = "public/index.html";
let html = fs.readFileSync(archivo, "utf8");

// Formularios que NO son formularios de datos (filtros, visores, navegación de diálogos).
const excluidos = new Set(["audit-filter", "doc-reject-form"]);
// <form method="dialog"> sin id: navegación de diálogos (botones), se excluyen.

let total = 0;
html = html.replace(/<form\b([^>]*)>([\s\S]*?)<\/form>/g, (formCompleto, formAttrs, formCuerpo) => {
  const id = (formAttrs.match(/id="([^"]+)"/) || [])[1];
  if (excluidos.has(id) || !id) return formCompleto; // method=dialog y filtros quedan igual
  const nuevoCuerpo = formCuerpo.replace(/(<label([^>]*)>)([\s\S]*?)(<\/label>)/g, (bloque, apertura, attrs, cuerpo, cierre) => {
    if (/checkbox-line/.test(attrs)) return bloque;
    if (/\brequired\b/.test(cuerpo)) return bloque;
    if (/\(opcional\)/.test(cuerpo)) return bloque;
    if (/\(obligatoria al crear/.test(cuerpo)) return bloque;
    if (/class="sr-only"/.test(cuerpo)) return bloque;
    const control = cuerpo.match(/<(input|select|textarea)\b[^>]*>/);
    if (!control) return bloque;
    if (/type="(hidden|submit|button|file|search)"/.test(control[0])) return bloque;
    const posControl = cuerpo.search(/<(input|select|textarea)\b/);
    const texto = cuerpo.slice(0, posControl);
    if (!texto.trim()) return bloque;
    // Texto + marcador, conservando el espacio/sangría original previo al control.
    const sangria = texto.match(/\s*$/)[0];
    total++;
    return apertura + texto.replace(/\s+$/, "") + " (opcional)" + sangria + cuerpo.slice(posControl) + cierre;
  });
  return `<form${formAttrs}>` + nuevoCuerpo + "</form>";
});

fs.writeFileSync(archivo, html);
console.log("labels marcados:", total);
