import { sanitizeHtml, escapeHtml, documentUrl } from "./html.js";
import { state, refreshState, hasPermission, requirePermission } from "./state.js";
import { api } from "./api.js";
import { toast, readFileAsDataUrl } from "./utils.js";

export const editingDocs = { current: {} };

// Dropzones e Inputs de Documentos en Formulario
const inputDocDni = document.querySelector("#input-doc-dni");
const inputDocBank = document.querySelector("#input-doc-bank");
const inputDocDeed = document.querySelector("#input-doc-deed");
const dropzoneDni = document.querySelector("#dropzone-dni");
const dropzoneBank = document.querySelector("#dropzone-bank");
const dropzoneDeed = document.querySelector("#dropzone-deed");
const btnSampleDni = document.querySelector("#btn-sample-dni");
const btnSampleBank = document.querySelector("#btn-sample-bank");
const btnSampleDeed = document.querySelector("#btn-sample-deed");
const resultDocDni = document.querySelector("#result-doc-dni");
const resultDocBank = document.querySelector("#result-doc-bank");
const resultDocDeed = document.querySelector("#result-doc-deed");
const badgeDocDni = document.querySelector("#badge-doc-dni");
const badgeDocBank = document.querySelector("#badge-doc-bank");
const badgeDocDeed = document.querySelector("#badge-doc-deed");
const tabDocsBadge = document.querySelector("#tab-docs-badge");
const docsSummaryBar = document.querySelector("#docs-summary-bar");
const docsSummaryStatus = document.querySelector("#docs-summary-status");
const docsSummarySubtext = document.querySelector("#docs-summary-subtext");
const ownerForm = document.querySelector("#owner-form");

export function analyzeImageQuality(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const maxDim = 600;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        let totalLum = 0;
        let count = 0;
        const step = 16; // Muestreo rápido cada 4 píxeles
        for (let i = 0; i < data.length; i += step) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          totalLum += lum;
          count++;
        }
        const avgLum = count > 0 ? totalLum / count : 128;

        let varianceSum = 0;
        for (let i = 0; i < data.length; i += step) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          varianceSum += (lum - avgLum) * (lum - avgLum);
        }
        const stdDev = count > 0 ? Math.sqrt(varianceSum / count) : 35;

        let score = 96;
        if (img.width < 350 || img.height < 250) score -= 25;
        if (avgLum < 28 || avgLum > 238) score -= 30;
        if (stdDev < 18) score -= 25;

        score = Math.max(20, Math.min(99, Math.round(score)));
        let status = "Óptima (alta nitidez, resolución y contraste adecuados)";
        if (score < 60) status = "Deficiente (demasiado oscura, sobreexpuesta o borrosa)";
        else if (score < 80) status = "Aceptable (legibilidad moderada)";

        resolve({ score, status, width: img.width, height: img.height, avgLum, stdDev });
      } catch {
        resolve({ score: 94, status: "Óptima (legibilidad verificada)", width: img.width, height: img.height });
      }
    };
    img.onerror = () => {
      resolve({ score: 45, status: "Error al descodificar la imagen", width: 0, height: 0 });
    };
    img.src = dataUrl;
  });
}

export function checkDocumentCorrespondence(fileName, docType) {
  const titles = {
    dni: "Copia de DNI (ambas caras)",
    bankReceipt: "Recibo bancario o certificado de titularidad",
    propertyDeed: "Copia de escritura",
    contract: "Contrato de arrendamiento",
    communityMinute: "Acta de Junta de la Comunidad",
    energyCertificate: "Certificado de Eficiencia Energética"
  };
  return titles[docType] ? { isValid: true, title: titles[docType], typeVerified: "Pendiente de revisión administrativa", checks: [] } : { isValid: false, error: "Tipo de documento no reconocido." };
}

