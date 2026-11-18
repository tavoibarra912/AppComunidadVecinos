# Plan de diseño: Borrado en cascada tipo Wizard

**Rama:** `feat/cascade-delete-wizard` (desde `main`)
**Estado:** Solo planificación. No se implementa lógica de borrado destructiva aún.
**Issues relacionados:** #195 (Eliminar comunidades), #196 (Eliminar propietarios)

---

## 1. Objetivo

Permitir a un usuario con un permiso nuevo (ej. `cascade-delete`) borrar una entidad (comunidad, propietario, inmueble o inquilino) a través de un **wizard multi-paso** que:

1. Evalúe automáticamente qué dependencias tiene la entidad (inmuebles, cuotas, inquilinos, notificaciones, documentos, publicaciones, etc.).
2. Ofrezca opciones por cada dependencia: reasignar, dejar huérfano, liquidar, mover a otra comunidad, crear comunidad temporal, etc.
3. Ejecute el borrado en una transacción solo tras confirmación explícita del usuario.


---

## 2. Nuevo permiso

Se propone agregar un permiso maestro y, opcionalmente, permisos granulares por entidad:

| Permiso | Descripción | Rol por defecto |
|---------|-------------|-----------------|
| `cascade-delete` | Borrado en cascada de entidades con dependencias | `super_admin` |
| `owner:cascade-delete` | Borrado en cascada de propietarios | `super_admin` |
| `community:cascade-delete` | Borrado en cascada de comunidades | `super_admin` |
| `property:cascade-delete` | Borrado en cascada de inmuebles | `super_admin` |
| `tenant:cascade-delete` | Borrado en cascada de inquilinos | `super_admin` |

**Archivos a tocar (solo definición, sin uso todavía):**
- `public/js/permissions.js` — agregar entradas en `PERMISSIONS` y etiquetas en `PERMISSION_LABELS`.
- `src/db.js` — agregar permisos a los roles del sistema si se desea.
- `public/js/features/administracion.js` — opcional: exponer en la pestaña de Roles para asignar el permiso.


---

## 3. Arquitectura del wizard

### 3.1 Endpoints backend (propuestos, sin tocar rutas existentes)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/:entity/:id/cascade-preview` | Devuelve el árbol de dependencias de la entidad y las opciones disponibles por cada una. Requiere permiso `cascade-delete` (o granular). |
| `DELETE` | `/api/:entity/:id?cascade=true` | Ejecuta el borrado en cascada con las acciones elegidas. Cuerpo JSON con el plan de acciones. Requiere permiso y confirmación. |

` :entity` ∈ `communities`, `owners`, `properties`, `tenants`.

### 3.2 Flujo del wizard (frontend)

```
Paso 1: Selección de entidad
  └─ Usuario hace clic en "Eliminar (avanzado)" en propietario / inquilino / inmueble / comunidad

Paso 2: Evaluación de dependencias
  └─ El backend devuelve qué hay asociado y opciones válidas por cada uno

Paso 3: Configuración de acciones por dependencia
  ├─ Para cada inmueble: [Reasignar a otro propietario] [Dejar huérfano] [Mover a otra comunidad]
  ├─ Para cada inquilino: [Reasignar a otro inmueble] [Dar de baja] [Mover con el inmueble]
  ├─ Para cuotas/recibos: [Anular y liquidar final] [Dejar como histórico huérfano] [Mover a otra comunidad]
  ├─ Para notificaciones/documentos: [Borrar] [Conservar como histórico]
  └─ Para sub-entidades: [Crear comunidad temporal y mover todo ahí]

Paso 4: Resumen y confirmación
  ├─ Listado de lo que se borrará, reasignará o dejará huérfano
  ├─ Advertencia si hay datos financieros afectados
  └─ Checkbox "Entiendo que esta acción no se puede deshacer"

Paso 5: Ejecución
  ├─ Llamada a DELETE con cuerpo de acciones
  ├─ Respuesta con resultado (OK / errores parciales)
  └─ Redirección o toast de resultado
```


---

## 4. Reglas por entidad (qué se evalúa y opciones)

### 4.1 Propietario (`owners`)

