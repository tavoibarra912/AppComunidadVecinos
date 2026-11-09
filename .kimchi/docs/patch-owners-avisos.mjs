import fs from "node:fs";

const archivo = "src/routes/owners.js";
let t = fs.readFileSync(archivo, "utf8");

// 1) Import del módulo de avisos
const importViejo = 'import { contactError } from "../validation.js";';
if (!t.includes('avisarCambioOwner')) {
  t = t.replace(importViejo, importViejo + '\nimport { avisarCambioOwner } from "../avisos-cambios.js";');
}

// 2) Tras el COMMIT del PUT: capturar el estado actualizado y avisar (sin bloquear)
const ancla = `    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  res.json(findOwner(existing.id));
});`;

const nuevo = `    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const actualizado = findOwner(existing.id);
  // Aviso por email de los cambios (configurable; no bloquea el guardado).
  avisarCambioOwner(existing, actualizado, req.user).catch(error =>
    console.error("[avisos] error notificando cambios de propietario:", error.message),
  );

  res.json(actualizado);
});`;

if (!t.includes(ancla)) {
  console.error("ANCLA NO ENCONTRADA");
  process.exit(1);
}
t = t.replace(ancla, nuevo);
fs.writeFileSync(archivo, t);
console.log("OK");
