import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import JSZip from 'jszip';
import {fullColumns,validateFullSnapshot} from '../server/full-backup.js';
import {digest} from '../server/security.js';
function requireValue(ok,message){if(!ok)throw Error(message);}
export async function readFullBackup(input){
 requireValue(fs.statSync(input).size<=180*1024*1024,'Archive exceeds restore limit');
 const zip=await JSZip.loadAsync(fs.readFileSync(input));
 requireValue(Object.values(zip.files).reduce((n,f)=>n+(f._data?.uncompressedSize||0),0)<=180*1024*1024,'Expanded archive exceeds restore limit');
 const manifestFile=zip.file('snapshot.json');requireValue(manifestFile&&manifestFile._data.uncompressedSize<=16*1024*1024,'Missing or oversized snapshot');
 const snapshot=JSON.parse(await manifestFile.async('string')),data=await validateFullSnapshot(snapshot),objects=new Map();
 requireValue(Object.values(zip.files).filter(f=>!f.dir).length===snapshot.objects.length+1,'Unexpected archive entries');
 for(const object of snapshot.objects){
  const name='objects/'+object.key,file=zip.file(name);requireValue(file&&(!file.unsafeOriginalName||file.unsafeOriginalName===name),'Missing or unsafe object path');
  requireValue(file._data.uncompressedSize===object.bytes,'Object length mismatch');
  const bytes=await file.async('uint8array');requireValue(await digest(bytes)===object.sha256,'Object checksum failed');objects.set(object.key,bytes);
 }
 const files=new Set(data.files.map(f=>`${f.owner}:${f.hash}`));
 function references(value,owner,depth=0){requireValue(depth<80,'Manifest is too deeply nested');if(value&&typeof value==='object'){if(value.$file)requireValue(files.has(`${owner}:${value.$file}`),'Missing manuscript reference');else for(const v of Object.values(value))references(v,owner,depth+1);}}
 for(const p of data.projects.filter(p=>!p.deleted)){
  const project=JSON.parse(new TextDecoder().decode(objects.get(p.object_key)));requireValue(project.id===p.id,'Project manifest identity mismatch');references(project,p.owner);
 }
 for(const e of data.editions){const m=JSON.parse(e.manifest);for(const hash of [m.interiorHash,m.coverHash])requireValue(files.has(`${e.owner}:${hash}`),'Missing immutable print file');}
 return {snapshot,data,objects};
}
export async function restoreFull(input,output){
 const {snapshot,data,objects}=await readFullBackup(input);
 // A fresh directory is mandatory. No existing checkout, DB or live storage can be overwritten.
 fs.mkdirSync(output,{mode:0o700});const root=path.resolve(output),db=new DatabaseSync(path.join(root,'database.sqlite'));
 try{
  db.exec('BEGIN');
  for(const name of ['0000_bizarre_iron_lad.sql','0001_condemned_squadron_supreme.sql'])db.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  for(const [table,columns] of Object.entries(fullColumns)){
   const insert=db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
   for(const row of data[table])insert.run(...columns.map(c=>row[c]));
  }
  for(const [key,bytes] of objects){
   const target=path.resolve(root,'objects',key);requireValue(target.startsWith(root+path.sep+'objects'+path.sep),'Unsafe destination');fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});
  }
  requireValue(db.prepare('PRAGMA integrity_check').get().integrity_check==='ok','Database integrity check failed');
  db.exec('COMMIT');
  const result={created:snapshot.created,tables:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),objects:objects.size,integrity:'ok',references:'verified',liveDataModified:false};
  fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});return result;
 }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}finally{db.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/restore-full.mjs full-backup.zip new-recovery-directory');
 console.log(JSON.stringify(await restoreFull(input,output)));
}