**Dependencias a evaluar:**
- Inmuebles donde es titular (`properties.ownerIds` incluye su id)
- Inquilinos vinculados a esos inmuebles (`tenants.ownerId` o `tenants` en `property.tenantIds`)
- Recibos de cuotas donde aparece en `snapshot.owners` (`fee_receipts`)
- Pagos (`fee_payments.ownerId`)
- Notificaciones (`owner_notifications.ownerId`, `admin_emails.ownerId`)
- Documentos del expediente (`owners.documents`)
- Usuario vinculado (`owners.userId`)

**Opciones por dependencia:**
| Dependencia | Opciones |
|-------------|----------|
| Inmueble sin inquilino | Reasignar a otro propietario / Dejar huérfano (quitar de ownerIds) / Borrar inmueble también |
| Inmueble con inquilino | Reasignar propietario e inquilino juntos / Mover inquilino a otro inmueble / Bloquear borrado hasta desvincular |
| Cuotas con snapshot | Dejar como histórico (no tocar) / Anular y generar liquidación final / Marcar como huérfano |
| Pagos | Dejar como histórico / Reasignar a otro propietario |
| Notificaciones | Borrar / Conservar |
| Documentos expediente | Borrar / Descargar y conservar copia |
| Usuario vinculado | Desvincular (userId = '') / Borrar usuario si no tiene otros roles |

**Bloqueadores:** Si el propietario es el único titular de un inmueble con contrato de inquilino vigente, el wizard debe exigir reasignar al inquilino primero o cancelar el contrato.

### 4.2 Inquilino (`tenants`)

**Dependencias:**
- Inmueble donde vive (`tenants.propertyId`)
- Contrato (fechas, documentos)
- Notificaciones dirigidas a él
- Documentos del expediente

**Opciones:**
| Dependencia | Opciones |
|-------------|----------|
| Inmueble asociado | Desvincular inquilino (propertyId = '') / Mover inquilino a otro inmueble / Borrar inquilino y dejar inmueble libre |
| Contrato | Finalizar contrato con fecha de hoy / Anular contrato |
| Documentos | Borrar / Conservar |

### 4.3 Inmueble (`properties`)

**Dependencias:**
- Propietarios vinculados (`ownerIds`)
- Inquilinos asociados (`tenantIds`)
- Cuotas y servicios asignados a ese propertyId (`fee_receipts.propertyId`, `service_bills`)
- Documentos del inmueble

**Opciones:**
| Dependencia | Opciones |
|-------------|----------|
| Propietarios | Reasignar inmueble a otro propietario / Quitar de ownerIds (huérfano) |
| Inquilinos | Mover inquilino a otro inmueble / Dar de baja al inquilino / Bloquear si tiene contrato vigente |
| Cuotas/services | Anular y liquidar / Dejar histórico huérfano / Mover a otro inmueble de la misma comunidad |

**Bloqueador:** No se puede borrar un inmueble con cuotas no anuladas sin elegir una opción de liquidación o reasignación.

### 4.4 Comunidad (`communities`)

**Dependencias:**
- Propietarios de la comunidad (`owners.communityId`)
- Inmuebles (`properties.communityId`)
- Inquilinos de esos inmuebles
- Cuotas, derramas, servicios (`fee_plans`, `fee_receipts`, `fee_assessments`, `service_bills` con `communityId`)
- Publicaciones de comunicación (`communication_posts.communityId`)
- Notificaciones de la comunidad
- Documentos de la comunidad
- Configuración de marca, ajustes, roles

**Opciones:**
| Dependencia | Opciones |
|-------------|----------|
| Propietarios | Mover a otra comunidad / Borrar propietarios (requiere cascade-delete en owners) / Dejar sin comunidad |
| Inmuebles | Mover a otra comunidad / Borrar inmuebles |
| Cuotas y servicios | Anular todos y liquidar / Dejar como histórico huérfano / Mover a otra comunidad |
| Publicaciones | Borrar / Mover a otra comunidad / Conservar como histórico |
| Marca y ajustes | Borrar con la comunidad / Exportar configuración antes de borrar |

