// Reproducciones de auditoría. Solo crea y modifica una base temporal propia.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = mkdtempSync(path.join(tmpdir(), 'pen-release-audit-'));
process.env.APP_DATA_DIR = path.join(dir, 'data');
process.env.APP_UPLOADS_DIR = path.join(dir, 'uploads');
process.env.NODE_ENV = 'test';
const { db } = await import('../../src/db.js');
const { seedIfEmpty } = await import('../../src/seed.js');
seedIfEmpty();
const results = [];
let child;
let logs = '';
const socket = createServer().listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
async function start() {
  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production', APP_PUBLIC_URL: 'https://audit.example.test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => logs += chunk);
  child.stderr.on('data', chunk => logs += chunk);
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Servidor terminó: ${logs}`);
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('El servidor no arrancó.');
}
async function stop() {
  if (child && child.exitCode === null) {
    const ended = once(child, 'exit');
    child.kill();
    await ended;
  }
}
function client() {
  let cookie = '';
  return async (route, method = 'GET', data, headers = {}) => {
    const response = await fetch(base + route, {
      method,
      headers: { ...(data instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: data === undefined ? undefined : data instanceof FormData ? data : JSON.stringify(data),
    });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const type = response.headers.get('content-type') || '';
    return { status: response.status, data: type.includes('application/json') ? await response.json() : await response.text(), headers: Object.fromEntries(response.headers) };
  };
}
function record(id, description, evidence) {
  results.push({ id, description, evidence });
  console.log(JSON.stringify(results.at(-1)));
}
function must(response, expected = 200) {
  if (response.status !== expected) throw new Error(`Preparación fallida (${expected}): ${JSON.stringify(response)}`);
  return response.data;
}
try {
  const freshProduction = spawnSync(process.execPath, ['--input-type=module','-e', `
    const {db}=await import('./src/db.js');
    const {verifyPassword}=await import('./src/auth.js');
    console.log(JSON.stringify({users:db.prepare('SELECT usuario,rol,activo FROM users').all(),knownAdminPasswordAccepted:verifyPassword('admin',db.prepare('SELECT passwordHash FROM users WHERE usuario=?').get('admin').passwordHash)}));
    db.prepare('UPDATE users SET usuario=? WHERE usuario=?').run('super-admin-seguro','super_admin');
    db.prepare('UPDATE users SET usuario=? WHERE usuario=?').run('admin-seguro','admin');
    db.close();
  `], { cwd:root, env:{...process.env,APP_DATA_DIR:path.join(dir,'fresh-production'),APP_UPLOADS_DIR:path.join(dir,'fresh-uploads'),NODE_ENV:'production',APP_ADMIN_PASSWORD:'Audit-Only-Strong-Password-3941'}, encoding:'utf8' });
  if (freshProduction.status !== 0) throw new Error(freshProduction.stderr);
  const recreated = spawnSync(process.execPath,['--input-type=module','-e',`
    const {db}=await import('./src/db.js');
    const {verifyPassword}=await import('./src/auth.js');
    const recreated=db.prepare('SELECT * FROM users WHERE usuario=?').get('super_admin');
    const accepted = verifyPassword('super_admin',recreated?.passwordHash);
    if(!accepted || recreated?.rol!=='super_admin') throw new Error('No se reprodujo la recreación privilegiada');
    console.log(JSON.stringify({recreatedSuperAdmin:!!recreated,role:recreated.rol,knownSuperAdminPasswordAccepted:accepted}));
    db.close();
  `],{cwd:root,env:{...process.env,APP_DATA_DIR:path.join(dir,'fresh-production'),APP_UPLOADS_DIR:path.join(dir,'fresh-uploads'),NODE_ENV:'production',APP_ADMIN_PASSWORD:'Audit-Only-Strong-Password-3941'},encoding:'utf8'});
  if(recreated.status!==0) throw new Error(recreated.stderr);
  record('F00','Una base de producción nueva crea cuentas demo con contraseñas conocidas',{...JSON.parse(freshProduction.stdout.trim()),afterRenamingAndRestarting:JSON.parse(recreated.stdout.trim())});
  await start();
  const admin = client(), tenant = client(), commAdmin = client(), owner = client();
  for (const [request, usuario] of [[admin,'super_admin'],[tenant,'uruci1'],[commAdmin,'ca1'],[owner,'urucp1']])
    must(await request('/api/auth/signin','POST',{usuario,password:usuario}));

  const proxy = await client()('/api/auth/signin','POST',{usuario:'super_admin',password:'super_admin'}, {Origin:'https://audit.example.test',Host:'audit.example.test','X-Forwarded-Proto':'https','X-Forwarded-For':'198.51.100.10'});
  record('F01','HTTPS terminado en proxy rechaza un inicio de sesión legítimo', {status:proxy.status,body:proxy.data});

  const invalid = await admin('/api/fees/communities/com-seed-1/preview','POST',{period:'incorrecto'});
  const denied = await owner('/api/fees/communities/com-seed-1/plans','POST',{});
  record('C01','Control correcto: cuotas conserva errores 400 y 403', {invalidPeriod:{status:invalid.status,body:invalid.data},forbiddenAction:{status:denied.status,body:denied.data}});

  const upload = new FormData();
  upload.set('entityType','community'); upload.set('entityId','com-seed-1');
  upload.set('files',new Blob(['%PDF-1.4\nDocumento sintético de auditoría\n%%EOF'],{type:'application/pdf'}),'audit-private.pdf');
  const document = must(await admin('/api/documents','POST',upload),201);
  const docId = Array.isArray(document) ? document[0].id : document.documents?.[0]?.id || document.id;
  if (!docId) throw new Error(`Sin id documental: ${JSON.stringify(document)}`);
  const savedContract = db.prepare('SELECT contractStart,contractEnd FROM tenants WHERE id=?').get('tenant-seed-1');
  db.prepare('UPDATE tenants SET contractStart=?,contractEnd=? WHERE id=?').run('2000-01-01','2001-01-01','tenant-seed-1');
  const expiredBoot = must(await tenant('/api/bootstrap'));
  const expiredDownload = await tenant(`/api/documents/${docId}/download`);
  const expiredCommunications = must(await tenant('/api/communications/metadata'));
  record('F03','Contrato finalizado conserva acceso a comunidad y archivos', {communities:expiredBoot.communities.map(c=>c.id),properties:expiredBoot.properties.map(p=>p.id),downloadStatus:expiredDownload.status,communicationCommunities:expiredCommunications.communities.map(c=>c.id)});
  db.prepare('UPDATE tenants SET contractStart=?,contractEnd=? WHERE id=?').run(savedContract.contractStart,savedContract.contractEnd,'tenant-seed-1');

  const tenantForDocument = must(await admin('/api/tenants/tenant-seed-1'));
  const privateFile = {fileName:'audit-identidad.pdf',fileType:'application/pdf',dataUrl:'data:application/pdf;base64,JVBERi0xLjQKJSVFT0Y=',adminApproval:{status:'pending'}};
  must(await admin('/api/tenants/tenant-seed-1','PUT',{...tenantForDocument,documents:{dni:privateFile}}));
  const oldUserRole = db.prepare("SELECT id,permisos FROM roles WHERE nombre='user'").get();
  const removed = JSON.parse(oldUserRole.permisos).filter(p=>p!=='document:read');
  must(await admin(`/api/admin/roles/${oldUserRole.id}`,'PUT',{permisos:removed}));
  const noDocDownload = await tenant(`/api/documents/${docId}/download`);
  const tenantOwnDocuments = must(await tenant('/api/tenants/tenant-seed-1'));
  record('F04','Expediente embebido se devuelve sin document:read', {downloadDenied:noDocDownload.status,tenantReadStatus:200,documentKeys:Object.keys(tenantOwnDocuments.documents),hasEmbeddedFile:JSON.stringify(tenantOwnDocuments.documents).includes('data:')});
  must(await admin(`/api/admin/roles/${oldUserRole.id}`,'PUT',{permisos:JSON.parse(oldUserRole.permisos)}));
  const staffDocumentOwner = must(await admin('/api/owners/own-seed-1'));
  must(await admin('/api/owners/own-seed-1','PUT',{...staffDocumentOwner,documents:{dni:privateFile}}));
  const staffOriginalRole = must(await admin('/api/admin/roles')).find(r=>r.nombre==='community_admin');
  must(await admin(`/api/admin/roles/${staffOriginalRole.id}`,'PUT',{permisos:staffOriginalRole.permisos.filter(p=>p!=='document:read')}));
  const staffWithoutDocumentPermission=must(await commAdmin('/api/bootstrap'));
  const staffOwn=staffWithoutDocumentPermission.owners.find(o=>o.id==='own-seed-1');
  results.find(r=>r.id==='F04').evidence.staffReadingOtherPersonsFile={hasDocumentRead:false,ownerId:staffOwn?.id,containsEmbeddedIdentityFile:!!staffOwn?.documents?.dni?.dataUrl};
  must(await admin(`/api/admin/roles/${staffOriginalRole.id}`,'PUT',{permisos:staffOriginalRole.permisos}));

  const own = must(await owner('/api/owners/own-seed-1'));
  const fake = {fileName:'archivo.exe',fileType:'application/x-msdownload',dataUrl:'data:application/x-msdownload;base64,TVqQAAMAAAA=',size:1,adminApproval:{status:'pending'}};
  const saveFake = await owner('/api/owners/own-seed-1','PUT',{...own,documents:{...own.documents,dni:fake}});
  record('F05','Subida por JSON admite formatos excluidos por la biblioteca', {status:saveFake.status,storedFileName:saveFake.data.documents?.dni?.fileName,storedDataUrl:saveFake.data.documents?.dni?.dataUrl});

  // Un propietario compartido entre comunidades: la administración local no
  // debe poder eliminar las titularidades ajenas al guardar sus propios datos.
  const p2 = must(await admin('/api/properties/prop-seed-2'));
  const p1 = must(await admin('/api/properties/prop-seed-1'));
  const foreignProperty = must(await admin('/api/properties')).find(p=>p.communityId && p.communityId!=='com-seed-1');
  const sharedOwner = must(await admin('/api/owners/own-seed-1'));
  must(await admin('/api/owners/own-seed-1','PUT',{...sharedOwner,propertyIds:[p1.id,foreignProperty.id]}));
  const localView = must(await commAdmin('/api/owners/own-seed-1'));
  const foreignBefore = must(await admin(`/api/properties/${foreignProperty.id}`));
  const scopeEdit = await commAdmin('/api/owners/own-seed-1','PUT',{...localView,propertyIds:[p1.id]});
  const foreignAfter = must(await admin(`/api/properties/${foreignProperty.id}`));
  record('F06','Administrador de comunidad elimina una titularidad de otra comunidad', {foreignCommunity:foreignProperty.communityId,foreignProperty:foreignProperty.id,status:scopeEdit.status,before:foreignBefore.ownerIds,after:foreignAfter.ownerIds});

  // Dos gestores editan la misma ficha: no existe versión ni comprobación de
  // concurrencia, de modo que el último formulario puede borrar el primero.
  const snapshotA = must(await admin('/api/communities/com-seed-1'));
  const snapshotB = structuredClone(snapshotA);
  must(await admin('/api/communities/com-seed-1','PUT',{...snapshotA,president:'Presidencia A'}));
  const staleWrite = await admin('/api/communities/com-seed-1','PUT',{...snapshotB,administrator:'Administración B'});
  record('F07','Edición desactualizada pisa cambios anteriores sin conflicto', {status:staleWrite.status,presidentExpected:'Presidencia A',presidentActual:staleWrite.data.president,administrator:staleWrite.data.administrator});

  const originalContact = must(await owner('/api/owners/own-seed-1'));
  const beforeVerification = must(await owner('/api/owners/own-seed-1','PUT',{...originalContact,phone:'600123499'}));
  const challengeId = crypto.randomUUID(), code = '123456', now = Date.now();
  db.prepare('INSERT INTO contact_verification_challenges(id,tipo,destino,codigo,createdAt,expiresAt) VALUES (?,?,?,?,?,?)').run(challengeId,'phone',beforeVerification.phone,crypto.createHash('sha256').update(code).digest('hex'),now,now+60000);
  const confirm = must(await owner('/api/owners/contact/phone/confirm','POST',{challengeId,code}));
  const verifiedSaved = must(await owner('/api/owners/own-seed-1','PUT',{...beforeVerification,phoneVerified:true,phoneVerifiedAt:confirm.verifiedAt}));
  record('F11','OTP confirmado no se persiste al guardar el perfil', {confirmed:confirm.verified,phoneVerified:verifiedSaved.phoneVerified,phoneVerifiedAt:verifiedSaved.phoneVerifiedAt});

  const allProperties = must(await admin('/api/properties'));
  const bootOwners = must(await admin('/api/bootstrap')).owners.map(o=>o.id);
  record('F12','La lista visual descarta inmuebles sin propietario', {apiTotal:allProperties.length,visibleWithCurrentFrontendRule:allProperties.filter(p=>p.ownerIds.some(id=>bootOwners.includes(id))).length,hiddenPropertyIds:allProperties.filter(p=>!p.ownerIds.some(id=>bootOwners.includes(id))).map(p=>p.id)});

  const invalidIbanOwner = must(await owner('/api/owners/own-seed-1'));
  const badIban = await owner('/api/owners/own-seed-1','PUT',{...invalidIbanOwner,iban:'NO-ES-UN-IBAN'});
  record('F13','El servidor guarda IBAN inválidos', {status:badIban.status,storedIban:badIban.data.iban});

  must(await admin('/api/communications/preferences','PUT',{email:'audit@example.test',emailEnabled:true,phone:'',smsEnabled:false,whatsappEnabled:false}));
  const post = must(await admin('/api/communications/posts','POST',{communityId:'com-seed-1',type:'notice',title:'Auditoría de cola',body:'Mensaje sintético',status:'published',publishAt:new Date(Date.now()-1000).toISOString(),priority:'normal',channels:['email'],audience:{mode:'all'}}),201);
  must(await admin('/api/admin/settings','PUT',{notificacionesEmail:false}));
  const {processCommunications} = await import('../../src/communication-worker.js');
  const simulated = [];
  await processCommunications(async (...args)=>{simulated.push({channel:args[0],to:args[1]}); return 'audit-simulated';});
  record('F14','Desactivar email global no cancela correos ya en cola', {notificacionesEmail:false,simulatedCalls:simulated});

  // Un servicio informativo de otra comunidad del mismo propietario no debe
  // aparecer ante un administrador local que no puede leer esa comunidad.
  const {saveService,previewService,issueService} = await import('../../src/services.js');
  const actor = db.prepare("SELECT * FROM users WHERE usuario='super_admin'").get();
  const foreignCurrent = must(await admin(`/api/properties/${foreignProperty.id}`));
  db.prepare('UPDATE properties SET ownerIds=? WHERE id=?').run(JSON.stringify([...new Set([...foreignCurrent.ownerIds,'own-seed-1'])]),foreignProperty.id);
  const service = saveService(foreignProperty.communityId,{service:'agua',supplier:'Audit',invoiceNumber:'AUDIT-1',period:'2026-11',issueDate:'2026-11-01',dueDate:'2026-11-20',totalAmount:'100',billing:'informative',method:'manual',propertyIds:[foreignProperty.id],manual:{[foreignProperty.id]:'100'},legalBasis:'Acuerdo sintético',notes:''},actor);
  issueService(service.id,{token:previewService(service.id).token},actor);
  const leakedFinancial = await commAdmin('/api/fees/owners/own-seed-1');
  record('F15','Cuotas por propietario expone servicios informativos de una comunidad ajena', {status:leakedFinancial.status,foreignCommunity:foreignProperty.communityId,leakedServices:leakedFinancial.data.informativeServices?.map(s=>({id:s.id,communityId:s.communityId,totalAmount:s.totalAmount}))});

  const perf = [];
  const insertProperty = db.prepare('INSERT INTO properties(id,communityId,ownerIds,plot,participationCoef) VALUES (?,?,?,?,?)');
  for (const target of [0,100,300]) {
    if (target) {
      db.exec('BEGIN');
      for(let i=target===100?0:100;i<target;i++) insertProperty.run(`audit-perf-${i}`,'com-seed-1','["own-seed-1"]',`Audit ${i}`,'1');
      db.exec('COMMIT');
    }
    const started=performance.now();
    const request=admin('/api/bootstrap');
    await new Promise(resolve=>setTimeout(resolve,10));
    const healthStart=performance.now();
    const health=fetch(`${base}/api/health`);
    const payload=must(await request);
    const elapsed=performance.now()-started;
    await health;
    perf.push({properties:payload.properties.length,bootstrapMs:Math.round(elapsed),concurrentHealthMs:Math.round(performance.now()-healthStart)});
  }
  record('F16','Bootstrap aumenta de coste y bloquea otras solicitudes al crecer el censo',perf);

  const plain = await fetch(`${base}/js/municipios-ine.js`,{headers:{'Accept-Encoding':'identity'}});
  await plain.arrayBuffer();
  const compressed = await fetch(`${base}/js/municipios-ine.js`,{headers:{'Accept-Encoding':'gzip'}});
  await compressed.arrayBuffer();
  record('F08','Respuesta comprimida no varía la caché por Accept-Encoding', {identity:{encoding:plain.headers.get('content-encoding'),vary:plain.headers.get('vary'),cache:plain.headers.get('cache-control')},gzip:{encoding:compressed.headers.get('content-encoding'),vary:compressed.headers.get('vary'),cache:compressed.headers.get('cache-control')}});

  const adminRole = must(await admin('/api/admin/roles')).find(r=>r.nombre==='community_admin');
  const reduced = adminRole.permisos.filter(p=>!['comm:participacion','tenant:delete'].includes(p));
  must(await admin(`/api/admin/roles/${adminRole.id}`,'PUT',{permisos:reduced}));
  const beforeRestart = must(await admin('/api/admin/roles')).find(r=>r.id===adminRole.id).permisos;
  await stop(); await start();
  const afterRestart = must(await admin('/api/admin/roles')).find(r=>r.id===adminRole.id).permisos;
  record('F09','Reiniciar devuelve permisos que se retiraron en Roles', {before:beforeRestart.filter(p=>['comm:participacion','tenant:delete'].includes(p)),after:afterRestart.filter(p=>['comm:participacion','tenant:delete'].includes(p))});

  // El limitador usa req.ip; con proxy sin trust proxy toda la comunidad comparte cupo.
  const statuses = [];
  for (let i=0;i<42;i++) {
    const attempt = await client()('/api/auth/signin','POST',{usuario:'usuario-que-no-existe',password:'incorrecta'}, {'X-Forwarded-For':`198.51.100.${i+1}`});
    statuses.push(attempt.status);
  }
  const afterFlood = await client()('/api/auth/signin','POST',{usuario:'super_admin',password:'super_admin'}, {'X-Forwarded-For':'203.0.113.250'});
  record('F10','Intentos desde IP reenviadas distintas bloquean al siguiente usuario legítimo', {first429:statuses.indexOf(429)+1,legitimateUserStatus:afterFlood.status,body:afterFlood.data});
  await stop(); await start();
  const successStatuses=[];
  for(let i=0;i<41;i++) successStatuses.push((await client()('/api/auth/signin','POST',{usuario:'super_admin',password:'super_admin'})).status);
  results.find(r=>r.id==='F10').evidence.successfulLoginsAlsoConsumeLimit={successfulLogins:successStatuses.filter(s=>s===200).length,nextStatus:successStatuses.at(-1)};
  writeFileSync(new URL('./evidence.json',import.meta.url),JSON.stringify({executedAt:new Date().toISOString(),node:process.version,tests:results,serverLogs:logs},null,2));
} finally {
  await stop();
  db.close();
  if (path.dirname(path.resolve(dir))!==path.resolve(tmpdir()) || !path.basename(dir).startsWith('pen-release-audit-')) throw new Error('Ruta temporal inesperada.');
  rmSync(dir,{recursive:true,force:true});
}
