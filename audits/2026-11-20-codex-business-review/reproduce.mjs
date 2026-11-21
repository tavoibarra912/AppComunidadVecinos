// Revisión independiente: no importa server.js ni abre data/ o uploads/ reales.
// Ejecutar desde la raíz: node audits/2026-11-20-codex-business-review/reproduce.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const require = createRequire(path.join(root, 'package.json'));
const express = require('express');
const { default: PDFDocument } = await import('pdfkit');
const scratch = process.env.CODEX_REVIEW_CHILD_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'codex-business-review-'));
process.env.APP_DATA_DIR = scratch;
process.env.APP_UPLOADS_DIR = path.join(scratch, 'uploads');
process.env.NODE_ENV = 'test';
const mod = (name) => import(pathToFileURL(path.join(root, 'src', name)).href);
const { db } = await mod('db.js');
const fees = await mod('fees.js');
const services = await mod('services.js');
const communication = await mod('communication-store.js');
const { default: router } = await mod('routes/index.js');
const { allowed } = await mod('security.js');
const { rebuildOwnersPropertyIds, rebuildPropertyTenantReferences } = await mod('domain.js');
const insert = (table, row) => db.prepare(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
const row = (table, id) => db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
function account(role, permissions = []) {
  if (!db.prepare('SELECT 1 FROM roles WHERE nombre=?').get(role)) insert('roles', {id: role, nombre: role, permisos: JSON.stringify(permissions)});
  const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('hex');
  insert('users', {id, usuario:id, rol:role, activo:1});
  insert('sessions', {tokenHash:crypto.createHash('sha256').update(token).digest('hex'), userId:id, expiresAt:Date.now()+3600000});
  return {...row('users', id), token};
}
const admin = account('super_admin');
const limited = account('property-only', ['property:manage', 'property:read', 'community:read', 'owner:read', 'tenant:read']);
const reader = account('fee-reader', ['fee:read', 'community:read']);
let serial = 0;
const dni = (n) => String(n) + 'TRWAGMYFPDXBNJZSQVHLCKE'[n % 23];
function fixture() {
  const prefix = `f${++serial}-`, f = Object.fromEntries(['c','c2','o','o2','o3','p','p2','t'].map(k => [k,prefix+k]));
  for (const [i,id] of [f.c,f.c2].entries()) insert('communities', {id,name:id,nif:dni(50000000+serial*2+i),currency:'EUR',address:'Calle Prueba',city:'Madrid'});
  for (const [i,id] of [f.o,f.o2,f.o3].entries()) insert('owners',{id,name:id,surname:'Titular',dni:dni(10000000+serial*3+i),communityId:f.c,email:`${id}@example.test`,phone:'612345678',address:'Calle Prueba',city:'Madrid'});
  for (const [i,id] of [f.p,f.p2].entries()) insert('properties',{id,communityId:f.c,communityName:f.c,plot:id,propertyType:'vivienda',address:'Calle Prueba',city:'Madrid',participationCoef:'50',ownerIds:JSON.stringify([f.o]),ownerPercentages:JSON.stringify({[f.o]:100})});
  insert('tenants',{id:f.t,propertyId:f.p,ownerId:f.o,name:'Inquilino',surname:'Prueba',contractStart:'2020-01-01'});
  rebuildOwnersPropertyIds();
  return f;
}
function receipt(f, propertyId=f.p, amount=10000, extra={}) {
  const id = crypto.randomUUID();
  insert('fee_receipts',{id,communityId:f.c,propertyId,planId:'',period:'2026-01',periodEnd:'2026-01-31',dueDate:'2026-01-10',amount,snapshot:JSON.stringify({owners:[{id:f.o,name:f.o}],community:f.c,property:propertyId}),createdAt:new Date().toISOString(),actorId:admin.id,...extra});
  return id;
}
function pay(f, amount, receiptIds=[]) {
  return fees.recordPayment(f.c,{ownerId:f.o,amount,paidOn:'2026-01-01',method:'transfer',reference:crypto.randomUUID(),requestId:crypto.randomUUID(),receiptIds},admin);
}
const app = express(); app.use(express.json()); app.use('/api',router);
app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
const server = app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function request(route, method='GET', body, actor=admin) {
  const res = await fetch(base+route,{method,headers:{'Content-Type':'application/json',Cookie:`penarrubia_session=${actor.token}`},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
  const text=await res.text(); let data; try{data=JSON.parse(text);}catch{data=text;}
  return {status:res.status,data};
}
async function entity(table,id) {const r=await request(`/${table}/${id}`);assert.equal(r.status,200);return r.data;}
async function cascade(collection,id,adjust) {
  const preview=await request(`/${collection}/${id}/cascade-preview`);assert.equal(preview.status,200,JSON.stringify(preview));
  const p=preview.data;
  const body={previewToken:p.previewToken,confirmDelete:true,confirmGlobalDelete:true,confirmSharedFinancial:true,actions:{properties:Object.fromEntries(p.properties.map(x=>[x.id,{action:collection==='communities'?'orphan':'keep'}])),owners:Object.fromEntries(p.owners.map(x=>[x.id,{action:collection==='owners'?'delete_owner':'keep'}])),tenants:Object.fromEntries(p.tenants.map(x=>[x.id,{action:'keep'}])),finance:'keep_historical',documents:'keep',notifications:'keep',posts:'keep_historical',user:'unlink'}};
  adjust(body);
  const review=await request(`/${collection}/${id}/cascade-preview`,'POST',body);assert.equal(review.status,200,JSON.stringify(review));
  const result=await request(`/${collection}/${id}?cascade=true`,'DELETE',{...body,executionToken:review.data.executionToken});assert.equal(result.status,200,JSON.stringify(result));return result.data;
}
async function certificate(args) {
  const calls=[], original=PDFDocument.prototype.text;
  PDFDocument.prototype.text=function(text,...rest){calls.push(String(text));return original.call(this,text,...rest);};
  try { const buffer=await fees.generateDebtCertificate({...args,actor:admin});return {bytes:buffer.length,text:calls}; }
  finally {PDFDocument.prototype.text=original;}
}
if (process.argv.includes('--crash-child')) {
  const f=fixture();
  await request(`/fees/communities/${f.c}/debt-certificate?ownerId=${f.o}`,'GET',undefined,reader);
  process.exit(9); // La ruta debería haber respondido 403 sin terminar el proceso.
}
const results=[];
async function probe(id,fn){try{const evidence=await fn();results.push({id,verified:true,evidence});console.log('VERIFIED',id,JSON.stringify(evidence));}catch(error){results.push({id,verified:false,error:error.stack});console.log('FAILED',id,error.stack);}}
try {
  await probe('H12-split-payment-correct',()=>{
    const f=fixture(),r1=receipt(f,f.p,6000),r2=receipt(f,f.p2,4000);pay(f,'100',[r1,r2]);
    const paid=[r1,r2].map(id=>fees.receiptView(row('fee_receipts',id)).paid);assert.deepEqual(paid,[6000,4000]);return {paid};
  });
  await probe('NEW-certificate-rejection-crashes-process',()=>{
    const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--crash-child'],{cwd:root,encoding:'utf8',timeout:15000,env:{...process.env,CODEX_REVIEW_CHILD_DIR:path.join(scratch,'child')}});
    assert.equal(child.status,1,child.stderr);assert.match(child.stderr,/No tienes permiso para generar certificados/);
    return {exitCode:child.status,stderr:child.stderr.split('\n').filter(x=>/fees.js:|Error:|status:/.test(x))};
  });
  await probe('C1-property-certificate-missing-owner-and-payments',async()=>{
    const f=fixture(),r=receipt(f);pay(f,'30',[r]);const pdf=await certificate({communityId:f.c,propertyId:f.p});
    assert.ok(!pdf.text.some(t=>t.startsWith('Nombre:')));assert.ok(pdf.text.some(t=>t.startsWith('Total pagado')&&t.includes('0,00')));
    return {realPaid:3000,certificate:pdf.text.filter(t=>/Total|Nombre:/.test(t)),pdfBytes:pdf.bytes};
  });
  await probe('NEW-owner-certificate-other-community-rejected',()=>{
    const f=fixture();db.prepare('UPDATE properties SET communityId=? WHERE id=?').run(f.c2,f.p2);receipt(f,f.p2,10000,{communityId:f.c2});
    assert.throws(()=>fees.generateDebtCertificate({communityId:f.c2,ownerId:f.o,actor:admin}),/Propietario no encontrado/);
    return {primaryCommunity:f.c,actualPropertyCommunity:f.c2,result:'404 despite ownership and debt'};
  });
  await probe('NEW-owner-certificate-mixes-properties',async()=>{
    const f=fixture();receipt(f,f.p,10000);receipt(f,f.p2,20000);const pdf=await certificate({communityId:f.c,ownerId:f.o});
    assert.ok(pdf.text.includes(`Inmueble: ${f.p}`));assert.ok(!pdf.text.some(t=>t.includes(f.p2)));assert.ok(pdf.text.some(t=>t.startsWith('Total pendiente:')&&t.includes('300,00')));
    return {propertiesWithDebt:[f.p,f.p2],labelledProperty:f.p,totalOutstanding:30000,secondPropertyNotLabelled:true};
  });
  await probe('C2-coowner-certificates-show-whole-receipt',async()=>{
    const f=fixture();db.prepare('UPDATE properties SET ownerIds=?,ownerPercentages=? WHERE id=?').run(JSON.stringify([f.o,f.o2]),JSON.stringify({[f.o]:70,[f.o2]:30}),f.p);
    receipt(f,f.p,10000,{snapshot:JSON.stringify({owners:[{id:f.o,name:f.o},{id:f.o2,name:f.o2}],community:f.c,property:f.p})});
    const totals=[];for(const ownerId of [f.o,f.o2]) totals.push((await certificate({communityId:f.c,ownerId})).text.find(t=>t.startsWith('Total pendiente:')));
    assert.ok(totals.every(t=>t.includes('100,00')));return {shares:[70,30],totals,classification:'behavior proven; liability/repartition requirement must be defined'};
  });
  await probe('NEW-property-edit-without-tenant-manage',async()=>{
    const f=fixture();assert.equal(allowed(limited,'tenant:manage',f.t),false);
    const body=await entity('properties',f.p);body.tenantIds=[];
    const result=await request(`/properties/${f.p}`,'PUT',body,limited);assert.equal(result.status,200,JSON.stringify(result));assert.equal(row('tenants',f.t).propertyId,'');
    return {hasTenantManage:false,response:result.status,tenantPropertyAfter:row('tenants',f.t).propertyId};
  });
  await probe('NEW-required-fields-omitted-are-saved',async()=>{
    const c=await request('/communities','POST',{name:'Sin dirección',nif:'H12345674'});
    const o=await request('/owners','POST',{name:'Sin contacto',surname:'Prueba',dni:dni(22222222)});
    assert.equal(c.status,201,JSON.stringify(c));assert.equal(o.status,201,JSON.stringify(o));
    return {community:{status:c.status,address:c.data.address,city:c.data.city},owner:{status:o.status,email:o.data.email,phone:o.data.phone,address:o.data.address,city:o.data.city}};
  });
  await probe('NEW-property-save-detaches-ended-and-future-contracts',async()=>{
    const evidence=[];
    for(const [status,dates] of [['ended',{contractStart:'2020-01-01',contractEnd:'2021-01-01'}],['future',{contractStart:'2099-01-01',contractEnd:''}]]) {
      const f=fixture();db.prepare('UPDATE tenants SET contractStart=?,contractEnd=? WHERE id=?').run(dates.contractStart,dates.contractEnd,f.t);rebuildPropertyTenantReferences();
      const body=await entity('properties',f.p);assert.deepEqual(body.tenantIds,[]);assert.equal(row('tenants',f.t).propertyId,f.p);body.notes='Solo cambia una nota';
      const r=await request(`/properties/${f.p}`,'PUT',body);assert.equal(r.status,200,JSON.stringify(r));assert.equal(row('tenants',f.t).propertyId,'');
      evidence.push({contractStatus:status,response:r.status,before:f.p,after:row('tenants',f.t).propertyId,change:'notes only'});
    }
    return evidence;
  });
  await probe('N3-removing-last-owner-saves-broken-tenant',async()=>{
    const f=fixture();const body=await entity('properties',f.p);body.ownerIds=[];body.ownerPercentages={};body.tenantIds=[f.t];
    const r=await request(`/properties/${f.p}`,'PUT',body);assert.equal(r.status,200,JSON.stringify(r));assert.equal(row('tenants',f.t).ownerId,'');return {response:r.status,owners:r.data.ownerIds,tenantOwnerAfter:row('tenants',f.t).ownerId};
  });
  await probe('N4-partial-shares-saved-and-rewritten',async()=>{
    const f=fixture();const body=await entity('properties',f.p);body.ownerIds=[f.o,f.o2];body.ownerPercentages={[f.o]:60,[f.o2]:30};body.tenantIds=[f.t];
    const r=await request(`/properties/${f.p}`,'PUT',body);assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(r.data.ownerPercentages,{[f.o]:60,[f.o2]:30});
    const o=await entity('owners',f.o3);o.propertyIds=[f.p];delete o.propertyShares;
    const added=await request(`/owners/${f.o3}`,'PUT',o);assert.equal(added.status,200,JSON.stringify(added));
    const after=JSON.parse(row('properties',f.p).ownerPercentages);assert.equal(after[f.o],33.33);return {saved:r.data.ownerPercentages,afterAddingOwnerWithoutShares:after};
  });
  const plan={annualAmount:'1200',months:1,effectiveFrom:'2026-01-01',dueDay:5,mode:'coefficient',agreement:'Acuerdo de prueba'};
  await probe('N2-ordinary-cancel-cannot-reissue-one',()=>{
    const f=fixture();fees.savePlan(f.c,plan,admin);const p=fees.preview(f.c,'2026-01');const issued=fees.issue(f.c,{period:p.period,token:p.token},admin);
    fees.cancelReceipt(issued.ids[0],{reason:'Corrección'},admin);assert.throws(()=>fees.preview(f.c,'2026-01'),/solapa/);return {issued:2,cancelled:1,preview:'409 overlap'};
  });
  await probe('N1-N6-assessment-cancel-dead-end',()=>{
    const f=fixture();const a=fees.saveAssessment(f.c,{name:'Prueba',agreement:'Acuerdo',totalAmount:'100',mode:'coefficient',propertyIds:[f.p],installments:[{amount:'50',dueDate:'2026-01-05'},{amount:'50',dueDate:'2026-02-05'}]},admin);
    const p=fees.previewAssessment(a.id,1),issued=fees.issueAssessment(a.id,{installment:1,token:p.token},admin);
    fees.cancelReceipt(issued.ids[0],{reason:'Corrección'},admin);
    assert.throws(()=>fees.previewAssessment(a.id,1),/ya fue emitido/);assert.throws(()=>fees.cancelAssessment(a.id,{installment:1,reason:'Corrección'},admin),/ya está anulado/);
    return {installment:fees.assessmentView(fees.assessmentById(a.id)).installments[0],preview:'409 already issued',cancelInstallment:'409 already cancelled'};
  });
  await probe('N6-service-cancel-status-inconsistent',()=>{
    const f=fixture();const s=services.saveService(f.c,{service:'agua',period:'2026-01',issueDate:'2026-01-01',dueDate:'2026-01-05',totalAmount:'100',method:'coefficient',billing:'receipts',propertyIds:[f.p]},admin);
    const p=services.previewService(s.id),issued=services.issueService(s.id,{token:p.token},admin);fees.cancelReceipt(issued.ids[0],{reason:'Corrección'},admin);
    const view=services.serviceView(services.serviceBillById(s.id));assert.equal(view.status,'overdue');assert.equal(view.totals.outstanding,0);return {status:view.status,totals:view.totals,canEdit:view.canEdit};
  });
  await probe('N5-currency-change-after-issue',async()=>{
    const f=fixture();fees.savePlan(f.c,plan,admin);const p=fees.preview(f.c,'2026-01');fees.issue(f.c,{period:p.period,token:p.token},admin);
    const body=await entity('communities',f.c);body.currency='USD';const r=await request(`/communities/${f.c}`,'PUT',body);assert.equal(r.status,200,JSON.stringify(r));assert.throws(()=>fees.preview(f.c,'2026-02'),/euros/);
    return {response:r.status,currency:r.data.currency,existingReceipts:2,nextPreview:'400 currency'};
  });
  await probe('C3-liquidation-releases-credit-intentionally',async()=>{
    const f=fixture(),r=receipt(f);const p=pay(f,'40',[r]);const result=await cascade('owners',f.o,b=>{b.actions.finance='liquidate_final';});
    assert.equal(row('owners',f.o),undefined);assert.equal(fees.paymentView(row('fee_payments',p.id)).credit,4000);
    return {ownerDeleted:true,credit:4000,settlement:result.settlement,classification:'release is explicit and tested; deleted-owner credit has no normal future receipt target'};
  });
  await probe('M6-cascade-reassign-tenant-to-ownerless-property',async()=>{
    const f=fixture();db.prepare("UPDATE properties SET ownerIds='[]',ownerPercentages='{}' WHERE id=?").run(f.p2);
    await cascade('owners',f.o,b=>{b.actions.tenants[f.t]={action:'reassign_tenant',newPropertyId:f.p2};});
    assert.equal(row('tenants',f.t).propertyId,f.p2);assert.equal(row('tenants',f.t).ownerId,'');return {tenantProperty:f.p2,tenantOwner:'',classification:'cascade bypasses upsertTenant ownership check'};
  });
  await probe('C4-moved-property-retains-history-by-explicit-policy',async()=>{
    const f=fixture(),r=receipt(f);await cascade('owners',f.o,b=>{b.actions.properties[f.p]={action:'reassign_community',newCommunityId:f.c2};});
    assert.equal(row('properties',f.p).communityId,f.c2);assert.equal(row('fee_receipts',r).communityId,f.c);return {currentCommunity:f.c2,receiptCommunity:f.c,finance:'keep_historical',classification:'requires business policy; history need not follow property'};
  });
  await probe('C5-reversal-retains-valid-history-not-orphan',()=>{
    const f=fixture(),r=receipt(f);const p=pay(f,'40',[r]);fees.reversePayment(p.id,{reason:'Devuelto'},admin);
    const count=db.prepare('SELECT COUNT(*) n FROM fee_allocations a JOIN fee_payments p ON p.id=a.paymentId JOIN fee_receipts r ON r.id=a.receiptId WHERE a.paymentId=?').get(p.id).n;
    assert.equal(count,1);assert.equal(fees.receiptView(row('fee_receipts',r)).paid,0);return {validJoinedAllocations:count,paid:0,classification:'historical link, not orphan'};
  });
  await probe('C6-purge-leaves-notifications-and-proof-file',()=>{
    const f=fixture(),r=receipt(f);fees.notify(row('fee_receipts',r),'issued',r,'Prueba','Prueba');fees.adminNotice(row('fee_receipts',r),f.o,'Prueba');
    const proof=crypto.randomUUID();fs.mkdirSync(path.join(process.env.APP_UPLOADS_DIR,'fee-proofs'),{recursive:true});fs.writeFileSync(path.join(process.env.APP_UPLOADS_DIR,'fee-proofs',proof),'synthetic');
    insert('fee_proofs',{id:proof,receiptId:r,ownerId:f.o,fileName:'proof.pdf',diskName:proof,mime:'application/pdf',createdAt:new Date().toISOString(),actorId:admin.id});
    fees.cancelReceipt(r,{reason:'Corrección'},admin);fees.purgeReceipt(r,admin);
    const notifications=db.prepare('SELECT COUNT(*) n FROM owner_notifications WHERE feeReceiptId=?').get(r).n;const emails=db.prepare('SELECT COUNT(*) n FROM admin_emails WHERE feeReceiptId=?').get(r).n;
    assert.ok(notifications>0);assert.ok(emails>0);assert.ok(fs.existsSync(path.join(process.env.APP_UPLOADS_DIR,'fee-proofs',proof)));
    return {notifications,adminEmails:emails,proofRowDeleted:!row('fee_proofs',proof),physicalProofFileRemains:true};
  });
  await probe('H1-H11-route-permissions-enforced',async()=>{
    const f=fixture();fees.savePlan(f.c,plan,admin);const r=receipt(f),p=pay(f,'40',[r]);
    const a=fees.saveAssessment(f.c,{name:'Permisos',agreement:'Acuerdo',totalAmount:'100',mode:'coefficient',propertyIds:[f.p],installments:[{amount:'100',dueDate:'2026-01-05'}]},admin);
    const s=services.saveService(f.c,{service:'agua',period:'2026-01',issueDate:'2026-01-01',dueDate:'2026-01-05',totalAmount:'100',method:'coefficient',billing:'receipts',propertyIds:[f.p]},admin);
    const paths=[['POST',`/communities/${f.c}/plans`],['DELETE',`/communities/${f.c}/plans/${fees.plans(f.c)[0].id}`],['POST',`/communities/${f.c}/issue`],['POST',`/communities/${f.c}/assessments`],['POST',`/communities/${f.c}/payments`],['POST',`/payments/${p.id}/allocate`],['POST',`/payments/${p.id}/return`],['POST',`/receipts/${r}/cancel`],['POST',`/receipts/${r}/purge`],['POST',`/assessments/${a.id}/purge`],['POST',`/communities/${f.c}/services`],['PUT',`/services/${s.id}`]];
    const statuses=[];for(const [method,url] of paths)statuses.push((await request('/fees'+url,method,{},reader)).status);
    assert.ok(statuses.every(x=>x===403),JSON.stringify(statuses));return {endpoints:paths.length,statuses};
  });
  await probe('N7-concurrent-ballots-on-single-node',async()=>{
    const f=fixture(),voter=account('voter',['community:read','comm:participacion']);db.prepare('UPDATE owners SET userId=? WHERE id=?').run(voter.id,f.o);
    const id=crypto.randomUUID(),now=new Date().toISOString();
    const post={communityId:f.c,type:'notice',title:'Consulta',body:'Prueba',status:'published',publishAt:'2020-01-01T00:00:00.000Z',startsAt:'',endsAt:'',archiveAt:'',priority:'normal',channels:[],audience:{mode:'owners',ownerIds:[],tenantIds:[],propertyIds:[]},poll:{type:'vote',question:'Prueba',options:['Sí','No'],electorate:'owners',multiple:false,resultsLive:true,closesAt:'2099-01-01T00:00:00.000Z',closed:false}};
    insert('communication_posts',{id,communityId:f.c,data:JSON.stringify(post),createdAt:now,updatedAt:now,createdBy:admin.id});communication.materialize();
    const responses=await Promise.all(Array.from({length:8},()=>request(`/communications/posts/${id}/ballot`,'POST',{choices:[0]},voter)));const statuses=responses.map(r=>r.status).sort();
    assert.deepEqual(statuses,[201,409,409,409,409,409,409,409]);return {statuses,ballots:db.prepare('SELECT COUNT(*) n FROM communication_ballots WHERE postId=?').get(id).n,classification:'no SELECT/INSERT interleaving in this synchronous single-process handler; multi-process not exercised'};
  });
} finally {
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();
  const target=path.resolve(scratch);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert.ok(path.basename(target).startsWith('codex-business-review-'));fs.rmSync(target,{recursive:true,force:true});
  fs.writeFileSync(path.join(here,'results.json'),JSON.stringify({commit:'9350b73096ba48b35f6cac79a6ae0f5f8b6f5ba3',date:'2026-11-20',node:process.version,results},null,2)+'\n');
}
assert.ok(results.every(r=>r.verified),'Some probes failed; see results.json');
