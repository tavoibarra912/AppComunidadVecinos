// Plantillas de los textos que la plataforma envía por email/SMS/WhatsApp.
// Placeholders: {{plataforma}}, {{titulo}}, {{texto}}, {{comunidad}}, {{fecha}}, {{enlace}}.

export const TEXTOS_DEFECTO = {
  emailAvisoAsunto: "Nueva publicación en {{plataforma}}",
  emailAvisoCuerpo: "{{texto}}\n\nIngresá en {{plataforma}} y abrí Comunicación para consultar los detalles.",
  smsAviso: "{{titulo}}. Ingresá en {{plataforma}} y abrí Comunicación para consultar los detalles.",
  whatsappAviso: "{{titulo}}. Ingresá en {{plataforma}} y abrí Comunicación para consultar los detalles.",
  emailRecordatorioAsunto: "Recordatorio: {{titulo}}",
  recordatorioTexto: "Recordatorio: {{titulo}} inicia el {{fecha}}. Ingresá en {{plataforma}} y abrí Comunicación para consultar los detalles.",
  emailRecuperacionAsunto: "Recuperar tu contraseña de {{plataforma}}",
  emailRecuperacionTexto: "Solicitaste recuperar tu contraseña de {{plataforma}}. Abrí este enlace (válido durante 30 minutos y para un solo uso):\n\n{{enlace}}\n\nSi no lo solicitaste, ignorá este correo. Tu contraseña no cambió.",
  pruebaTexto: "Mensaje de prueba de la configuración de envíos de {{plataforma}}.",
  cambioAsunto: "Cambio en {{perfil}} — {{plataforma}}",
  cambioCuerpo: "El usuario {{usuario}} actualizó el perfil de {{perfil}} ({{comunidad}}) el {{fecha}}.\n\nCambios realizados:\n{{cambios}}\n\n— {{plataforma}}",
};

export function textosDe(ajustes) {
  return { ...TEXTOS_DEFECTO, ...(ajustes?.textos || {}) };
}

export function nombreDe(ajustes) {
  return ajustes?.marca?.nombre || "la plataforma";
}

export function aplicarPlantilla(plantilla, valores = {}) {
  return String(plantilla || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, clave) => {
    const valor = valores[clave];
    return valor === undefined || valor === null ? "" : String(valor);
  });
}
