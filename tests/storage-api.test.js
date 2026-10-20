import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handleApi} from '../server/api.js';
import {digest} from '../server/security.js';
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
