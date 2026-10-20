export async function api(path,body,method){
 const r=await fetch(`/api/${path}`,{method:method||(body?'POST':'GET'),credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 const value=await r.json().catch(()=>({error:'The account service is unavailable'}));
 if(!r.ok){const e=Error(value.error||'Request failed');e.status=r.status;throw e;}return value;
}
export async function fileHash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function uploadBytes(bytes){
 const hash=await fileHash(bytes);
 const r=await fetch(`/api/files/${hash}`,{method:'PUT',body:bytes,headers:{'Content-Type':'application/octet-stream'}});
 if(!r.ok)throw Error((await r.json()).error||'File upload failed');return hash;
}
export async function packFiles(value,upload=uploadBytes){
 if(value instanceof Uint8Array||value instanceof ArrayBuffer)return {$file:await upload(value instanceof ArrayBuffer?new Uint8Array(value):value)};
 if(Array.isArray(value)){const a=[];for(const v of value)a.push(await packFiles(v,upload));return a;}
 if(value&&typeof value==='object'){const o={};for(const [k,v] of Object.entries(value))if(!k.startsWith('_cloud')&&k!=='_account')o[k]=await packFiles(v,upload);return o;}
 return value;
}
export async function unpackFiles(value,read=async hash=>{
 const r=await fetch(`/api/files/${hash}`);if(!r.ok)throw Error('A saved file could not be loaded');return new Uint8Array(await r.arrayBuffer());
}){
 if(value?.$file)return read(value.$file);
 if(Array.isArray(value)){const a=[];for(const v of value)a.push(await unpackFiles(v,read));return a;}
 if(value&&typeof value==='object'){const o={};for(const [k,v] of Object.entries(value))o[k]=await unpackFiles(v,read);return o;}
 return value;
}