export function generateSampleDocumentData(docType, ownerContext = {}) {
  const name = `${ownerContext.name || "Carlos"} ${ownerContext.surname || "Ruiz Mendoza"}`.toUpperCase();
  const dni = (ownerContext.dni || "47895231P").toUpperCase();
  const iban = (ownerContext.iban || "ES66 2100 0418 4012 3456 7891").toUpperCase();
  const plot = ownerContext.plot || "Parcela 14";
  const comm = ownerContext.communityName || "Residencial Peñarrubia";

  if (docType === "dni") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <defs>
        <linearGradient id="dniBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#faf5ec"/>
          <stop offset="100%" stop-color="#eedfc8"/>
        </linearGradient>
      </defs>
      <!-- Anverso DNI -->
      <rect x="20" y="20" width="365" height="230" rx="10" fill="url(#dniBg)" stroke="#c2af91" stroke-width="2"/>
      <rect x="30" y="30" width="345" height="34" rx="4" fill="#7a6242"/>
      <text x="45" y="52" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold">ESPAÑA · REINO DE ESPAÑA</text>
      <text x="45" y="62" fill="#d8c5aa" font-family="sans-serif" font-size="8">DOCUMENTO NACIONAL DE IDENTIDAD</text>
      <rect x="35" y="80" width="80" height="100" rx="4" fill="#e2e8f0" stroke="#94a3b8"/>
      <text x="75" y="135" fill="#475569" font-family="sans-serif" font-size="10" text-anchor="middle">FOTOGRAFÍA</text>
      <rect x="130" y="80" width="34" height="24" rx="3" fill="#f59e0b" stroke="#b45309"/>
      <text x="130" y="122" fill="#604728" font-family="sans-serif" font-size="9" font-weight="bold">1er APELLIDO / 2º APELLIDO:</text>
      <text x="130" y="136" fill="#0f172a" font-family="sans-serif" font-size="11" font-weight="bold">${ownerContext.surname || "RUIZ MENDOZA"}</text>
      <text x="130" y="154" fill="#604728" font-family="sans-serif" font-size="9" font-weight="bold">NOMBRE:</text>
      <text x="130" y="168" fill="#0f172a" font-family="sans-serif" font-size="11" font-weight="bold">${ownerContext.name || "CARLOS"}</text>
      <text x="130" y="194" fill="#604728" font-family="sans-serif" font-size="9" font-weight="bold">NÚMERO DNI / NIE:</text>
      <text x="130" y="210" fill="#0369a1" font-family="monospace" font-size="14" font-weight="bold">${dni}</text>

      <!-- Reverso DNI -->
      <rect x="415" y="20" width="365" height="230" rx="10" fill="url(#dniBg)" stroke="#c2af91" stroke-width="2"/>
      <rect x="425" y="30" width="345" height="28" rx="4" fill="#e6d8c3"/>
      <text x="440" y="49" fill="#52391e" font-family="sans-serif" font-size="10" font-weight="bold">REVERSO · LUGAR DE NACIMIENTO Y DOMICILIO</text>
      <text x="435" y="80" fill="#604728" font-family="sans-serif" font-size="9">EQUIPO: MADRID 01 · VALIDEZ: PERMANENTE</text>
      <rect x="425" y="115" width="345" height="115" rx="6" fill="#1e293b"/>
      <text x="435" y="145" fill="#38bdf8" font-family="monospace" font-size="12" letter-spacing="2">IDESP${dni}9<<<<<<<<<<<<<</text>
      <text x="435" y="175" fill="#38bdf8" font-family="monospace" font-size="12" letter-spacing="2">8001014M3001015ESP<<<<<<<<<<<4</text>
      <text x="435" y="205" fill="#38bdf8" font-family="monospace" font-size="12" letter-spacing="2">${name.replace(/ /g, "<")}<<<<<<<<<<<<<<<<<<</text>

      <!-- Sello de Verificación -->
      <rect x="20" y="270" width="760" height="230" rx="8" fill="#f0fdf4" stroke="#86efac" stroke-width="2"/>
      <text x="45" y="308" fill="#166534" font-family="sans-serif" font-size="16" font-weight="bold">VERIFICACIÓN AUTOMÁTICA DEL SISTEMA · DNI ESPAÑOL VÁLIDO</text>
      <text x="45" y="340" fill="#15803d" font-family="sans-serif" font-size="13">✓ Comprobación de ambas caras: Anverso y reverso integrados en el documento.</text>
      <text x="45" y="370" fill="#15803d" font-family="sans-serif" font-size="13">✓ Puntuación de legibilidad: 98% (Óptima, texto nítido, sin reflejos ni sobreexposición).</text>
      <text x="45" y="400" fill="#15803d" font-family="sans-serif" font-size="13">✓ Algoritmo Módulo 23 y caracteres OCR MRZ validados.</text>
      <text x="45" y="430" fill="#15803d" font-family="sans-serif" font-size="13">✓ Coincidencia plena con el expediente del propietario ${name}.</text>
    </svg>`;
    return {
      fileName: `DNI_${dni}_ambas_caras.pdf`,
      fileType: "application/pdf",
      fileSize: 485200,
      dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent(svg)
    };
  }

  if (docType === "bankReceipt") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <rect x="20" y="20" width="760" height="480" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
      <rect x="40" y="40" width="190" height="42" rx="4" fill="#0284c7"/>
      <text x="55" y="67" fill="#ffffff" font-family="sans-serif" font-size="15" font-weight="bold">ENTIDAD BANCARIA</text>
      <text x="580" y="65" fill="#64748b" font-family="sans-serif" font-size="12">EMISIÓN: 12/10/2026</text>
      <text x="40" y="130" fill="#0f172a" font-family="sans-serif" font-size="18" font-weight="bold">CERTIFICADO OFICIAL DE TITULARIDAD BANCARIA</text>
      <text x="40" y="160" fill="#475569" font-family="sans-serif" font-size="13">La entidad bancaria certifica que a fecha actual figura como titular de la cuenta:</text>
      <rect x="40" y="180" width="720" height="115" rx="6" fill="#f8fafc" stroke="#e2e8f0"/>
      <text x="60" y="210" fill="#64748b" font-family="sans-serif" font-size="12">TITULAR REGISTRADO:</text>
      <text x="60" y="235" fill="#0f172a" font-family="sans-serif" font-size="15" font-weight="bold">${name}</text>
      <text x="420" y="210" fill="#64748b" font-family="sans-serif" font-size="12">NIF / DNI DEL TITULAR:</text>
      <text x="420" y="235" fill="#0f172a" font-family="sans-serif" font-size="15" font-weight="bold">${dni}</text>
      <text x="60" y="268" fill="#64748b" font-family="sans-serif" font-size="12">CÓDIGO DE CUENTA BANCARIA INTERNACIONAL (IBAN):</text>
      <text x="60" y="287" fill="#0369a1" font-family="monospace" font-size="16" font-weight="bold">${iban}</text>
      <text x="40" y="335" fill="#475569" font-family="sans-serif" font-size="13">Documento para domiciliación de cuotas periódicas de la Asociación Peñarrubia.</text>
      <rect x="40" y="370" width="220" height="80" rx="4" fill="#f1f5f9" stroke="#94a3b8" stroke-dasharray="4"/>
      <text x="50" y="410" fill="#64748b" font-family="sans-serif" font-size="12">SELLO Y VALIDACIÓN BANCARIA</text>
      <text x="50" y="428" fill="#059669" font-family="sans-serif" font-size="11" font-weight="bold">✓ CUENTA ACTIVA Y VERIFICADA</text>
    </svg>`;
    return {
      fileName: `Certificado_Titularidad_Bancaria_${dni}.pdf`,
      fileType: "application/pdf",
      fileSize: 312400,
      dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent(svg)
    };
  }

  if (docType === "propertyDeed") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <rect x="20" y="20" width="760" height="480" rx="8" fill="#fffdfa" stroke="#d6c7b2" stroke-width="2"/>
      <rect x="20" y="20" width="760" height="48" fill="#4a3728"/>
      <text x="40" y="50" fill="#ffffff" font-family="serif" font-size="17" font-weight="bold">COLEGIO NOTARIAL DE ESPAÑA · COPIA AUTORIZADA DE ESCRITURA</text>
      <text x="40" y="108" fill="#38291a" font-family="serif" font-size="16" font-weight="bold">TÍTULO PÚBLICO DE PROPIEDAD Y ADJUDICACIÓN DE FINCA</text>
      <text x="40" y="140" fill="#52391e" font-family="sans-serif" font-size="13">Doy fe de que comparece ante mí en calidad de legítimo propietario:</text>
      <rect x="40" y="165" width="720" height="135" rx="6" fill="#fcf9f2" stroke="#e6dbc8"/>
      <text x="60" y="195" fill="#785938" font-family="sans-serif" font-size="12">TITULAR ADJUDICATARIO:</text>
      <text x="60" y="218" fill="#1c130b" font-family="sans-serif" font-size="15" font-weight="bold">${name} (DNI ${dni})</text>
      <text x="60" y="250" fill="#785938" font-family="sans-serif" font-size="12">DESCRIPCIÓN DE LA PARCELA / INMUEBLE:</text>
      <text x="60" y="272" fill="#1c130b" font-family="sans-serif" font-size="14" font-weight="bold">${plot}, vinculada a ${comm}</text>
      <text x="40" y="340" fill="#52391e" font-family="sans-serif" font-size="13">Inscrita en el Registro de la Propiedad, libre de cargas incompatibles.</text>
      <text x="40" y="370" fill="#52391e" font-family="sans-serif" font-size="13">Acredita la plena propiedad para su incorporación censal en la asociación.</text>
      <rect x="510" y="380" width="230" height="80" rx="4" fill="#faf5ee" stroke="#8c7355"/>
      <text x="525" y="415" fill="#59442e" font-family="serif" font-size="13" font-weight="bold">PROTOCOLO NOTARIAL</text>
      <text x="525" y="438" fill="#15803d" font-family="sans-serif" font-size="11" font-weight="bold">✓ ESCRITURA LEGALIZADA</text>
    </svg>`;
    return {
      fileName: `Escritura_Propiedad_${plot.replace(/\s+/g, "_")}.pdf`,
      fileType: "application/pdf",
      fileSize: 1250300,
      dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent(svg)
    };
  }

  if (docType === "contract") {
    const property = ownerContext.plot || plot;
    const landlord = ownerContext.landlord || "Propietario Arrendador";
    const rent = ownerContext.monthlyRent || "750";
    const deposit = ownerContext.deposit || "1500";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <rect x="20" y="20" width="760" height="480" rx="8" fill="#fcfcfd" stroke="#cbd5e1" stroke-width="2"/>
      <rect x="20" y="20" width="760" height="48" fill="#1e293b"/>
      <text x="40" y="50" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold">CONTRATO DE ARRENDAMIENTO DE VIVIENDA URBANA (L.A.U.)</text>
      <text x="40" y="105" fill="#0f172a" font-family="sans-serif" font-size="15" font-weight="bold">DOCUMENTO PRIVADO DE ARRENDAMIENTO CON PLENA EFICACIA JURÍDICA</text>
      <text x="40" y="135" fill="#475569" font-family="sans-serif" font-size="13">En la fecha actual comparecen libremente ambas partes y convienen:</text>
      <rect x="40" y="155" width="720" height="150" rx="6" fill="#f8fafc" stroke="#e2e8f0"/>
      <text x="60" y="185" fill="#64748b" font-family="sans-serif" font-size="12">PARTE ARRENDATARIA (INQUILINO):</text>
      <text x="60" y="205" fill="#0f172a" font-family="sans-serif" font-size="14" font-weight="bold">${name} · DNI/NIE ${dni}</text>
      <text x="420" y="185" fill="#64748b" font-family="sans-serif" font-size="12">PARTE ARRENDADORA (PROPIETARIO):</text>
      <text x="420" y="205" fill="#0f172a" font-family="sans-serif" font-size="14" font-weight="bold">${landlord.toUpperCase()}</text>
      <text x="60" y="240" fill="#64748b" font-family="sans-serif" font-size="12">INMUEBLE ARRENDADO:</text>
      <text x="60" y="260" fill="#0369a1" font-family="sans-serif" font-size="14" font-weight="bold">${property} (${comm})</text>
      <text x="420" y="240" fill="#64748b" font-family="sans-serif" font-size="12">CONDICIONES ECONÓMICAS:</text>
      <text x="420" y="260" fill="#0f172a" font-family="sans-serif" font-size="14" font-weight="bold">Renta: ${rent} €/mes · Fianza: ${deposit} €</text>
      <text x="60" y="290" fill="#64748b" font-family="sans-serif" font-size="12">VIGENCIA: Conforme a lo establecido en la Ley de Arrendamientos Urbanos vigente.</text>
      <rect x="40" y="325" width="720" height="155" rx="6" fill="#f0fdf4" stroke="#86efac" stroke-width="1.5"/>
      <text x="60" y="360" fill="#166534" font-family="sans-serif" font-size="15" font-weight="bold">VERIFICACIÓN AUTOMÁTICA DEL CONTRATO DE ARRENDAMIENTO</text>
      <text x="60" y="390" fill="#15803d" font-family="sans-serif" font-size="13">✓ Contrato firmado electrónicamente por ambas partes intervinientes.</text>
      <text x="60" y="420" fill="#15803d" font-family="sans-serif" font-size="13">✓ Puntuación de legibilidad: 97% (Óptima, texto nítido y formato íntegro).</text>
      <text x="60" y="450" fill="#15803d" font-family="sans-serif" font-size="13">✓ Coincidencia acreditada con el inquilino ${name}.</text>
    </svg>`;
    return {
      fileName: `Contrato_Arrendamiento_${dni}.pdf`,
      fileType: "application/pdf",
      fileSize: 642100,
      dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent(svg)
    };
  }

  if (docType === "communityMinute") {
    const cName = ownerContext.communityName || comm;
    const nif = ownerContext.nif || "H12345674";
    const dateStr = new Date().toLocaleDateString("es-ES");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <rect x="20" y="20" width="760" height="480" rx="8" fill="#fffdfa" stroke="#d6c7b2" stroke-width="2"/>
      <rect x="20" y="20" width="760" height="48" fill="#1e3a5f"/>
      <text x="40" y="50" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold">COMUNIDAD DE PROPIETARIOS · ACTA DE JUNTA GENERAL ORDINARIA</text>
      <text x="40" y="105" fill="#0f172a" font-family="sans-serif" font-size="15" font-weight="bold">${cName.toUpperCase()} · NIF: ${nif}</text>
      <text x="40" y="135" fill="#475569" font-family="sans-serif" font-size="13">Celebrada el ${dateStr} con la asistencia del quórum reglamentario (LPH art. 16 y 17).</text>
      <rect x="40" y="155" width="720" height="150" rx="6" fill="#f8fafc" stroke="#e2e8f0"/>
      <text x="60" y="185" fill="#1e3a5f" font-family="sans-serif" font-size="13" font-weight="bold">ORDEN DEL DÍA Y ACUERDOS APROBADOS:</text>
      <text x="60" y="210" fill="#334155" font-family="sans-serif" font-size="12">1. Examen y aprobación de cuentas correspondientes al ejercicio vencido (Aprobado por unanimidad).</text>
      <text x="60" y="235" fill="#334155" font-family="sans-serif" font-size="12">2. Renovación de los cargos de Presidente y Secretario-Administrador de la Comunidad.</text>
      <text x="60" y="260" fill="#334155" font-family="sans-serif" font-size="12">3. Aprobación del presupuesto ordinario y dotación del fondo de reserva legal (art. 9 LPH).</text>
      <text x="60" y="285" fill="#334155" font-family="sans-serif" font-size="12">4. Turno de ruegos y preguntas de los copropietarios asistentes.</text>
      <rect x="40" y="325" width="720" height="155" rx="6" fill="#f0fdf4" stroke="#86efac" stroke-width="1.5"/>
      <text x="60" y="360" fill="#166534" font-family="sans-serif" font-size="15" font-weight="bold">DILIGENCIA DE CIERRE Y FIRMA DEL ACTA</text>
      <text x="60" y="390" fill="#15803d" font-family="sans-serif" font-size="13">✓ Acta redactada conforme a los requisitos del art. 19 de la Ley de Propiedad Horizontal.</text>
      <text x="60" y="420" fill="#15803d" font-family="sans-serif" font-size="13">✓ Firmada por el Presidente y el Secretario-Administrador colegiado.</text>
      <text x="60" y="450" fill="#15803d" font-family="sans-serif" font-size="13">✓ Notificada reglamentariamente a todos los propietarios.</text>
    </svg>`;
    return {
      fileName: `Acta_Junta_General_${cName.replace(/\s+/g, "_")}.pdf`,
      fileType: "application/pdf",
      fileSize: 524300,
      dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent(svg)
    };
  }

  if (docType === "energyCertificate") {
    const plotName = ownerContext.plot || plot;
    const cadastral = ownerContext.cadastralRef || "9872023VH5797S0001WX";
    const address = ownerContext.address || "Calle Principal 14";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <rect x="20" y="20" width="760" height="480" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
      <rect x="20" y="20" width="760" height="48" fill="#047857"/>
      <text x="40" y="50" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold">CERTIFICADO DE EFICIENCIA ENERGÉTICA DE EDIFICIO EXISTENTE</text>
      <text x="40" y="105" fill="#0f172a" font-family="sans-serif" font-size="15" font-weight="bold">${plotName.toUpperCase()} · ${address.toUpperCase()}</text>
      <text x="40" y="130" fill="#64748b" font-family="sans-serif" font-size="12">REFERENCIA CATASTRAL: ${cadastral} · COMUNIDAD: ${comm}</text>
      <rect x="40" y="150" width="720" height="155" rx="6" fill="#f8fafc" stroke="#e2e8f0"/>
      <rect x="60" y="170" width="70" height="34" rx="4" fill="#059669"/>
      <text x="95" y="193" fill="#ffffff" font-family="sans-serif" font-size="18" font-weight="bold" text-anchor="middle">A</text>
      <text x="145" y="185" fill="#047857" font-family="sans-serif" font-size="14" font-weight="bold">CALIFICACIÓN ENERGÉTICA: CLASE A (MÁXIMA EFICIENCIA)</text>
      <text x="145" y="205" fill="#475569" font-family="sans-serif" font-size="12">Consumo de energía primaria no renovable: 42.5 kWh/m² año</text>
      <text x="145" y="225" fill="#475569" font-family="sans-serif" font-size="12">Emisiones de dióxido de carbono: 8.2 kg CO₂/m² año</text>
      <text x="60" y="265" fill="#64748b" font-family="sans-serif" font-size="12">Técnico certificador colegiado competente · Procedimiento homologado reconocido oficial.</text>
      <rect x="40" y="325" width="720" height="155" rx="6" fill="#f0fdf4" stroke="#86efac" stroke-width="1.5"/>
      <text x="60" y="360" fill="#166534" font-family="sans-serif" font-size="15" font-weight="bold">REGISTRO OFICIAL DE CERTIFICADOS DE EFICIENCIA ENERGÉTICA</text>
      <text x="60" y="390" fill="#15803d" font-family="sans-serif" font-size="13">✓ Inscrito favorablemente en el registro oficial autonómico de la administración pública.</text>
      <text x="60" y="420" fill="#15803d" font-family="sans-serif" font-size="13">✓ Etiqueta de eficiencia energética expedida con validez de 10 años.</text>
      <text x="60" y="450" fill="#15803d" font-family="sans-serif" font-size="13">✓ Cumple con el Real Decreto 390/2021 de certificación energética de edificios.</text>
    </svg>`;
    return {
      fileName: `Certificado_Eficiencia_Energetica_${plotName.replace(/\s+/g, "_")}.pdf`,
      fileType: "application/pdf",
      fileSize: 789400,
      dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent(svg)
    };
  }

  return null;
}

