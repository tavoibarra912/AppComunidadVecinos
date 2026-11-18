# Asistente de borrado en cascada

Estado: implementado en `feat/cascade-delete-wizard`, continuando el piloto de Cline.
Origen de la rama: `main` en `9266852`. Issues: #195 y #196.

## Alcance implementado

- Permiso maestro `cascade-delete`, configurable en Administración → Roles.
- Acción adicional **Avanzado** en propietarios, inquilinos, inmuebles y comunidades.
- Asistente de cinco pasos con evaluación, selección por dependencia, revisión exacta
  en el servidor, confirmaciones y resultado.
- Reasignación de titularidad y de inquilinos, desvinculación, finalización de contratos,
  traslado a comunidades existentes o creación de una comunidad temporal con NIF válido.
- Borrado global de propietarios con información de sus relaciones en otras comunidades
  y confirmación expresa, también desde una comunidad.
- Histórico financiero conservado, liquidación final o eliminación definitiva opcional.
  La eliminación financiera admite cuotas activas sin liquidación previa y exige una
  casilla específica. Los recibos compartidos requieren otra confirmación.
- Traslado conjunto de finanzas y publicaciones cuando todos los inmuebles se trasladan
  a una misma comunidad y moneda.
- Conservación o eliminación de documentos, notificaciones y publicaciones; acta persistente
  y adjuntos recuperables desde **Administración → Auditoría → Histórico de borrados**.
- Eliminación opcional de cuentas de acceso sin otros perfiles, con permiso `admin:users`,
  protección de cuentas administrativas y revocación de sesiones.

## Contrato de la API

Las cuatro colecciones (`owners`, `tenants`, `properties`, `communities`) ofrecen:

- `GET /api/:collection/:id/cascade-preview`: relaciones y `previewToken`.
- `POST /api/:collection/:id/cascade-preview`: plan elegido y token; devuelve alcance
  financiero exacto, `executionToken` firmado y confirmaciones necesarias, sin modificar datos.
- `DELETE /api/:collection/:id?cascade=true`: plan, token y confirmaciones; ejecuta
  atómicamente con el `executionToken` de la revisión. El DELETE sin `cascade=true` mantiene su comportamiento anterior.

El cuerpo contiene `actions.properties`, `actions.owners` y `actions.tenants`, mapas
por ID. Cada entrada tiene `action` y, si corresponde, `newOwnerId`, `newPropertyId`
o `newCommunityId`. También contiene las políticas `finance`, `documents`,
`notifications`, `posts`, `user` y, opcionalmente, `temporaryCommunity: {name,nif}`.
No se admiten entidades ajenas al árbol ni acciones desconocidas.

Confirmaciones: `confirmDelete`; `confirmGlobalDelete` cuando hay propietarios
eliminados en varias comunidades; `confirmDeleteFinancial` para borrar finanzas;
`confirmSharedFinancial` para anular o eliminar recibos con varios titulares.

La ejecución devuelve `archiveId`, `temporaryCommunityId` y `settlement`.
Los históricos se consultan mediante `GET /api/cascade-archives?offset=0` y
`GET /api/cascade-archives/:id`. Los adjuntos conservados tienen descargas autorizadas.

## Semántica financiera

- `keep_historical`: conserva recibos, fotografías de titulares y pagos. El histórico
  sigue consultable en el acta aunque la entidad ya no exista.
- `liquidate_final`: anula los recibos afectados, perdona su saldo pendiente y libera
  las aplicaciones de cobro como crédito del pagador. El acta desglosa por moneda.
  No crea pagos ficticios ni afirma haber realizado una transferencia bancaria.
- `delete`: elimina los recibos y pagos del alcance confirmado y sus aplicaciones,
  eventos, avisos y justificantes correspondientes. En una comunidad elimina también
  planes, derramas, servicios y sus adjuntos; no exige liquidar primero.
- `reassign_community`: traslada el libro de la comunidad al destino común de todos
  los inmuebles; conserva las fotografías originales y rechaza monedas diferentes.

