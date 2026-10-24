import {PDFDocument} from 'pdf-lib';
import {assert,validId,validHash,digest,jsonBody,limitedBody,sameOrigin,hmac,constantEqual,HttpError,verifyStripeSignature,moneyMinor} from './security.js';
import {readiness,profiles} from './readiness.js';
import {LuluProvider,trackingUrls} from './lulu.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fileKey=(owner,hash)=>`users/${owner}/files/${hash}`;
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const provider=env=>new LuluProvider({clientKey:env.LULU_CLIENT_KEY,clientSecret:env.LULU_CLIENT_SECRET,sandbox:env.LULU_ENVIRONMENT!=='production',profiles:profiles(env)});
async function owned(db,table,id,owner){assert(['editions','orders'].includes(table),500,'Invalid table');const row=await one(db,`SELECT * FROM ${table} WHERE id=? AND owner=?`,id,owner);assert(row,404,'Not found');return row;}
async function signedFile(env,origin,owner,hash){
 assert(env.EXTERNAL_DELIVERY_VERIFIED==='true'&&env.FILE_SIGNING_SECRET,503,'Printer file delivery has not been connected and tested');
 const expires=Date.now()+24*3600*1000;const sig=await hmac(env.FILE_SIGNING_SECRET,`${owner}:${hash}:${expires}`);
 return `${origin}/api/print-file?owner=${encodeURIComponent(owner)}&hash=${hash}&expires=${expires}&sig=${sig}`;
}
async function refsIn(value,out=new Set(),depth=0){
 assert(depth<80,400,'Project nesting is too deep');
 if(value&&typeof value==='object'){
  if(value.$file){assert(validHash(value.$file),400,'Invalid file reference');out.add(value.$file);}
  else for(const v of Object.values(value))await refsIn(v,out,depth+1);
 }return out;
}
async function verifyRefs(env,owner,value){
 const hashes=await refsIn(value);assert(hashes.size<=300,400,'Too many files in this project');
 for(const hash of hashes)assert(await one(env.DB,'SELECT hash FROM files WHERE owner=? AND hash=?',owner,hash),400,'Upload referenced files before saving');
}
async function readPdf(env,owner,hash){
 assert(validHash(hash),400,'Invalid PDF reference');
 const object=await env.BUCKET.get(fileKey(owner,hash));assert(object,404,'PDF is missing');
 try{return await PDFDocument.load(await object.arrayBuffer());}catch{throw new HttpError(400,'An unlocked, valid PDF is required');}
}
async function event(env,id,kind,message){
 await run(env.DB,'INSERT INTO events (id,order_id,kind,message,created) VALUES (?,?,?,?,?)',crypto.randomUUID(),id,kind,message,Date.now());
}
async function stripe(env,path,body,key){
 assert(env.STRIPE_SECRET_KEY,503,'Stripe is not connected');
 const r=await fetch(`https://api.stripe.com/v1${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:new URLSearchParams(body)}:{})});
 assert(r.ok,502,'Payment service could not complete this request. Your files are safe.');return r.json();
}
export function matchingPayment(order,session,sandbox){
 return session.payment_status==='paid'&&session.client_reference_id===order.id&&session.amount_total===order.total&&session.currency===order.currency&&session.livemode===!sandbox;
}
async function reconcile(env,order,origin){
 const ready=readiness(env);
 if(order.payment_id&&!order.job_id){
  const session=await stripe(env,`/checkout/sessions/${encodeURIComponent(order.payment_id)}`);
  if(!matchingPayment(order,session,ready.sandbox))return order;
  await run(env.DB,"UPDATE orders SET state='paid',updated=? WHERE id=? AND attempted=0",Date.now(),order.id);
  if(!ready.checkoutReady)return {...order,state:'paid'};
  // The conditional durable transition is the lock. Never repeat an uncertain POST.
  const claim=await run(env.DB,"UPDATE orders SET attempted=1,state='submitting',updated=? WHERE id=? AND attempted=0 AND job_id IS NULL",Date.now(),order.id);
  if(!claim.meta.changes)return await owned(env.DB,'orders',order.id,order.owner);
  const edition=await owned(env.DB,'editions',order.edition_id,order.owner);
  const manifest=JSON.parse(edition.manifest),payload=JSON.parse(order.payload);
  try{
   assert(edition.status==='approved',409,'Approved preflight required');
   const interior=await signedFile(env,origin,order.owner,manifest.interiorHash);
   const cover=await signedFile(env,origin,order.owner,manifest.coverHash);
   const job=await provider(env).request('/print-jobs/',{
    external_id:order.id,contact_email:env.PRINT_CONTACT_EMAIL,shipping_level:payload.shippingLevel,shipping_address:payload.address,
    line_items:[{external_id:edition.id,title:manifest.title,quantity:payload.quantity,printable_normalization:{pod_package_id:manifest.profile.podPackageId,interior:{source_url:interior},cover:{source_url:cover}}}]
   });
   assert(job.id,502,'Printer did not return an order ID');
   await run(env.DB,"UPDATE orders SET job_id=?,state='submitted',updated=? WHERE id=?",String(job.id),Date.now(),order.id);
   await event(env,order.id,'submitted','Payment verified; submitted to Lulu.');
  }catch(e){
   await run(env.DB,"UPDATE orders SET state='needs_attention',updated=? WHERE id=?",Date.now(),order.id);
   await event(env,order.id,'needs_attention','Printer submission needs manual reconciliation. Do not submit a second order. Approved files are preserved.');
   console.error('fulfillment_needs_attention',order.id,e.status||'provider_error');
  }
 }
 if(order.job_id){
  const job=await provider(env).status(order.job_id);
  const state=String(job.status?.name||'submitted').toLowerCase();
  const payload=JSON.parse(order.payload);
  payload.tracking=trackingUrls(job);
  if(state!==order.state)await event(env,order.id,state,`Lulu status: ${state.replaceAll('_',' ')}.`);
  await run(env.DB,'UPDATE orders SET state=?,payload=?,updated=? WHERE id=?',state,JSON.stringify(payload),Date.now(),order.id);
 }
 return owned(env.DB,'orders',order.id,order.owner);
}
export async function handleApi(request,env){
 const url=new URL(request.url),path=url.pathname.replace(/^\/api\/?/,'').split('/'),method=request.method;
 try{
  assert(env.DB&&env.BUCKET,503,'Account storage is being connected. Your local draft is safe.');
  // These two endpoints additionally require an external route past private-site sign-in.
  if(path[0]==='print-file'&&method==='GET'){
   const owner=url.searchParams.get('owner'),hash=url.searchParams.get('hash'),expires=url.searchParams.get('expires'),sig=url.searchParams.get('sig');
   assert(env.FILE_SIGNING_SECRET&&owner&&validHash(hash)&&Number(expires)>Date.now()&&Number(expires)<=Date.now()+25*3600*1000,403,'Expired file link');
   assert(constantEqual(sig,await hmac(env.FILE_SIGNING_SECRET,`${owner}:${hash}:${expires}`)),403,'Invalid file link');
   const file=await env.BUCKET.get(fileKey(owner,hash));assert(file,404,'File not found');
   return new Response(file.body,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(path[0]==='stripe-webhook'&&method==='POST'){
   const raw=new TextDecoder().decode(await limitedBody(request,1024*1024));
   await verifyStripeSignature(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET);
   const e=JSON.parse(raw);
   if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(e.type)){
    const order=await one(env.DB,'SELECT * FROM orders WHERE payment_id=?',e.data.object.id);
    if(order)await reconcile(env,order,url.origin);
   }return json({received:true});
  }
  const identity=request.headers.get('oai-authenticated-user-id');
  assert(identity,401,'Sign in with ChatGPT to save to your account');
  const owner=await digest(new TextEncoder().encode(identity));
  if(!['GET','HEAD'].includes(method))sameOrigin(request);
  if(path[0]==='status'&&method==='GET')return json({...readiness(env),account:owner});
  if(path[0]==='files'){
   const hash=path[1];assert(validHash(hash),400,'Invalid file ID');
   if(method==='PUT'){
    const existing=await one(env.DB,'SELECT hash FROM files WHERE owner=? AND hash=?',owner,hash);
    if(existing)return json({hash});
    const bytes=await limitedBody(request,32*1024*1024);
    assert(bytes.length&&await digest(bytes)===hash,400,'File checksum mismatch');
    const usage=await one(env.DB,'SELECT COALESCE(SUM(size),0) AS total FROM files WHERE owner=?',owner);
    assert(usage.total+bytes.length<=512*1024*1024,413,'Account file limit reached (512 MB). Export and delete unused projects.');
    await env.BUCKET.put(fileKey(owner,hash),bytes);
    await run(env.DB,'INSERT OR IGNORE INTO files (owner,hash,size,created) VALUES (?,?,?,?)',owner,hash,bytes.length,Date.now());
    return json({hash},201);
   }
   assert(method==='GET',405,'Method not supported');const file=await env.BUCKET.get(fileKey(owner,hash));assert(file,404,'File not found');
   return new Response(file.body,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(path[0]==='projects'){
   if(!path[1]&&method==='GET'){
    const rows=await all(env.DB,'SELECT id,title,version,updated FROM projects WHERE owner=? AND deleted=0 ORDER BY updated DESC',owner);
    return json(rows);
   }
   const id=path[1];assert(validId(id),400,'Invalid project ID');
   const current=await one(env.DB,'SELECT * FROM projects WHERE owner=? AND id=?',owner,id);
   if(method==='GET'){
    assert(current&&!current.deleted,404,'Project not found');const object=await env.BUCKET.get(current.object_key);assert(object,503,'Project temporarily unavailable');
    return json({project:await object.json(),version:current.version});
   }
   if(method==='PUT'){
    const body=await jsonBody(request,8*1024*1024),p=body.project;
    assert(p?.id===id&&typeof p.title==='string'&&p.title.length<=200&&Number.isInteger(p.revision)&&p.revision>0,400,'Invalid project');
    assert(!current?.deleted,409,'This project was deleted. Export the local draft before creating another project.');
    assert((current?.version||0)===body.version,409,'This book changed on another device. Export this draft, then reopen the saved book.');
    await verifyRefs(env,owner,p);
    const version=(current?.version||0)+1,key=`users/${owner}/projects/${id}/${crypto.randomUUID()}.json`;
    await env.BUCKET.put(key,JSON.stringify(p),{httpMetadata:{contentType:'application/json'}});
    const result=current
     ?await run(env.DB,'UPDATE projects SET title=?,object_key=?,version=?,updated=? WHERE owner=? AND id=? AND version=? AND deleted=0',p.title,key,version,Date.now(),owner,id,current.version)
     :await run(env.DB,'INSERT OR IGNORE INTO projects (owner,id,title,object_key,version,updated,deleted) VALUES (?,?,?,?,?,?,0)',owner,id,p.title,key,version,Date.now());
    if(!result.meta.changes){await env.BUCKET.delete(key);throw new HttpError(409,'Another device saved first. Reopen the saved book before editing.');}
    if(current)await env.BUCKET.delete(current.object_key);
    return json({version});
   }
   if(method==='DELETE'){
    assert(current,404,'Project not found');
    const active=await one(env.DB,"SELECT id FROM orders WHERE owner=? AND edition_id IN (SELECT id FROM editions WHERE owner=? AND project_id=?) AND state NOT IN ('canceled','rejected','shipped')",owner,owner,id);
    assert(!active,409,'This book has an active order. Resolve the order before deleting its files.');
    await run(env.DB,'UPDATE projects SET deleted=1,updated=? WHERE owner=? AND id=?',Date.now(),owner,id);
    await env.BUCKET.delete(current.object_key);
    // Content-addressed files may be referenced by another draft being saved concurrently.
    // Purge through a separately coordinated retention job, never an in-request sweep.
    return json({deleted:true});
   }
  }
  if(path[0]==='dimensions'&&method==='POST'){
   const body=await jsonBody(request),p=profiles(env).find(p=>p.id===body.profileId);
   assert(p&&Number.isInteger(body.count)&&body.count>=p.minPages&&body.count<=p.maxPages,400,'Choose an available format for this page count');
   return json(await provider(env).coverDimensions({pod_package_id:p.podPackageId,interior_page_count:body.count,unit:'pt'}));
  }
  if(path[0]==='editions'){
   if(method==='GET'&&!path[1])return json(await all(env.DB,'SELECT id,project_id,revision,created,status,manifest FROM editions WHERE owner=? ORDER BY created DESC',owner));
   if(method==='POST'&&!path[1]){
    const b=await jsonBody(request),profile=profiles(env).find(p=>p.id===b.profileId);
    assert(b.rights===true&&b.reviewed===true,400,'Confirm rights and review both production files');
    assert(profile&&validId(b.projectId)&&Number.isInteger(b.revision)&&b.revision>0,400,'Invalid edition or unverified print format');
    assert(await one(env.DB,'SELECT id FROM projects WHERE owner=? AND id=? AND deleted=0',owner,b.projectId),404,'Save the project first');
    const interior=await readPdf(env,owner,b.interiorHash),cover=await readPdf(env,owner,b.coverHash);
    const count=interior.getPageCount();
    assert(count>=profile.minPages&&count<=profile.maxPages&&count%2===0,400,'Page count must be even and within the selected format limits');
    assert(interior.getPages().every(p=>Math.abs(p.getWidth()-profile.width)<.5&&Math.abs(p.getHeight()-profile.height)<.5),400,'Interior pages must match the selected trim size');
    const dims=await provider(env).coverDimensions({pod_package_id:profile.podPackageId,interior_page_count:count,unit:'pt'});
    assert(cover.getPageCount()===1&&Math.abs(cover.getPage(0).getWidth()-Number(dims.width))<.5&&Math.abs(cover.getPage(0).getHeight()-Number(dims.height))<.5,400,'Full cover does not match the printer dimensions');
    const id=crypto.randomUUID(),manifest={title:String(b.title||'Untitled book').slice(0,200),interiorHash:b.interiorHash,coverHash:b.coverHash,count,profile,dimensions:dims,rightsAt:Date.now(),reviewedAt:Date.now()};
    await run(env.DB,'INSERT INTO editions (id,owner,project_id,revision,manifest,created,status) VALUES (?,?,?,?,?,?,?)',id,owner,b.projectId,b.revision,JSON.stringify(manifest),Date.now(),'prepared');
    return json({id,manifest,status:'prepared'},201);
   }
   const ed=await owned(env.DB,'editions',path[1],owner),m=JSON.parse(ed.manifest);
   if(method==='POST'&&path[2]==='validate'){
    assert(ed.status!=='approved',409,'Approved editions are immutable; prepare a new edition to validate again');
    const urls=await Promise.all([signedFile(env,url.origin,owner,m.interiorHash),signedFile(env,url.origin,owner,m.coverHash)]);
    const p=provider(env);
    const interior=await p.validateInterior({source_url:urls[0],pod_package_id:m.profile.podPackageId});
    const cover=await p.validateCover({source_url:urls[1],pod_package_id:m.profile.podPackageId,interior_page_count:m.count});
    const validation={interior,cover,interiorHash:m.interiorHash,coverHash:m.coverHash};
    await run(env.DB,"UPDATE editions SET status='validating',validation=? WHERE id=?",JSON.stringify(validation),ed.id);
    return json({status:'validating'});
   }
   if(method==='POST'&&path[2]==='refresh'){
    if(ed.status==='approved')return json({status:'approved'});
    assert(ed.validation,409,'Start printer validation first');const v=JSON.parse(ed.validation),p=provider(env);
    v.interior=await p.validation('interior',v.interior.id);v.cover=await p.validation('cover',v.cover.id);
    const states=[v.interior.status,v.cover.status];
    const status=states.every(s=>['VALIDATED','NORMALIZED'].includes(s))?'validated':states.includes('ERROR')?'failed':'validating';
    await run(env.DB,'UPDATE editions SET status=?,validation=? WHERE id=?',status,JSON.stringify(v),ed.id);
    return json({status,validation:v});
   }
   if(method==='POST'&&path[2]==='approve'){
    assert(ed.status==='validated',409,'Printer validation must pass before approval');
    const b=await jsonBody(request);assert(b.interiorHash===m.interiorHash&&b.coverHash===m.coverHash&&b.reviewed===true,409,'Approval must match both reviewed files');
    await run(env.DB,"UPDATE editions SET status='approved' WHERE id=? AND status='validated'",ed.id);return json({status:'approved'});
   }
  }
  if(path[0]==='orders'){
   if(method==='GET'&&!path[1]){
    const rows=await all(env.DB,'SELECT * FROM orders WHERE owner=? ORDER BY created DESC',owner);
    return json(await Promise.all(rows.map(async r=>({...r,payload:JSON.parse(r.payload),events:await all(env.DB,'SELECT kind,message,created FROM events WHERE order_id=? ORDER BY created',r.id)}))));
   }
   if(method==='POST'&&!path[1]){
    assert(readiness(env).checkoutReady,503,'Printing setup and verification are not complete');
    const b=await jsonBody(request),ed=await owned(env.DB,'editions',b.editionId,owner),m=JSON.parse(ed.manifest);
    assert(ed.status==='approved',409,'Approve printer-validated files first');
    assert(Number.isInteger(b.quantity)&&b.quantity>=1&&b.quantity<=999,400,'Choose 1–999 copies');
    const a=b.address;assert(a&&['name','street1','city','country_code','postcode','phone_number'].every(k=>typeof a[k]==='string'&&a[k].trim().length&&a[k].length<=200)&&/^[A-Z]{2}$/.test(a.country_code),400,'Complete the delivery address, phone, and two-letter country code');
    assert(['MAIL','PRIORITY_MAIL','GROUND','EXPEDITED','EXPRESS'].includes(b.shippingLevel),400,'Select a shipping service');
    const quote=await provider(env).quote({line_items:[{page_count:m.count,pod_package_id:m.profile.podPackageId,quantity:b.quantity}],shipping_address:a,shipping_option:b.shippingLevel});
    assert(['USD','EUR','GBP','CAD','AUD'].includes(quote.currency),502,'This currency is not enabled');
    const id=crypto.randomUUID(),total=moneyMinor(quote.total_cost_incl_tax),now=Date.now();
    const payload={address:a,quantity:b.quantity,shippingLevel:b.shippingLevel,quote,title:m.title,tracking:[]};
    await run(env.DB,'INSERT INTO orders (id,owner,edition_id,payload,state,total,currency,expires,updated,created,attempted) VALUES (?,?,?,?,?,?,?,?,?,?,0)',id,owner,ed.id,JSON.stringify(payload),'quoted',total,quote.currency.toLowerCase(),now+30*60000,now,now);
    await event(env,id,'quoted','Live printer estimate saved for 30 minutes.');
    return json({id,total,currency:quote.currency,quote});
   }
   const order=await owned(env.DB,'orders',path[1],owner);
   if(method==='POST'&&path[2]==='checkout'){
    const ready=readiness(env);assert(ready.checkoutReady,503,'Checkout is not enabled');
    assert(order.state==='quoted'&&order.expires>Date.now(),409,'Get a new estimate before paying');
    if(order.payment_id){const s=await stripe(env,`/checkout/sessions/${encodeURIComponent(order.payment_id)}`);assert(s.status==='open',409,'Payment is already processing');return json({url:s.url});}
    const session=await stripe(env,'/checkout/sessions',{
     mode:'payment',client_reference_id:order.id,'metadata[orderId]':order.id,
     'line_items[0][quantity]':'1','line_items[0][price_data][currency]':order.currency,'line_items[0][price_data][unit_amount]':String(order.total),
     'line_items[0][price_data][product_data][name]':`Folio · ${JSON.parse(order.payload).title}`,
     success_url:`${url.origin}/?order=${order.id}`,cancel_url:`${url.origin}/?order=${order.id}`,
     expires_at:String(Math.floor(Date.now()/1000)+1800)
    },`folio-${order.id}`);
    assert(session.livemode===!ready.sandbox,503,'Stripe and Lulu environments must match');
    await run(env.DB,'UPDATE orders SET payment_id=?,updated=? WHERE id=?',session.id,Date.now(),order.id);return json({url:session.url});
   }
   if(method==='POST'&&path[2]==='refresh')return json(await reconcile(env,order,url.origin));
   if(method==='POST'&&path[2]==='cancel'){
    assert(!order.attempted&&!order.job_id,409,'Contact support to cancel an order already sent to the printer');
    if(order.payment_id){const s=await stripe(env,`/checkout/sessions/${encodeURIComponent(order.payment_id)}`);assert(s.payment_status!=='paid',409,'Payment has completed; contact support');if(s.status==='open')await stripe(env,`/checkout/sessions/${encodeURIComponent(order.payment_id)}/expire`,{},`expire-${order.id}`);}
    await run(env.DB,"UPDATE orders SET state='canceled',updated=? WHERE id=? AND attempted=0",Date.now(),order.id);return json({state:'canceled'});
   }
  }
  throw new HttpError(404,'Endpoint not found');
 }catch(e){
  const status=e.status||500;if(status>=500)console.error('folio_api_error',path[0],status);
  return json({error:status===500?'The request could not be completed. Your saved files are preserved.':e.message},status);
 }
}