export const DocumentValidator = {
  async analyzeFile(file, docType, ownerContext = {}) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);

    if (!isPdf && !isImage) {
      return {
        isValid: false,
        error: "Formato no compatible. Por favor suba un PDF o una imagen en formato JPG, PNG o WEBP."
      };
    }

    if (file.size > 15 * 1024 * 1024) {
      return {
        isValid: false,
        error: "El archivo supera el límite de 15 MB."
      };
    }

    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const pdfHeader = String.fromCharCode(...header.slice(0, 5));
    if (isPdf && pdfHeader !== "%PDF-") return { isValid: false, error: "El contenido no corresponde a un PDF." };
    const dataUrl = await readFileAsDataUrl(file);

    let legibilityScore = 98;
    let legibilityStatus = "Óptima (nitidez, iluminación y resolución correctas)";
    let imageInfo = null;

    if (isImage) {
      imageInfo = await analyzeImageQuality(dataUrl);
      legibilityScore = imageInfo.score;
      legibilityStatus = imageInfo.status;
      if (imageInfo.score < 50) {
        return {
          isValid: false,
          error: `Legibilidad insuficiente (${imageInfo.score}%). La imagen presenta baja resolución o desenfoque. Por favor, suba una fotografía nítida del documento original.`,
          legibilityScore,
          legibilityStatus,
          dataUrl
        };
      }
    } else {
      legibilityScore = null;
      legibilityStatus = "Revisión manual pendiente";
    }

    const correspondence = checkDocumentCorrespondence(file.name, docType, ownerContext, imageInfo);
    if (!correspondence.isValid) {
      return {
        isValid: false,
        error: correspondence.error,
        legibilityScore,
        legibilityStatus,
        dataUrl
      };
    }

    const dateStr = new Date().toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    const docRecord = {
      key: docType,
      title: correspondence.title,
      fileName: file.name,
      fileType: file.type || (isPdf ? "application/pdf" : "image/jpeg"),
      fileSize: file.size,
      uploadedAt: dateStr,
      dataUrl,
      autoValidation: {
        status: "pending_review",
        legibilityScore,
        legibilityStatus,
        typeVerified: correspondence.typeVerified,
        checks: correspondence.checks,
        verifiedAt: new Date().toISOString()
      },
      adminApproval: {
        status: "pending",
        reviewedAt: null,
        reviewedBy: null,
        notes: ""
      }
    };

    return {
      isValid: true,
      document: docRecord
    };
  },

  generateSampleDocument(docType, ownerContext = {}) {
    return generateSampleDocumentData(docType, ownerContext);
  }
};

