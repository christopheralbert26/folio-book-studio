import {assert,digest,validHash,validId} from './security.js';
import {backupColumns} from './operations-backup.js';
export const fullColumns={...backupColumns,
 projects:['owner','id','title','object_key','version','updated','deleted'],
 files:['owner','hash','size','created'],
 editions:['id','owner','project_id','revision','manifest','created','status','validation']
};
export function objectInventory(data){
 const result=data.files.map(f=>{assert(validHash(f.owner)&&validHash(f.hash)&&Number.isSafeInteger(f.size)&&f.size>0&&f.size<=32*1024*1024,400,'Invalid file record');return {key:`users/${f.owner}/files/${f.hash}`,hash:f.hash,size:f.size};});
 for(const p of data.projects.filter(p=>!p.deleted)){
  assert(validHash(p.owner)&&validId(p.id)&&new RegExp(`^users/${p.owner}/projects/${p.id}/[a-zA-Z0-9_-]+\\.json$`).test(p.object_key),400,'Invalid project object key');
  result.push({key:p.object_key});
 }
 assert(result.length<=1000&&new Set(result.map(o=>o.key)).size===result.length,413,'Too many objects for a browser backup');
 return result;
}
export async function fullSnapshot(db){
 const fields=Object.entries(fullColumns).map(([t,cols])=>`'${t}',json((SELECT json_group_array(json_object(${cols.map(c=>`'${c}',${c}`).join(',')})) FROM ${t}))`).join(',');
 const limits=Object.keys(fullColumns).map(t=>`(SELECT COUNT(*) FROM ${t})<=${t==='events'?50000:5000}`).join(' AND ');
 const sql=`SELECT CASE WHEN ${limits} AND (SELECT COALESCE(SUM(size),0) FROM files)<=125829120 AND ((SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM orders)+(SELECT COALESCE(SUM(length(CAST(messages AS BLOB))),0) FROM support)+(SELECT COALESCE(SUM(length(CAST(manifest AS BLOB))),0) FROM editions))<=4194304 THEN json_object(${fields}) ELSE NULL END AS snapshot`;
 const row=await db.prepare(sql).bind().first();assert(row?.snapshot,413,'The site exceeds browser-backup limits. Use a managed database and object-storage export. No partial backup was created.');
 const payload=row.snapshot;assert(new TextEncoder().encode(payload).length<=8*1024*1024,413,'Snapshot exceeds backup limit');
 const data=JSON.parse(payload),objects=objectInventory(data);
 return {format:'folio-full-application-backup',version:1,created:new Date().toISOString(),payload,checksum:await digest(new TextEncoder().encode(payload)),objects};
}
export async function backupObject(env,key){
 assert(typeof key==='string'&&key.length<400,400,'Invalid object key');
 const match=key.match(/^users\/([a-f0-9]{64})\/files\/([a-f0-9]{64})$/);
 const row=match?await env.DB.prepare('SELECT hash FROM files WHERE owner=? AND hash=?').bind(match[1],match[2]).first():await env.DB.prepare('SELECT id FROM projects WHERE object_key=? AND deleted=0').bind(key).first();
 assert(row,404,'Backup object is no longer indexed. Start a fresh backup.');
 const object=await env.BUCKET.get(key);assert(object,409,'A backup object is missing or changed. Start a fresh backup.');return object;
}
export async function validateFullSnapshot(snapshot){
 assert(snapshot?.format==='folio-full-application-backup'&&snapshot.version===1,400,'Unsupported full backup');
 assert(typeof snapshot.payload==='string'&&new TextEncoder().encode(snapshot.payload).length<=8*1024*1024,400,'Invalid snapshot size');
 assert(await digest(new TextEncoder().encode(snapshot.payload))===snapshot.checksum,400,'Database checksum failed');
 const data=JSON.parse(snapshot.payload);
 for(const [table,cols] of Object.entries(fullColumns)){
  assert(Array.isArray(data[table]),400,'Missing database table');const seen=new Set();
  for(const row of data[table]){
   assert(row&&Object.keys(row).length===cols.length&&cols.every(c=>Object.hasOwn(row,c)&&(row[c]===null||typeof row[c]==='string'||Number.isSafeInteger(row[c]))),400,'Invalid database record');
   const key=['projects','files'].includes(table)?JSON.stringify([row.owner,row[cols[1]]]):row[cols[0]];assert(typeof key==='string'&&!seen.has(key),400,'Duplicate record');seen.add(key);
  }
 }
 const orders=new Map(data.orders.map(o=>[o.id,o.owner])),editions=new Map(data.editions.map(e=>[e.id,e.owner]));
 assert(data.orders.every(o=>editions.get(o.edition_id)===o.owner),400,'Missing or mismatched edition');
 assert(data.events.every(e=>orders.has(e.order_id))&&data.support.every(s=>orders.get(s.order_id)===s.owner),400,'Broken order references');
 const objects=objectInventory(data);assert(Array.isArray(snapshot.objects)&&objects.length===snapshot.objects.length,400,'Object inventory mismatch');
 const inventory=new Map(snapshot.objects.map(o=>[o.key,o]));assert(inventory.size===objects.length,400,'Duplicate backup object');
 for(const o of objects){const actual=inventory.get(o.key);assert(actual&&validHash(actual.sha256)&&Number.isSafeInteger(actual.bytes)&&actual.bytes>0&&(!o.hash||(actual.sha256===o.hash&&actual.bytes===o.size)),400,'Invalid object checksum or length');}
 return data;
}
