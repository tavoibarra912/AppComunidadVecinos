# Registro de actividades de tratamiento (RGPD, art. 30)

Plantilla cumplimentable para la comunidad de propietarios o asociación que usa esta
aplicación. El registro es un **documento del responsable** (la comunidad/asociación, a
través de su administración); la plataforma actúa como **encargado del tratamiento** y
aporta esta plantilla, la guía y la página `public/informacion-tratamientos.html` con lo
que el software hace realmente.

No es un módulo de cumplimiento ni sustituye al asesoramiento jurídico: describe
actividades, finalidades y plazos, no implementa flujos de aprobación ni versionado.

## Cómo cumplimentarlo

1. **Identifica al responsable** (nombre de la comunidad o asociación, NIF, dirección y
   persona de contacto) y al **encargado** (quien presta el servicio de la aplicación),
   con su contrato de encargo (art. 28).
2. **Revisa cada actividad** de la tabla: si la comunidad no la realiza, elimina la fila;
   si añade una nueva, describe datos, finalidad, base legal, destinatarios y plazo.
3. **Ajusta los plazos de conservación** a la política aprobada por la comunidad. Los
   plazos contables (6 años, Código de Comercio) y los de seguridad son mínimos: no se
   pueden acortar por debajo de la obligación legal.
4. **Documenta las decisiones de productos pendientes**: si se expone la purga de datos
   históricos en la interfaz, si se conserva el acta de borrado con la ficha anonimizada
   y durante cuánto tiempo, y qué canales externos están habilitados.
5. **Registra las medidas de seguridad** aplicables: control de acceso por rol y ámbito,
   sesiones revocables, auditoría de accesos y de operaciones sensibles, cifrado en
   tránsito, copias de seguridad y su plazo de restauración.
6. **Firma y fecha** el registro, y revísalo cuando cambie una actividad, un proveedor o
   un plazo. Guarda la versión anterior.

## Plantilla

| Actividad | Datos tratados | Finalidad | Base legal | Destinatarios / encargados | Conservación | Medidas de seguridad |
| --- | --- | --- | --- | --- | --- | --- |
| Censo y titularidad | Identidad, DNI/NIE, contacto, dirección, IBAN, coeficiente o porcentaje, documentos del expediente | Gestión de la comunidad o asociación, convocatorias y votaciones | Relación asociativa o contractual; obligación legal (LPH, art. 9) | Administración de la comunidad; no se cede salvo obligación legal | Mientras dure la relación y los plazos legales | Permisos por comunidad y por recurso, auditoría de accesos, sesiones revocables |
| Cuotas, derramas y servicios | Recibos, pagos, imputaciones, saldos, justificantes, lecturas de contador | Facturación y cobro de la comunidad | Obligación legal contable y fiscal; relación asociativa | Administración; entidades bancarias solo si el responsable lo gestiona fuera de la app | Conservación contable (6 años, Código de Comercio) | Permisos `fee:read` / `fee:manage` / `fee:purge` separados, auditoría de caja |
| Comunicaciones | Cuenta, destinatarios, lectura y confirmación, consentimientos por canal y oposición | Avisos, convocatorias y participación | Interés legítimo o relación asociativa; **consentimiento** para canales externos; **oposición** para cesar los envíos | Proveedores de email, SMS o WhatsApp si están activados (encargados) | Mientras sean necesarias; consentimiento revocable y oposición prevalente | Historial de consentimientos, sin consentimiento no se envía nada |
| Documentos y actas | Archivos, autoría, versiones y adjuntos de comunicaciones | Gestión documental y prueba de acuerdos | Relación asociativa; obligación legal (actas) | Administración y destinatarios autorizados | Actas: permanentes; resto según la política del responsable | Permisos de biblioteca, inmutabilidad de adjuntos emitidos |
| Auditoría y seguridad | Accesos, cambios, IP, resultado y detalle de la operación | Seguridad, prevención de abuso y trazabilidad | Interés legítimo (seguridad) | Personal autorizado con `audit:read` | Plazo de seguridad definido por el responsable | Registro sin API de modificación ni borrado |
| Solicitudes de derechos y bajas | Identidad, motivo, estado, plazo y resolución | Atender los derechos del interesado | Obligación legal (RGPD, arts. 12 y 17) | Administración | Mientras se tramita y el plazo de prueba de la respuesta | Solicitud con contraseña, anti-duplicado, resolución auditada |
| Copias de seguridad | Copia íntegra de la base de datos y de los archivos | Recuperación ante incidentes | Interés legítimo (continuidad) | Proveedor de infraestructura (encargado) | Plazo definido por el responsable; rotación y destrucción segura | Cifrado en reposo, acceso restringido, pruebas de restauración |

## Cláusulas que la comunidad debe decidir

- **Supresión y conservación**: la baja de cuenta anonimiza la identidad y conserva
  recibos, cobros, actas y auditoría; la copia de la ficha que queda en el acta de un
  borrado avanzado se anonimiza al suprimir la cuenta.
- **Categorías especiales**: la aplicación no trata datos de salud ni de menores; si la
  comunidad incorpora fotografías de personas identificables, debe abrir una actividad
  nueva y revisar la base legal.
- **Transferencias internacionales**: solo si el proveedor de email, SMS, WhatsApp, base de
  datos o infraestructura las realiza; se documentan en el contrato de encargo.
- **Plazo de respuesta a derechos**: un mes desde la solicitud (prorrogable dos meses
  más en casos complejos). La solicitud de baja muestra la fecha límite en la aplicación.

## Relación con el aviso del art. 13

El aviso de privacidad de la aplicación (`Mi perfil → Privacidad y datos → Aviso de
privacidad`) informa al interesado; este registro documenta lo mismo desde el lado del
responsable. Si cambia uno, debe cambiar el otro: la página
`public/informacion-tratamientos.html` resume las actividades reales para que ambos
textos no se contradigan.