**Opción especial:** "Crear comunidad temporal" — mover todos los propietarios, inmuebles e inquilinos a una comunidad nueva temporal antes de borrar la original.


---

## 5. Acciones del wizard (catálogo)

| Acción | Qué hace | Cuándo aplicar |
|--------|----------|----------------|
| `reassign_owner` | Cambia titularidad del inmueble a otro propietario existente | Propietario o inmueble |
| `reassign_property` | Mueve inquilino o cuotas a otro inmueble | Inquilino, cuotas |
| `reassign_community` | Mueve propietario/inmueble a otra comunidad existente | Comunidad, propietario, inmueble |
| `orphan` | Setea referencias a null / vacío (huérfano) | Cualquier dependencia |
| `liquidate_final` | Genera recibo final, anula pendientes, cierra deuda | Cuotas de propietario/inmueble/comunidad |
| `cancel_contract` | Finaliza contrato de inquilino con fecha actual | Inquilino |
| `create_temp_community` | Crea comunidad nueva y mueve todo ahí | Comunidad |
| `delete_historical` | Borra notificaciones, documentos, publicaciones antiguas | Cualquier entidad |
| `keep_historical` | Conserva como solo lectura sin borrar | Cuotas, documentos |

---

## 6. Consideraciones de integridad y riesgos

| Riesgo | Mitigación propuesta |
|--------|---------------------|
| Datos financieros huérfanos (fee_receipts con snapshot del owner borrado) | Nunca borrar `fee_receipts` ni `fee_payments`. Opción `liquidate_final` o `keep_historical`. |
| Propietario compartido entre comunidades (F06 auditoría) | Al borrar de una comunidad, solo quitar de esa comunidad; no borrar al propietario globalmente a menos que se elija explícitamente. |
| Inquilino sin inmueble | Permitir `propertyId = ''` solo si se elige `orphan` o `reassign_property`. |
| Comunidad con cuotas activas | Exigir `liquidate_final` o `reassign_community` antes de permitir el borrado. |
| Auditoría | Registrar en `access_audit` el borrado en cascada con detalle de qué acciones se tomaron. |

---

## 7. Archivos implicados (futura implementación)

**Backend:**
- `src/routes/owners.js` — agregar ruta `GET /:id/cascade-preview` y `DELETE /:id?cascade=`
- `src/routes/communities.js` — igual
- `src/routes/properties.js` — igual
- `src/routes/tenants.js` — igual
- `src/access.js` — middleware de permiso `cascade-delete`
- `src/db.js` — consultas de dependencias (joins entre tablas)

**Frontend:**
- `public/js/features/propietarios.js` — botón "Eliminar (avanzado)" y llamada al wizard
- `public/js/features/inquilinos.js` — igual
- `public/js/features/comunidades.js` — igual
- `public/js/features/properties.js` (o dentro de comunidades.js) — igual
- Nuevo componente `public/js/features/cascade-wizard.js` — lógica del wizard (pasos, render, confirmación)
- `public/styles.css` — estilos del wizard (pasos, árbol de dependencias, selects)

**Documentación:**
- `README.md` — actualizar sección de eliminación para reflejar el nuevo permiso y modo wizard.

---

## 8. Próximos pasos (cuando se decida implementar)

1. Crear los endpoints `cascade-preview` en las 4 rutas sin modificar los `DELETE` existentes.
2. Agregar el permiso `cascade-delete` en `permissions.js` y `administracion.js`.
3. Construir el componente wizard en frontend.
4. Conectar paso 2 (preview) con el árbol de dependencias.
5. Implementar paso 5 (ejecución transaccional) solo detrás del permiso y confirmación.
6. Agregar pruebas unitarias para el preview de dependencias.
7. Actualizar `README.md`.

---

## 9. ¿Qué NO se hace en esta rama

- No se modifica el comportamiento actual de `DELETE /owners/:id`, `DELETE /communities/:id`, etc.
- No se borra ningún dato financiero automáticamente.
- No se cambia el permiso existente `owner:delete` ni `community:delete`.
- No se toca `main`.

---

**Rama creada:** `feat/cascade-delete-wizard`  
**Push:** pendiente de tu confirmación para subir a GitHub y abrir PR.
