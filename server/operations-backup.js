import {assert,digest} from './security.js';
export const backupColumns={
 orders:['id','owner','edition_id','payload','state','total','currency','expires','payment_id','job_id','attempted','updated','created'],
 events:['id','order_id','kind','message','created'],
 support:['order_id','owner','category','status','messages','version','created','updated']
};
export async function exportOperations(db){
 // One SQL read provides a consistent snapshot of all three tables.
 const fields=Object.entries(backupColumns).map(([table,columns])=>`'${table}',json((SELECT json_group_array(json_object(${columns.map(c=>`'${c}',${c}`).join(',')})) FROM ${table}))`).join(',');
 const sql=`SELECT CASE WHEN (SELECT COUNT(*) FROM orders)<=5000 AND (SELECT COUNT(*) FROM events)<=50000 AND (SELECT COUNT(*) FROM support)<=5000 AND ((SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM orders)+(SELECT COALESCE(SUM(length(CAST(message AS BLOB))),0) FROM events)+(SELECT COALESCE(SUM(length(CAST(messages AS BLOB))),0) FROM support))<=4194304 THEN json_object(${fields}) ELSE NULL END AS snapshot`;
 const row=await db.prepare(sql).bind().first();
 assert(row?.snapshot,413,'This data exceeds the download limit. Arrange a managed database export. No partial backup was created.');
 const payload=row.snapshot;
 assert(new TextEncoder().encode(payload).length<=8*1024*1024,413,'This data exceeds the download limit. No partial backup was created.');
 return {format:'folio-order-support-backup',version:1,created:new Date().toISOString(),scope:'orders-events-support',checksum:await digest(new TextEncoder().encode(payload)),payload};
}
export async function validateOperationsBackup(backup){
 assert(backup?.format==='folio-order-support-backup'&&backup.version===1&&backup.scope==='orders-events-support',400,'Unsupported operations backup');
 assert(typeof backup.payload==='string'&&new TextEncoder().encode(backup.payload).length<=8*1024*1024,400,'Backup exceeds the restore limit');
 assert(await digest(new TextEncoder().encode(backup.payload))===backup.checksum,400,'Backup checksum failed');
 const data=JSON.parse(backup.payload);
 for(const [table,columns] of Object.entries(backupColumns)){
  assert(Array.isArray(data[table]),400,'Missing backup table');
  const seen=new Set();
  for(const row of data[table]){
   assert(row&&Object.keys(row).length===columns.length&&columns.every(c=>Object.hasOwn(row,c)),400,'Unexpected backup columns');
   assert(columns.every(c=>row[c]===null||typeof row[c]==='string'||(typeof row[c]==='number'&&Number.isSafeInteger(row[c]))),400,'Invalid backup value');
   const key=row[columns[0]];assert(typeof key==='string'&&!seen.has(key),400,'Duplicate or invalid record ID');seen.add(key);
  }
 }
 const owners=new Map(data.orders.map(o=>[o.id,o.owner]));
 assert(data.events.every(e=>owners.has(e.order_id))&&data.support.every(s=>owners.get(s.order_id)===s.owner),400,'Broken order references');
 return data;
}