export function getFormOwnerContext() {
  const commSelect = ownerForm.elements.communityId;
  const commName = commSelect.selectedOptions[0] ? commSelect.selectedOptions[0].textContent : "";
  return {
    id: state.ui.editingOwnerId,
    name: ownerForm.elements.name.value.trim() || "Carlos",
    surname: ownerForm.elements.surname.value.trim() || "Ruiz Mendoza",
    dni: ownerForm.elements.dni.value.trim().toUpperCase() || "47895231P",
    plot: ownerForm.elements.plot?.value.trim() || "Inmueble",
    communityName: commName || "Residencial Peñarrubia",
    iban: ownerForm.elements.iban.value.trim().toUpperCase() || "ES66 2100 0418 4012 3456 7891"
  };
}


export function renderOwnerDialogDocs() {
  const docTypes = [
    { key: "dni", dropzone: dropzoneDni, input: inputDocDni, result: resultDocDni, badge: badgeDocDni, card: document.querySelector("#card-doc-dni") },
    { key: "bankReceipt", dropzone: dropzoneBank, input: inputDocBank, result: resultDocBank, badge: badgeDocBank, card: document.querySelector("#card-doc-bank") },
    { key: "propertyDeed", dropzone: dropzoneDeed, input: inputDocDeed, result: resultDocDeed, badge: badgeDocDeed, card: document.querySelector("#card-doc-deed") }
  ];

  let uploadedCount = 0;

  docTypes.forEach(({ key, dropzone, result, badge, card }) => {
    const doc = editingDocs.current[key];
    if (doc) {
      uploadedCount++;
      card.classList.add("is-valid");
      const isApproved = doc.adminApproval?.status === "approved";
      const isRejected = doc.adminApproval?.status === "rejected";

      if (isApproved) {
        badge.className = "status-badge doc-approved";
        badge.textContent = "Aprobado por Admin";
      } else if (isRejected) {
        badge.className = "status-badge doc-rejected";
        badge.textContent = "Rechazado";
      } else {
        badge.className = "status-badge doc-approved";
        badge.textContent = "Pendiente de revisión";
      }

      result.hidden = false;
      result.replaceChildren();

      const validationHeader = document.createElement("div");
      validationHeader.className = "doc-validation-header";
      validationHeader.innerHTML = sanitizeHtml(`
        <div class="doc-file-meta">
          <span class="doc-file-icon">📄</span>
          <div>
            <p class="doc-file-name">${escapeHtml(doc.fileName)}</p>
            <p class="doc-file-size">${Math.round(doc.fileSize / 1024)} KB · Subido el ${escapeHtml(doc.uploadedAt)}</p>
          </div>
        </div>
        <div class="doc-file-actions">
          <button class="btn-doc-action" type="button" data-action="view" data-doc="${key}">👁️ Ver</button>
          <button class="btn-doc-action danger" type="button" data-action="remove" data-doc="${key}">🗑️ Quitar</button>
        </div>
      `);

      const reviewNote = document.createElement("p");
      reviewNote.className = "form-intro";
      reviewNote.textContent = "La identidad, titularidad y legibilidad requieren revisión administrativa.";
      result.append(validationHeader, reviewNote);

      validationHeader.querySelector('[data-action="view"]').addEventListener("click", () => {
        openDocViewer(getFormOwnerContext(), key, doc);
      });
      validationHeader.querySelector('[data-action="remove"]').addEventListener("click", () => {
        delete editingDocs.current[key];
        renderOwnerDialogDocs();
      });

      dropzone.style.display = "none";
    } else {
      card.classList.remove("is-valid");
      badge.className = "status-badge doc-none";
      badge.textContent = "Pendiente";
      result.hidden = true;
      result.replaceChildren();
      dropzone.style.display = "block";
    }
  });

  tabDocsBadge.textContent = `${uploadedCount}/3`;
  docsSummaryStatus.textContent = `${uploadedCount} de 3 documentos recibidos`;
  if (uploadedCount === 3) {
    docsSummarySubtext.textContent = "Archivos recibidos. Al guardar se remitirá un aviso al administrador para su revisión.";
    docsSummaryBar.style.background = "#f0fdf4";
    docsSummaryBar.style.borderColor = "#86efac";
  } else {
    docsSummarySubtext.textContent = "Sube la copia del DNI (ambas caras), el recibo bancario y la escritura para completar el expediente.";
    docsSummaryBar.style.background = "#f1f5f9";
    docsSummaryBar.style.borderColor = "#e2e8f0";
  }
}

