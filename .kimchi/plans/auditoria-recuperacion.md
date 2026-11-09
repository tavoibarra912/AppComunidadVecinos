# Goal
Agregar auditoría general y recuperación de contraseña por SMTP.

# Constraints
Sin nuevas dependencias, sin iniciar servidores ni enviar correos reales durante la verificación. Conservar cambios concurrentes. Auditoría global accesible solo por audit:read.

# Chunks
## 1. Auditoría persistente y consulta
- Files Changed: src/audit.js, src/routes/index.js, src/routes/auth.js, public/js/api.js, public/js/features/administracion.js, public/js/features/navigation.js, public/index.html.
- Interfaces: recordAudit(event), auditRequests(req,res,next), GET /api/audit?offset=&limit=&action=.
- Registrar logins correctos/fallidos, accesos 401/403, logout y altas/cambios/bajas de usuarios/roles. Actor, destino, resultado, fecha, IP y campos modificados permitidos; nunca cuerpos ni credenciales. Consulta paginada y pestaña Administración/Auditoría.
- Depends On: ninguna.
- Accept When: historial persistente protegido por audit:read; usuarios y administradores de comunidad no reciben acceso implícito.
- Test Coverage: scripts/tests/security-flows.test.mjs (nuevo), scripts/tests/static.test.mjs.
- Open Questions: ninguna.

## 2. Recuperación SMTP segura
- Files Changed: src/password-recovery.js, src/routes/auth.js, src/communication-worker.js, public/js/features/auth.js, public/js/main.js, public/index.html, README.md.
- Interfaces: requestRecovery(email), resetRecoveredPassword(token,password), processRecoveryMail(send).
- Token aleatorio de 32 bytes; hash en users; copia cifrada temporal en cola SMTP, borrada al terminar. Caduca en 30 minutos, un uso; reset atómico revoca sesiones. Un envío por minuto por dirección (hash), además del límite IP existente. Mismo mensaje para email inexistente/inactivo y existente. APP_PUBLIC_URL confiable, HTTPS en producción; HTTP solo loopback en desarrollo. Fragmento #reset-password= retirado del historial al cargar. Confirmación doble en formulario.
- Depends On: 1.
- Accept When: SMTP permite solicitar enlace, cambiar contraseña y volver al login; tokens vencidos/reutilizados rechazados. Fallos SMTP auditados sin fingir entrega. SMTP no disponible devuelve 503 global sin enumerar usuarios.
- Test Coverage: scripts/tests/security-flows.test.mjs; revisar expectativa de recuperación en scripts/tests/api.integration.test.mjs (no ejecutar pruebas que abren sockets sin autorización).
- Open Questions: ninguna; credenciales y APP_PUBLIC_URL son configuración de despliegue.

# Verification Strategy
DB temporal, transporte inyectado y router/middleware invocado en memoria sin sockets. node --check, auditoría estática y pruebas unitarias. Revisar diff final. No ejecutar npm test completo porque incluye servidores HTTP.

# Decision Log
- Reutilizar Nodemailer y cifrado existentes; API verificada en https://nodemailer.com/smtp.
- Cola persistente para respuesta desacoplada del tiempo SMTP. Sin reintento automático ante envío incierto.
- Recuperación según https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html: token aleatorio, hash, vencimiento, un uso, URL confiable y revocación de sesiones.
- MFA y push fuera del pedido.

# Risks
SMTP requiere configuración real; aceptación no equivale a entrega. Auditoría sensible sin endpoint de borrado; retención operacional pendiente de política de producción. APP_PUBLIC_URL y worker activo necesarios para recuperación.
