import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handleApi} from '../server/api.js';
import {digest,hmac} from '../server/security.js';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(fs.readFileSync(new URL('../drizzle/0000_bizarre_iron_lad.sql',import.meta.url),'utf8'));
 sqlite.exec(fs.readFileSync(new URL('../drizzle/0001_condemned_squadron_supreme.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){return {bind(...args){const stmt=sqlite.prepare(sql);return {async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}};}};}};}};
 const objects=new Map();
 const BUCKET={async put(key,body){objects.set(key,typeof body==='string'?new TextEncoder().encode(body):body);},async delete(key){objects.delete(key);},async get(key){const b=objects.get(key);return b?{body:b,async json(){return JSON.parse(new TextDecoder().decode(b));},async arrayBuffer(){return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}}:null;}};
 return {env:{DB,BUCKET},sqlite,objects};
}
function request(path,user='alice',method='GET',body){return new Request('https://folio.test/api/'+path,{method,headers:{'oai-authenticated-user-id':user,Origin:'https://folio.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
test('projects survive round trips, isolate users and reject stale updates',async()=>{
 const {env,sqlite}=fixture(),project={id:'book',title:'Private manuscript',revision:1};
 assert.equal((await handleApi(request('projects/book','alice','PUT',{project,version:0}),env)).status,200);
 const read=await (await handleApi(request('projects/book'),env)).json();
 assert.equal(read.project.title,project.title);assert.equal(read.version,1);
 assert.equal((await handleApi(request('projects/book','bob'),env)).status,404);
 assert.equal((await handleApi(request('projects/book','bob','DELETE'),env)).status,404);
 assert.equal((await handleApi(request('projects/book','alice','PUT',{project:{...project,title:'Stale'},version:0}),env)).status,409);
 assert.equal((await handleApi(request('projects/book','alice','PUT',{project:{...project,title:'New'},version:1}),env)).status,200);
 assert.equal((await (await handleApi(request('projects/book'),env)).json()).project.title,'New');
 assert.equal((await handleApi(request('projects/book','alice','DELETE'),env)).status,200);
 assert.equal((await handleApi(request('projects/book'),env)).status,404);
 assert.equal((await handleApi(request('projects/book','alice','PUT',{project,version:2}),env)).status,409);
 sqlite.close();
});
test('stored bytes require matching checksums and owner-scoped references',async()=>{
 const {env,sqlite}=fixture(),bytes=new TextEncoder().encode('test asset'),hash=await digest(bytes);
 const upload=new Request('https://folio.test/api/files/'+hash,{method:'PUT',headers:{Origin:'https://folio.test','oai-authenticated-user-id':'alice'},body:bytes});
 assert.equal((await handleApi(upload,env)).status,201);
 assert.equal((await handleApi(request('files/'+hash,'bob'),env)).status,404);
 const project={id:'book',title:'Private',revision:1,asset:{$file:hash}};
 assert.equal((await handleApi(request('projects/book','bob','PUT',{project,version:0}),env)).status,400);
 assert.equal((await handleApi(request('projects/book','alice','PUT',{project,version:0}),env)).status,200);
 const invalid=new Request('https://folio.test/api/files/'+'0'.repeat(64),{method:'PUT',headers:{Origin:'https://folio.test','oai-authenticated-user-id':'alice'},body:bytes});
 assert.equal((await handleApi(invalid,env)).status,400);sqlite.close();
});


test('signed Lulu notifications update only existing orders, survive retries and preserve failures',async()=>{
 const {env,sqlite}=fixture();env.LULU_CLIENT_KEY='fixture';env.LULU_CLIENT_SECRET='secret';
 const orderId='test-order';
 sqlite.prepare("INSERT INTO orders (id,owner,edition_id,payload,state,total,currency,expires,updated,created,attempted,job_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(orderId,'alice','edition',JSON.stringify({environment:'sandbox',tracking:[]}),'production_delayed',1217,'usd',0,1,1,1,'353261');
 let providerCalls=0,fail=false;
 let job={id:353261,external_id:orderId,status:{name:'SHIPPED',changed:'2026-10-24T03:00:00Z'},line_items:[{tracking_urls:['https://carrier.test/track']}]};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.ok(!options.method||['GET','POST'].includes(options.method));
  if(String(url).includes('/token'))return Response.json({access_token:'fixture',expires_in:3600});
  assert.ok(String(url).endsWith('/print-jobs/353261/'));
  assert.equal(options.method,'GET');providerCalls++;
  return fail?new Response('',{status:503}):Response.json(job);
 };
 const deliver=async(id=353261,signature)=>{
  const raw=JSON.stringify({topic:'PRINT_JOB_STATUS_CHANGED',data:{id,status:{name:'REJECTED'}}});
  return handleApi(new Request('https://folio.test/api/lulu-webhook',{method:'POST',headers:{'lulu-hmac-sha256':signature||await hmac('secret',raw)},body:raw}),env);
 };
 try{
  assert.equal((await deliver(353261,'forged')).status,400);assert.equal(providerCalls,0);
  assert.equal((await deliver(999)).status,200);assert.equal(providerCalls,0);
  assert.equal((await deliver()).status,200);
  let row=sqlite.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  assert.equal(row.state,'shipped');assert.deepEqual(JSON.parse(row.payload).tracking,['https://carrier.test/track']);
  assert.equal((await deliver()).status,200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);
  job={...job,status:{name:'IN_PRODUCTION',changed:'2026-10-24T02:00:00Z'}};
  assert.equal((await deliver()).status,200);assert.equal(sqlite.prepare('SELECT state FROM orders').get().state,'shipped');
  fail=true;assert.equal((await deliver()).status,502);
  row=sqlite.prepare('SELECT * FROM orders').get();assert.equal(row.state,'shipped');assert.ok(JSON.parse(row.payload).syncError);
  fail=false;job={...job,status:{name:'SHIPPED',changed:'2026-10-24T03:00:00Z'}};
  assert.equal((await deliver()).status,200);assert.equal(JSON.parse(sqlite.prepare('SELECT payload FROM orders').get().payload).syncError,undefined);
  const calls=providerCalls;env.LULU_ENVIRONMENT='production';
  assert.equal((await deliver()).status,409);assert.equal(providerCalls,calls);
 }finally{globalThis.fetch=originalFetch;sqlite.close();}
});


test('support is owner-isolated, operator-only, versioned and does not change payments',async()=>{
 const {env,sqlite}=fixture();const alice=await digest(new TextEncoder().encode('alice'));
 env.SUPPORT_OWNER_HASH=await digest(new TextEncoder().encode('operator'));
 sqlite.prepare("INSERT INTO orders (id,owner,edition_id,payload,state,total,currency,expires,updated,created,attempted) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run('support-order',alice,'edition','{"title":"Private book","address":{"name":"Private address"}}','in_production',1217,'usd',0,1,1,1);
 const body={message:'Please review my order.',category:'refund',version:0,messageId:'msg-one',status:'resolved',actor:'support'};
 assert.equal((await handleApi(request('admin/orders','alice'),env)).status,403);
 assert.equal((await handleApi(request('support/support-order','bob','POST',body),env)).status,404);
 assert.equal((await handleApi(request('support/support-order','alice','POST',body),env)).status,200);
 let data=await (await handleApi(request('support/support-order','alice'),env)).json();
 assert.equal(data.ticket.status,'open');assert.equal(data.ticket.messages[0].actor,'customer');
 assert.equal((await handleApi(request('support/support-order','bob'),env)).status,404);
 assert.equal((await handleApi(request('support/support-order','alice','POST',body),env)).status,200);
 assert.equal((await handleApi(request('support/support-order','alice','POST',{...body,messageId:'stale'}),env)).status,409);
 const reply={message:'Test request resolved; no money moved.',status:'resolved',version:1,messageId:'reply-one'};
 assert.equal((await handleApi(request('admin/orders/support-order','alice','POST',reply),env)).status,403);
 assert.equal((await handleApi(request('admin/orders/support-order','operator','POST',reply),env)).status,200);
 data=await (await handleApi(request('support/support-order','alice'),env)).json();assert.equal(data.ticket.messages.length,2);assert.equal(data.ticket.status,'resolved');
 assert.equal(sqlite.prepare('SELECT state FROM orders').get().state,'in_production');
 assert.equal((await handleApi(request('support/support-order','alice','POST',{...body,version:2,messageId:'follow-up'}),env)).status,200);
 data=await (await handleApi(request('admin/orders','operator'),env)).json();assert.equal(data.orders[0].support_status,'open');assert.equal(data.orders[0].payload,undefined);
 const cross=new Request('https://folio.test/api/admin/orders/support-order',{method:'POST',headers:{'oai-authenticated-user-id':'operator',Origin:'https://evil.test'},body:JSON.stringify(reply)});
 assert.equal((await handleApi(cross,env)).status,403);
 delete env.SUPPORT_OWNER_HASH;assert.equal((await handleApi(request('admin/orders','operator'),env)).status,403);
 sqlite.close();
});


test('owner backups restore offline with intact submission locks and reject corruption',async(t)=>{
 const {env,sqlite}=fixture();const {restoreOperations}=await import('../scripts/restore-operations.mjs');
 const os=await import('node:os'),path=await import('node:path');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'folio-recovery-'));
 t.after(()=>{sqlite.close();if(path.dirname(directory)===os.tmpdir())fs.rmSync(directory,{recursive:true});});
 env.SUPPORT_OWNER_HASH=await digest(new TextEncoder().encode('operator'));
 sqlite.prepare("INSERT INTO orders (id,owner,edition_id,payload,state,total,currency,expires,updated,created,attempted,payment_id,job_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run('recovery-order','alice','edition','{"title":"Test","address":{"name":"Fixture"}}','in_production',1217,'usd',0,1,1,1,'cs_test_fixture','353261');
 sqlite.prepare('INSERT INTO events VALUES (?,?,?,?,?)').run('event','recovery-order','submitted','Submitted once',1);
 sqlite.prepare('INSERT INTO support VALUES (?,?,?,?,?,?,?,?)').run('recovery-order','alice','order','resolved','[{"id":"message","text":"Fixture"}]',1,1,1);
 assert.equal((await handleApi(request('admin/backup','alice'),env)).status,403);
 const response=await handleApi(request('admin/backup','operator'),env);
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(response.headers.get('content-disposition').includes('attachment'));
 const backup=await response.json(),input=path.join(directory,'backup.json'),output=path.join(directory,'recovery.sqlite');
 fs.writeFileSync(input,JSON.stringify(backup));
 const result=await restoreOperations(input,output);assert.deepEqual(result.counts,{orders:1,events:1,support:1});
 const restored=new DatabaseSync(output);assert.equal(restored.prepare('SELECT attempted FROM orders').get().attempted,1);assert.equal(restored.prepare('SELECT job_id FROM orders').get().job_id,'353261');assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM projects').get().n,0);restored.close();
 await assert.rejects(restoreOperations(input,output),/EEXIST/);
 fs.writeFileSync(input,JSON.stringify({...backup,payload:backup.payload+' '}));
 await assert.rejects(restoreOperations(input,path.join(directory,'corrupt.sqlite')),/checksum/);assert.equal(fs.existsSync(path.join(directory,'corrupt.sqlite')),false);
 const broken=JSON.parse(backup.payload);broken.support[0].owner='other';const payload=JSON.stringify(broken);
 fs.writeFileSync(input,JSON.stringify({...backup,payload,checksum:await digest(new TextEncoder().encode(payload))}));
 await assert.rejects(restoreOperations(input,path.join(directory,'broken.sqlite')),/references/);
 delete env.SUPPORT_OWNER_HASH;assert.equal((await handleApi(request('admin/backup','operator'),env)).status,403);
});


test('full recovery preserves manuscripts, account boundaries and fulfillment references',async(t)=>{
 const {env,sqlite,objects}=fixture(),{restoreFull}=await import('../scripts/restore-full.mjs');
 const {default:JSZip}=await import('jszip'),os=await import('node:os'),path=await import('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'folio-full-'));
 t.after(()=>{sqlite.close();if(path.dirname(dir)===os.tmpdir())fs.rmSync(dir,{recursive:true});});
 const owner=await digest(new TextEncoder().encode('alice')),bytes=new TextEncoder().encode('original manuscript bytes'),hash=await digest(bytes),key=`users/${owner}/projects/book/version-one.json`;
 env.SUPPORT_OWNER_HASH=await digest(new TextEncoder().encode('operator'));env.STRIPE_SECRET_KEY='must-not-export';
 sqlite.prepare('INSERT INTO files VALUES (?,?,?,?)').run(owner,hash,bytes.length,1);objects.set(`users/${owner}/files/${hash}`,bytes);
 sqlite.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?)').run(owner,'book','Test book',key,1,1,0);
 objects.set(key,new TextEncoder().encode(JSON.stringify({id:'book',title:'Test book',source:{$file:hash}})));
 sqlite.prepare('INSERT INTO editions VALUES (?,?,?,?,?,?,?,?)').run('edition',owner,'book',1,JSON.stringify({interiorHash:hash,coverHash:hash}),1,'approved',null);
 sqlite.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('order',owner,'edition','{}','in_production',1217,'usd',0,'cs_test','353261',1,1,1);
 assert.equal((await handleApi(request('admin/full-backup','alice'),env)).status,403);
 const snapshot=await (await handleApi(request('admin/full-backup','operator'),env)).json();assert.equal(snapshot.objects.length,2);assert.ok(!JSON.stringify(snapshot).includes('must-not-export'));
 const zip=new JSZip();
 for(const object of snapshot.objects){
  const route='admin/backup-object?key='+encodeURIComponent(object.key);
  assert.equal((await handleApi(request(route,'alice'),env)).status,403);
  const response=await handleApi(request(route,'operator'),env);assert.equal(response.status,200);
  const content=new Uint8Array(await response.arrayBuffer());object.sha256=await digest(content);object.bytes=content.length;zip.file('objects/'+object.key,content);
 }
 assert.equal((await handleApi(request('admin/backup-object?key=../../secret','operator'),env)).status,404);
 zip.file('snapshot.json',JSON.stringify(snapshot));const input=path.join(dir,'backup.zip'),output=path.join(dir,'restored');fs.writeFileSync(input,await zip.generateAsync({type:'nodebuffer'}));
 const result=await restoreFull(input,output);assert.equal(result.objects,2);assert.equal(result.tables.editions,1);
 assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(output,'objects',`users/${owner}/files/${hash}`))),bytes);
 const db=new DatabaseSync(path.join(output,'database.sqlite'));assert.equal(db.prepare('SELECT attempted FROM orders').get().attempted,1);assert.equal(db.prepare('SELECT owner FROM projects').get().owner,owner);db.close();
 await assert.rejects(restoreFull(input,output),/EEXIST/);
 zip.file('objects/'+snapshot.objects[0].key,new Uint8Array(bytes.length));fs.writeFileSync(input,await zip.generateAsync({type:'nodebuffer'}));await assert.rejects(restoreFull(input,path.join(dir,'corrupt')),/checksum/);assert.equal(fs.existsSync(path.join(dir,'corrupt')),false);
 objects.delete(key);assert.equal((await handleApi(request('admin/backup-object?key='+encodeURIComponent(key),'operator'),env)).status,409);
});