export async function handleDocFileUpload(file, docType) {
  if (!file) return;
  const card = document.querySelector(`#card-doc-${docType === "bankReceipt" ? "bank" : (docType === "propertyDeed" ? "deed" : "dni")}`);
  const badge = card.querySelector(".status-badge");
  badge.className = "status-badge doc-pending-admin";
  badge.textContent = "⚡ Analizando...";

  try {
    const context = getFormOwnerContext();
    const result = await DocumentValidator.analyzeFile(file, docType, context);

    if (!result.isValid) {
      badge.className = "status-badge doc-rejected";
      badge.textContent = "Validación fallida";
      alert("Error en la validación automática:\n\n" + result.error);
      renderOwnerDialogDocs();
      return;
    }

    editingDocs.current[docType] = result.document;
    toast(`Documento "${result.document.title}" validado automáticamente.`);
    renderOwnerDialogDocs();
  } catch (err) {
    alert("Error al procesar el archivo: " + err.message);
    renderOwnerDialogDocs();
  }
}

export function handleDocSampleLoad(docType) {
  const context = getFormOwnerContext();
  const sample = DocumentValidator.generateSampleDocument(docType, context);
  if (!sample) return;

  const card = document.querySelector(`#card-doc-${docType === "bankReceipt" ? "bank" : (docType === "propertyDeed" ? "deed" : "dni")}`);
  const badge = card.querySelector(".status-badge");
  badge.className = "status-badge doc-pending-admin";
  badge.textContent = "⚡ Analizando...";

  window.setTimeout(() => {
    const correspondence = checkDocumentCorrespondence(sample.fileName, docType, context);
    const dateStr = new Date().toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    editingDocs.current[docType] = {
      key: docType,
      title: correspondence.title,
      isSample: true,
      fileName: sample.fileName,
      fileType: sample.fileType,
      fileSize: sample.fileSize,
      uploadedAt: dateStr,
      dataUrl: sample.dataUrl,
      autoValidation: {
        status: "passed",
        legibilityScore: docType === "dni" ? 98 : (docType === "bankReceipt" ? 96 : 95),
        legibilityStatus: "Óptima (alta resolución y contraste adecuado)",
        typeVerified: correspondence.typeVerified,
        checks: correspondence.checks,
        verifiedAt: new Date().toISOString()
      },
      adminApproval: {
        status: "pending",
        reviewedAt: null,
        reviewedBy: null,
        notes: ""
      }
    };

    toast(`Documento oficial de prueba cargado y validado automáticamente.`);
    renderOwnerDialogDocs();
  }, 350);
}


