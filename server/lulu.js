import {PrintProvider,ProviderUnavailable} from './provider.js';
// Adapter seam based on Lulu's official OpenAPI, checked 2026-10-19.
// Used by the authenticated fulfillment service.
export class LuluProvider extends PrintProvider {
 constructor({clientKey,clientSecret,sandbox=true,profiles=[],fetchImpl=fetch}){super();this.key=clientKey;this.secret=clientSecret;this.base=sandbox?'https://api.sandbox.lulu.com':'https://api.lulu.com';this.profiles=profiles;this.fetch=fetchImpl;}
 async token(){
  if(!this.key||!this.secret)throw new ProviderUnavailable();
  if(this.auth&&this.expires>Date.now()+60000)return this.auth;
  const response=await this.fetch(`${this.base}/auth/realms/glasstree/protocol/openid-connect/token`,{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`Basic ${btoa(this.key+':'+this.secret)}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  if(!response.ok)throw new ProviderUnavailable('Lulu authentication failed. Check server credentials.');
  const data=await response.json();this.auth=data.access_token;this.expires=Date.now()+data.expires_in*1000;return this.auth;
 }
 async request(path,body){const token=await this.token();const response=await this.fetch(this.base+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(25000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok){const error=new Error(`Lulu request failed (${response.status}). Your project is preserved. Check the address, product and provider configuration.`);error.status=502;throw error;}return response.json();}
 async formats({pageCount}){return {mode:'connected',formats:this.profiles.filter(p=>p.provider==='lulu'&&p.verifiedAt&&pageCount>=p.minPages&&pageCount<=p.maxPages)};}
 async quote(payload){return this.request('/print-job-cost-calculations/',payload);}
 async coverDimensions(payload){return this.request('/cover-dimensions/',payload);}
 async validateInterior(payload){return this.request('/validate-interior/',payload);}
 async validateCover(payload){return this.request('/validate-cover/',payload);}
 async validation(kind,id){if(!['interior','cover'].includes(kind))throw Error('Invalid validation type');return this.request(`/validate-${kind}/${encodeURIComponent(id)}/`);}
 // Caller must be the trusted fulfillment service, not an HTTP body passed through.
 async submit(){throw new ProviderUnavailable('Submission is locked until durable payment, storage, and preflight adapters are implemented and sandbox-tested.');}
 async status(id){return this.request(`/print-jobs/${encodeURIComponent(id)}/`);}
}

// Lulu exposes tracking on line items and in status messages across lifecycle responses.
export function trackingUrls(job){
 const rows=[...(job.line_items||[]),...(job.status?.line_item_statuses||[])];
 const values=rows.flatMap(i=>[i.tracking_urls,i.status?.messages?.tracking_urls,i.messages?.tracking_urls]).flat().filter(v=>typeof v==='string');
 return [...new Set(values.filter(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}))];
}
