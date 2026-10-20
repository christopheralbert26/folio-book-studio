export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export const assert=(test,status,message)=>{if(!test)throw new HttpError(status,message);};
export const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
export const validHash=hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash);
export async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function jsonBody(request,max=2*1024*1024){
 const raw=await limitedBody(request,max);try{return JSON.parse(new TextDecoder().decode(raw));}catch{throw new HttpError(400,'Invalid JSON');}
}
export async function limitedBody(request,max){
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;assert(size<=max,413,'This file is too large');chunks.push(value);}}catch(e){await reader.cancel();throw e;}
 const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}return bytes;
}
export function sameOrigin(request){
 assert(request.headers.get('origin')===new URL(request.url).origin,403,'Open this action from Folio');
}
export async function hmac(secret,text){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function constantEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export async function verifyStripeSignature(raw,header,secret,now=Date.now()){
 assert(secret&&header,400,'Missing webhook signature');
 const parts=header.split(',').map(p=>p.split('='));
 const t=parts.find(p=>p[0]==='t')?.[1];
 assert(t&&Math.abs(now/1000-Number(t))<=300,400,'Expired webhook signature');
 const expected=await hmac(secret,`${t}.${raw}`);
 assert(parts.some(p=>p[0]==='v1'&&constantEqual(p[1],expected)),400,'Invalid webhook signature');
}
export function moneyMinor(value){
 assert(typeof value==='string'&&/^\d+\.\d{2}$/.test(value),502,'Unsupported price precision');
 const [whole,cents]=value.split('.');const amount=Number(whole)*100+Number(cents);
 assert(Number.isSafeInteger(amount)&&amount>0,502,'Invalid price');return amount;
}