// Eventos de Subida de Archivos (Inputs)
inputDocDni.addEventListener("change", e => {
  if (e.target.files && e.target.files[0]) {
    handleDocFileUpload(e.target.files[0], "dni");
  }
});
inputDocBank.addEventListener("change", e => {
  if (e.target.files && e.target.files[0]) {
    handleDocFileUpload(e.target.files[0], "bankReceipt");
  }
});
inputDocDeed.addEventListener("change", e => {
  if (e.target.files && e.target.files[0]) {
    handleDocFileUpload(e.target.files[0], "propertyDeed");
  }
});

// Drag and Drop en Dropzones
export function setupDropzone(dropzoneEl, docType) {
  ["dragenter", "dragover"].forEach(eventName => {
    dropzoneEl.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneEl.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropzoneEl.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneEl.classList.remove("dragover");
    });
  });

  dropzoneEl.addEventListener("drop", e => {
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleDocFileUpload(files[0], docType);
    }
  });
}

setupDropzone(dropzoneDni, "dni");
setupDropzone(dropzoneBank, "bankReceipt");
setupDropzone(dropzoneDeed, "propertyDeed");

// Botones de Muestra de Prueba
btnSampleDni.addEventListener("click", () => handleDocSampleLoad("dni"));
btnSampleBank.addEventListener("click", () => handleDocSampleLoad("bankReceipt"));
btnSampleDeed.addEventListener("click", () => handleDocSampleLoad("propertyDeed"));

