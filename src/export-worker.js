import { parentPort, workerData } from "node:worker_threads";
import { generateCsv, generateXlsx, generatePdf } from "./export-generators.js";
try {
  const generators = { csv: generateCsv, xlsx: generateXlsx, pdf: generatePdf };
  const buffer = await generators[workerData.format](workerData);
  if (buffer.length > workerData.maxBytes)
    parentPort.postMessage({
      error: "El archivo supera el tamaño permitido. Acota los filtros.",
      status: 413,
    });
  else parentPort.postMessage({ buffer });
} catch {
  parentPort.postMessage({
    error: "No se pudo generar el archivo. Inténtalo de nuevo.",
    status: 500,
  });
}
