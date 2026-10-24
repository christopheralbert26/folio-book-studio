import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handleApi} from '../server/api.js';
import {digest,hmac} from '../server/security.js';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(fs.readFileSync(new URL('../drizzle/0000_bizarre_iron_lad.sql',import.meta.url),'utf8'));
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