Los recibos compartidos son indivisibles: no se borra solo el porcentaje de un
cotitular. El resumen informa el alcance y exige confirmación. Retirar un pago
puede aumentar el pendiente de otros recibos: el resumen advierte ese efecto.
Los repartos existentes mantienen sus fotografías históricas y no se recalculan
ni redistribuyen importes automáticamente al retirar inmuebles. Los repartos que ya no
puedan emitir se cierran tras avisarlo en el resumen, con confirmación adicional si
son compartidos; sus recibos existentes mantienen el saldo salvo la política financiera elegida.

## Integridad y permisos

La lógica común vive en `src/cascade-delete.js`. Sustituye las implementaciones
parciales que consultaban columnas inexistentes, no aplicaban reasignaciones o
retiraban archivos antes de saber si la transacción terminaría correctamente.

La vista previa y la ejecución usan el mismo árbol de relaciones. El token incluye
registros y dependencias relevantes; cualquier cambio obliga a volver a evaluar.
El resumen final firma también los destinos y las cuentas que se eliminarán; un
cambio posterior en ellos invalida la ejecución. Las reasignaciones transfieren el
arrendador de los contratos al nuevo titular. La sincronización afecta únicamente
los registros de la operación y conserva el inmueble principal cuando sigue vinculado.
Los contratos futuros o ya finalizados no admiten alterar su fecha histórica mediante
la opción de finalizar hoy.
Los permisos se vuelven a comprobar para el origen, los destinos y las comunidades
externas. Confirmar un borrado global no amplía el ámbito de un usuario.

La ejecución usa `BEGIN IMMEDIATE` y mantiene auditoría y acta dentro de la misma
transacción. Un error revierte todas las modificaciones de la base. Los archivos
se retiran solo después del commit. Se reconstruyen titularidades, porcentajes,
inquilinos e información de la comunidad principal de los propietarios conservados.

`cascade_archives` guarda actas e históricos seleccionados. Las descargas vuelven
a comprobar sesión, permiso y ámbito. Un creador conserva acceso al histórico de
una comunidad eliminada si mantiene los permisos explícitos correspondientes;
no obtiene acceso a comunidades existentes que ya no administra.

## Verificación

Pruebas en bases SQLite temporales y archivos aislados, sin tocar datos operativos.
Cobertura de permisos, las cuatro entidades, revisión sin efectos, borrado global,
recibos compartidos, eliminación financiera, liquidación, traslados, comunidad temporal,
históricos y adjuntos, concurrencia, destinos inválidos, rollback y DELETE normal.
Pruebas de interfaz para pasos, confirmaciones, cambios de opciones, recuperación de
conflictos y fallos al refrescar después de una operación completada.
La suite general sigue siendo `npm test`.

## Revisión posterior

Se añadieron regresiones para efectos sobre registros ajenos, cambios concurrentes
en destinos, fechas de contratos, permisos de documentos, Comunicación y buzones,
cierre de repartos compartidos, traslado de comunidades vacías, monedas incompatibles,
revocación de acceso a históricos y descargas de documentos embebidos.
El resumen muestra las cuentas concretas que se eliminarán. Sus sesiones y correos
pendientes de recuperación se retiran con la cuenta; los perfiles restantes bloquean
la eliminación. Un fallo simulado al guardar el acta verifica el rollback completo,
incluidos archivos físicos. Los conflictos de datos conservan las opciones elegidas;
solo `CASCADE_STALE` reinicia la evaluación.

## Interfaz y relaciones verificadas

Los controles de cierre y navegación del asistente usan iconos con nombres accesibles.
La acción de borrado avanzado usa una papelera con controles de ajustes; los borrados normales comparten
el mismo icono. El histórico está integrado en Auditoría, junto al control de
actualización con el mismo icono que Inicio. Los auditores autorizados pueden consultar
actas sin recibir el permiso destructivo `cascade-delete`.

Las comunidades relacionadas se calculan desde inmuebles, contratos y registros
financieros reales. Los campos desnormalizados de comunidad principal del propietario
no crean vínculos: pueden conservar valores antiguos y no son la fuente de pertenencia.
La vista previa describe el motivo de las relaciones que muestra.
