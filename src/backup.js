import JSZip from 'jszip';
import {packFiles,unpackFiles,fileHash} from './api';
import {download} from './generation';
import {loadProject} from './storage';
export async function exportProject(project){
 if(project._cloudSummary)project=await loadProject(project.id);
 const zip=new JSZip();
 const manifest=await packFiles(project,async bytes=>{const hash=await fileHash(bytes);zip.file(`files/${hash}`,bytes);return hash;});
 zip.file('folio.json',JSON.stringify({format:'folio-project',version:1,project:manifest}));
 download(await zip.generateAsync({type:'uint8array',compression:'STORE'}),`${project.title}.folio.zip`,'application/zip');
}
export async function importProject(file){
 if(file.size>150*1024*1024)throw Error('Backup exceeds 150 MB');
 const zip=await JSZip.loadAsync(file);
 if(Object.values(zip.files).reduce((n,f)=>n+(f._data?.uncompressedSize||0),0)>200*1024*1024)throw Error('Backup is too large');
 const manifest=JSON.parse(await zip.file('folio.json')?.async('string'));
 if(manifest.format!=='folio-project'||manifest.version!==1)throw Error('Unsupported Folio backup');
 const project=await unpackFiles(manifest.project,async hash=>{
  const bytes=await zip.file(`files/${hash}`)?.async('uint8array');
  if(!bytes||await fileHash(bytes)!==hash)throw Error('Backup file checksum failed');return bytes;
 });
 if(!project.layout||!Array.isArray(project.illustrations)||typeof project.title!=='string')throw Error('Invalid project backup');
 return {...project,id:crypto.randomUUID(),approved:null,updated:Date.now(),_cloudVersion:0};
}
