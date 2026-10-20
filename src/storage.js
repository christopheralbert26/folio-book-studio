import { openDB } from 'idb';
import {api,packFiles,unpackFiles} from './api';
const db = openDB('folio-private-studio', 1, { upgrade(db) { db.createObjectStore('projects', { keyPath: 'id' }); } });
const queues=new Map(),versions=new Map();
export function saveProject(project) {
 const previous=queues.get(project.id)||Promise.resolve();
 const next=previous.catch(()=>{}).then(async()=>{
  let status;
  try{status=await api('status');}catch(e){
   await (await db).put('projects',{...project,updated:Date.now()});
   throw Error('Device copy saved; account sync unavailable. '+e.message);
  }
  if(project._account&&project._account!==status.account)throw Error('Sign in to the account that owns this draft');
  const local={...project,_account:status.account,updated:Date.now()};
  await (await db).put('projects',local);
  const packed=await packFiles(local);
  const result=await api(`projects/${project.id}`,{project:packed,version:versions.get(project.id)??project._cloudVersion??0},'PUT');
  versions.set(project.id,result.version);
  await (await db).put('projects',{...local,_cloudVersion:result.version});
  return 'Saved to your account';
 });
 queues.set(project.id,next);return next;
}
export async function getProjects() {
 const status=await api('status'),rows=await api('projects');
 const cloud=[];
 for(const row of rows){
  const saved=await api(`projects/${row.id}`),project=saved.project;
  const coverArt=project.coverArt?await unpackFiles(project.coverArt):null;
  cloud.push({...project,coverArt,_cloudSummary:true,_account:status.account,_cloudVersion:saved.version});
 }
 const local=await (await db).getAll('projects');
 // Legacy drafts remain available on this device and migrate when the user opens them.
 return [...cloud,...local.filter(p=>!p._account&&!rows.some(r=>r.id===p.id))].sort((a,b)=>b.updated-a.updated);
}
export async function loadProject(id){
 const status=await api('status'),saved=await api(`projects/${id}`);
 return {...await unpackFiles(saved.project),_account:status.account,_cloudVersion:saved.version};
}
export async function deleteProject(id) {
 await (queues.get(id)||Promise.resolve()).catch(()=>{});
 const local=await (await db).get('projects',id);
 if(versions.has(id)||local?._cloudVersion)await api(`projects/${id}`,null,'DELETE');
 await (await db).delete('projects',id);versions.delete(id);
}