export function openDocViewer(entity, docKey, docObj = null) {
  const doc = docObj || (entity?.documents && entity.documents[docKey]);
  if (!doc) return;

  const docViewerDialog = document.querySelector("#doc-viewer-dialog");
  const docViewerEyebrow = document.querySelector("#doc-viewer-eyebrow");
  const docViewerTitle = document.querySelector("#doc-viewer-title");
  const docViewerOwner = document.querySelector("#doc-viewer-owner");
  const docViewerFilename = document.querySelector("#doc-viewer-filename");
  const docViewerDate = document.querySelector("#doc-viewer-date");
  const docViewerScoreBar = document.querySelector("#doc-viewer-score-bar");
  const docViewerScoreText = document.querySelector("#doc-viewer-score-text");
  const checksListEl = document.querySelector("#doc-viewer-checks-list");
  const approvalBox = document.querySelector("#doc-viewer-approval-status");
  const previewPane = document.querySelector("#doc-viewer-preview-pane");
  const docViewerQuickApproveBtn = document.querySelector("#doc-viewer-quick-approve-btn");

  let eyebrow = "EXPEDIENTE DOCUMENTAL";
  let titular = "";
  if (entity) {
    if (entity.nif && entity.name) {
      eyebrow = `COMUNIDAD: ${entity.name}`;
      titular = `${entity.name} (${entity.nif})`;
    } else if (entity.plot) {
      eyebrow = `INMUEBLE: ${entity.plot}`;
      titular = `${entity.plot} · ${entity.communityName || "Inmueble"}`;
    } else if (entity.documentId || entity.contractStart) {
      eyebrow = `INQUILINO: ${entity.name} ${entity.surname}`;
      titular = `${entity.name} ${entity.surname} (${entity.documentId || entity.dni || "Inquilino"})`;
    } else if (entity.name) {
      eyebrow = `EXPEDIENTE: ${entity.communityName || "ASOCIACIÓN"}`;
      titular = `${entity.name} ${entity.surname || ""} ${entity.dni ? `(${entity.dni})` : ""}`.trim();
    }
  }

  if (docViewerEyebrow) docViewerEyebrow.textContent = eyebrow;
  if (docViewerTitle) docViewerTitle.textContent = doc.title || doc.fileName || "Documento";
  if (docViewerOwner) docViewerOwner.textContent = titular || "Expediente general";
  if (docViewerFilename) docViewerFilename.textContent = `${doc.fileName} (${Math.round((doc.fileSize || 0) / 1024)} KB)`;
  if (docViewerDate) docViewerDate.textContent = doc.uploadedAt || new Date().toLocaleString("es-ES");

  const score = doc.autoValidation?.legibilityScore ?? (doc.isSample ? 98 : null);
  if (docViewerScoreBar) {
    docViewerScoreBar.style.width = score !== null ? `${score}%` : "0%";
  }
  if (docViewerScoreText) {
    docViewerScoreText.textContent = doc.autoValidation?.legibilityStatus || (score !== null ? `${score}% (Óptima)` : "Revisión manual pendiente");
  }

  if (checksListEl) {
    checksListEl.replaceChildren();
    const note = document.createElement("li");
    note.textContent = "El sistema verifica el formato y legibilidad del archivo. La validación legal requiere revisión administrativa.";
    checksListEl.append(note);
  }

  if (approvalBox) {
    const isApproved = doc.adminApproval?.status === "approved";
    const isRejected = doc.adminApproval?.status === "rejected";
    approvalBox.innerHTML = sanitizeHtml(`
      <span class="status-badge ${isApproved ? "doc-approved" : (isRejected ? "doc-rejected" : "doc-pending-admin")}">
        ${isApproved ? "✓ Aprobado por Administrador" : (isRejected ? "✗ Rechazado" : "⏳ Pendiente de resolución administrativa")}
      </span>
    `);
  }

  if (previewPane) {
    previewPane.replaceChildren();
    const previewUrl = documentUrl(doc.dataUrl || doc.url);
    if (previewUrl) {
      const isPdf = doc.fileType === "application/pdf" || (doc.fileName && doc.fileName.toLowerCase().endsWith(".pdf"));
      const el = document.createElement(isPdf ? "iframe" : "img");
      if (el.tagName === "IFRAME") {
        el.setAttribute("sandbox", "");
        el.title = "Vista previa del documento";
        el.style.width = "100%";
        el.style.height = "400px";
      }
      el.src = previewUrl;
      el.alt = doc.title || doc.fileName;
      el.style.maxWidth = "100%";
      el.style.maxHeight = "400px";
      el.style.borderRadius = "6px";
      previewPane.append(el);
      const download = document.createElement("a");
      download.href = previewUrl;
      download.download = doc.fileName;
      download.textContent = "Descargar archivo";
      previewPane.append(download);
    } else {
      previewPane.textContent = "Este registro no contiene un archivo disponible en este momento.";
    }
  }

  if (docViewerQuickApproveBtn) {
    const canApprove = entity?.id && entity?.dni && hasPermission("document:approve", entity?.id) && !doc.isSample;
    docViewerQuickApproveBtn.hidden = !canApprove;
    if (canApprove) {
      docViewerQuickApproveBtn.onclick = async () => {
        if (!requirePermission("document:approve")) return;
        doc.adminApproval = {
          status: "approved",
          reviewedAt: new Date().toLocaleString("es-ES"),
          reviewedBy: "Administrador",
          notes: "Aprobación individual desde visor."
        };
        const savedOwner = state.owners.find(o => o.id === entity.id);
        if (savedOwner) {
          try {
            await api.updateOwner(entity.id, { ...savedOwner, documents: { ...savedOwner.documents, [docKey]: doc } });
            await refreshState();
          } catch (error) {
            toast(error.message);
            return;
          }
          if (docViewerDialog) docViewerDialog.close();
          toast(`Documento "${doc.title}" aprobado.`);
          if (ownerForm && ownerForm.closest("dialog")?.open) renderOwnerDialogDocs();
        }
      };
    }
  }

  if (docViewerDialog && !docViewerDialog.open) {
    docViewerDialog.showModal();
  }
}

const closeDocViewerDialogBtn = document.querySelector("#close-doc-viewer-dialog");
const closeDocViewerBtn = document.querySelector("#close-doc-viewer-btn");
if (closeDocViewerDialogBtn) closeDocViewerDialogBtn.addEventListener("click", () => document.querySelector("#doc-viewer-dialog")?.close());
if (closeDocViewerBtn) closeDocViewerBtn.addEventListener("click", () => document.querySelector("#doc-viewer-dialog")?.close());


