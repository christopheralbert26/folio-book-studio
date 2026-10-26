import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {backupColumns,validateOperationsBackup} from '../server/operations-backup.js';
export async function restoreOperations(input,output){
 if(fs.statSync(input).size>24*1024*1024)throw Error('Backup is too large');
 const data=await validateOperationsBackup(JSON.parse(fs.readFileSync(input,'utf8')));
 if(path.extname(output)!=='.sqlite')throw Error('Choose a new .sqlite file for the isolated recovery database');
 // Exclusive creation prevents replacing any existing database or file.
 fs.closeSync(fs.openSync(output,'wx',0o600));
 const db=new DatabaseSync(output);
 try{
  db.exec('BEGIN');
  for(const name of ['0000_bizarre_iron_lad.sql','0001_condemned_squadron_supreme.sql'])db.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  for(const [table,columns] of Object.entries(backupColumns)){
   const stmt=db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
   for(const row of data[table])stmt.run(...columns.map(c=>row[c]));
  }
  const counts=Object.fromEntries(Object.keys(backupColumns).map(t=>[t,db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Database integrity check failed');
  db.exec('COMMIT');return {counts,integrity:'ok',scope:'Order and support records only; no manuscripts or print-file bytes'};
 }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}finally{db.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw Error('Usage: node scripts/restore-operations.mjs backup.json new-recovery.sqlite');
 console.log(JSON.stringify(await restoreOperations(input,output)));
}
