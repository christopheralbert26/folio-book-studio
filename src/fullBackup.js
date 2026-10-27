import JSZip from 'jszip';
import {api,fileHash} from './api';
export async function downloadFullBackup(onProgress){
 const snapshot=await api('admin/full-backup'),zip=new JSZip();let total=0;
 for(let i=0;i<snapshot.objects.length;i++){
  const object=snapshot.objects[i];onProgress(`Backing up file ${i+1} of ${snapshot.objects.length}…`);
  const response=await fetch(`/api/admin/backup-object?key=${encodeURIComponent(object.key)}`,{credentials:'same-origin'});
  if(!response.ok)throw Error('A file could not be backed up. Nothing was downloaded. Start a fresh backup.');
  const bytes=new Uint8Array(await response.arrayBuffer());total+=bytes.length;
  if(total>150*1024*1024)throw Error('Backup exceeds the browser download limit. Use managed storage export.');
  const hash=await fileHash(bytes);
  if(object.hash&&(hash!==object.hash||bytes.length!==object.size))throw Error('A stored file failed verification. Nothing was downloaded.');
  object.sha256=hash;object.bytes=bytes.length;zip.file(`objects/${object.key}`,bytes);
 }
 zip.file('snapshot.json',JSON.stringify(snapshot));onProgress('Preparing verified archive…');
 const bytes=await zip.generateAsync({type:'uint8array',compression:'STORE'});
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'})),link=document.createElement('a');link.href=url;link.download=`folio-full-${new Date().toISOString().slice(0,10)}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 onProgress(`Backup downloaded: ${snapshot.objects.length} verified files. Keep it private.`);
}
