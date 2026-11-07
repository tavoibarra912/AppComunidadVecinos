# Handoff para Copilot — Auditoría de accesos y recuperación de contraseña

## Qué se implementó (y ya está verificado)

Issues relacionados: #142 (RBAC y auditoría de accesos) y #141 (Autenticación segura, parte recuperación).

### 1) Auditoría general de seguridad
- `src/audit.js` — tabla `access_audit` (fecha, actor, evento, resultado, recurso, IP, detalle JSON) + middleware `auditRequests` que registra: logins correctos/fallidos (`login`), logout, accesos denegados 401/403 (`access-denied`), altas/cambios/bajas de usuarios y roles (con `before`/`after` de campos administrativos), `users.password-changed`, y eventos de recuperación. Nunca registra contraseñas, cookies, tokens, cuerpos ni query strings (rutas anonimizadas a `:id`).
- API `GET /api/audit?limit&offset&action` en `src/routes/index.js`, protegida por `requirePermission("audit:read")`.
- `public/js/permissions.js` — `audit:read` es permiso **global**: los roles `user` y `community_admin` nunca lo reciben.
- UI: pestaña **Administración → Auditoría** (`public/js/features/audit.js`, tabla con filtro, paginación y detalle expandible) + entrada `listAudit` en `public/js/api.js` + tab y pane en `public/index.html`.

### 2) Recuperación de contraseña por SMTP
- `src/password-recovery.js` — `requestRecovery(email, req)`, `resetRecoveredPassword(token, password, req)`, `processRecoveryMail(send)`, `recoverInterruptedMail()`, `sendRecoveryEmail`, `recoveryUrl`.
  - Respuesta idéntica para email existente/inexistente/inactivo (`RECOVERY_MESSAGE`): no enumera cuentas.
  - Token aleatorio de 32 bytes (64 hex); en `users.resetToken` solo se guarda su **hash SHA-256**; vence a los 30 minutos; un solo uso; una nueva solicitud invalida la anterior.
  - Cooldown: 1 solicitud/min por dirección (tabla `password_recovery_requests`, con hash del email).
  - Cola `password_recovery_mail`: payload (URL con token) **cifrado con AES-256-GCM** (mismo `seal` de proveedores) y **borrado tras el envío**. Sin reintento automático; fallo/interrupción invalida el token y se audita el resultado.
  - El enlace se construye SOLO desde `APP_PUBLIC_URL` (nunca del Host header); HTTPS exigido en producción, HTTP localhost solo en desarrollo.
- `src/routes/auth.js` — `POST /auth/forgot-password` y `POST /auth/reset-password` conectados; al reset con `BEGIN IMMEDIATE` + `setPassword` (revoca sesiones). Desactivar usuario o cambiar su email desde `src/routes/admin.js` invalida enlaces pendientes.
- `src/communication-worker.js` — el worker procesa `processRecoveryMail()` antes de las comunicaciones y llama `recoverInterruptedMail()` al arrancar.
- Frontend: `#reset-password=<token>` abre el formulario (fragmento: no viaja al servidor; se borra del historial con `history.replaceState`); confirmación de contraseña; al éxito vuelve al login con aviso, sin auto-login.
- `<meta name="referrer" content="no-referrer">` en `index.html`.
- `README.md` documenta requisitos (`APP_PUBLIC_URL` + SMTP configurado) y el comportamiento.

## Cómo probar / verificar
- `npm test` — 83/83. Nueva cobertura: `scripts/tests/security-flows.test.mjs` (Express invocado en memoria, sin sockets; SMTP inyectado) y `scripts/tests/security-ui.test.mjs` (DOM simulado con `vm`).
- Humo con server real: `node .kimchi/docs/smoke-audit-recovery.mjs` (puerto 3456, datos en temporales). 12 comprobaciones OK.
- Para probar manual: levantar `npm run restart`, entrar como `admin/admin`, pestaña Administración → Auditoría. Para recuperación hace falta configurar SMTP (Administración → Configuración → Proveedores) y `APP_PUBLIC_URL=http://localhost:3000`.

## Pendientes / riesgos (para decisión)
- **Sin retención de auditoría**: no hay rotación ni borrado por política; definirla para producción.
- **Recuperación requiere SMTP real configurado**: sin eso, `/forgot-password` devuelve 503 (deliberado, no finge envío).
- `APP_PROVIDER_KEY`/`APP_PUBLIC_URL` son de despliegue: en prod, HTTPS + APP_PUBLIC_URL apuntando al dominio.
- El permiso `audit:read` existe en el catálogo desde antes; **no** se agregó al rol `administrator` deliberadamente (permiso global sensible).
- MFA sigue fuera de alcance (#141 parcial: login, sesiones y recuperación hechos; MFA no).
- Push nativo/Firebase sigue sin implementar (#134 parcial).

## Commits
Todo va a la rama `features/md-improvements-backend-login`. Referenciar issues #141 y #142 en el mensaje.
