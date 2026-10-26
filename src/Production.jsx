import {SupportThread,OwnerDesk} from './Support';
import React,{useEffect,useState} from 'react';
import {api,uploadBytes} from './api';
import {generateFullCover,download} from './generation';
import {saveProject} from './storage';
export function SetupStatus(){
 const [state,setState]=useState(null),[error,setError]=useState('');
 useEffect(()=>{api('status').then(setState).catch(e=>setError(e.message));},[]);
 return <section className="setup-status"><h3>Printing setup</h3>{error&&<p role="alert">{error}</p>}{state&&<><p>{state.checkoutReady?(state.sandbox?'Sandbox checkout is available. Test payments do not print or ship books.':'Checkout is available.'):'You can prepare and save your book. Printing is not available yet.'}</p><ul>{state.checks.map(c=><li key={c.key}><span>{c.ready?'✓':'○'}</span>{c.label}<small>{c.ready?'Ready':'Not connected / verified'}</small></li>)}</ul></>}</section>;
}
export function PrintFormat({project,proof,onChange}){
 const [formats,setFormats]=useState([]),[error,setError]=useState('');
 useEffect(()=>{api('status').then(s=>setFormats(s.formats)).catch(e=>setError(e.message));},[]);
 return <section className="production"><h3>Production format</h3>{error&&<p role="alert">{error}</p>}
 <label className="field"><span>Verified printer format</span><select value={project.printProfile?.id||''} onChange={e=>{
  const p=formats.find(p=>p.id===e.target.value);
  if(p&&project.source?.type==='pdf'&&(Math.abs(project.layout.width-p.width)>.5||Math.abs(project.layout.height-p.height)>.5)){setError('Your PDF must be exported at this format’s trim size.');return;}
  onChange({printProfile:p||null,...(p?{layout:{...project.layout,width:p.width,height:p.height}}:{})});
 }}><option value="">Digital proof only</option>{formats.map(p=><option key={p.id} value={p.id}>{p.name} · {p.width/72} × {p.height/72} in</option>)}</select></label>
 {!formats.length&&<p>No printer products are connected yet. Your custom digital layout is available below.</p>}
 {project.printProfile&&<p>{proof?.count||'—'} pages · {project.printProfile.minPages}–{project.printProfile.maxPages} supported. Production files use an even page count.</p>}</section>;
}
export function ProductionReview({project,proof,frontBytes}){
 const [cover,setCover]=useState(null),[edition,setEdition]=useState(null),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setCover(null);setEdition(null);setReviewed(false);setError('');},[project.id,project.revision,proof?.hash]);
 async function task(fn){setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
 if(!project.printProfile)return <SetupStatus/>;
 return <section className="production"><h3>Production files</h3><p>Review the complete back–spine–front PDF and interior before saving a print edition.</p>
 {error&&<p className="error" role="alert">{error}</p>}
 <button className="btn secondary" disabled={busy||!proof||!frontBytes} onClick={()=>task(async()=>{
  const dimensions=await api('dimensions',{profileId:project.printProfile.id,count:proof.count});
  setCover(await generateFullCover(project,dimensions,frontBytes));
 })}>{busy?'Working…':'Generate full cover from printer dimensions'}</button>
 {cover&&<><p>Spine: {(cover.spine/72).toFixed(3)} in. Full spread: {(cover.width/72).toFixed(3)} × {(cover.height/72).toFixed(3)} in.</p>
 <button className="btn secondary" onClick={()=>download(cover.bytes,`${project.title}-full-cover.pdf`)}>Download full cover for review</button>
 <label className="checkbox"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed both PDFs, including all pages, cover, spine and trim.</label>
 <button className="btn" disabled={busy||!reviewed||!project.rights||!!edition} onClick={()=>task(async()=>{
  await saveProject(project);
  const interiorHash=await uploadBytes(proof.bytes),coverHash=await uploadBytes(cover.bytes);
  setEdition(await api('editions',{projectId:project.id,revision:project.revision,title:project.title,profileId:project.printProfile.id,interiorHash,coverHash,rights:project.rights,reviewed}));
 })}>Save immutable print edition</button></>}
 {edition&&<><p role="status">Print edition: {edition.status}</p>
 <button className="btn secondary" disabled={busy} onClick={()=>task(async()=>{const result=await api(`editions/${edition.id}/${edition.status==='prepared'||edition.status==='failed'?'validate':'refresh'}`,{});setEdition({...edition,...result});})}>Check with Lulu</button>
 {edition.validation&&<pre className="validation-results">{JSON.stringify(edition.validation,null,2)}</pre>}
 {edition.status==='validated'&&<button className="btn" disabled={busy} onClick={()=>task(async()=>{await api(`editions/${edition.id}/approve`,{...edition.manifest,reviewed:true});setEdition({...edition,status:'approved'});})}>Approve validated print files</button>}
 {edition.status==='approved'&&<p>This exact edition can now be selected at checkout when printing is enabled.</p>}</>}
 </section>;
}
export function Checkout({project}){
 const [status,setStatus]=useState(null),[editions,setEditions]=useState([]),[selected,setSelected]=useState(''),[address,setAddress]=useState({country_code:'US',name:'',street1:'',street2:'',city:'',state_code:'',postcode:'',phone_number:''}),[quantity,setQuantity]=useState(1),[shipping,setShipping]=useState('GROUND'),[quote,setQuote]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{api('status').then(setStatus).catch(e=>setError(e.message));api('editions').then(rows=>setEditions(rows.filter(e=>e.project_id===project.id&&e.revision===project.revision&&e.status==='approved'))).catch(e=>setError(e.message));},[project.id,project.revision]);
 const reset=fn=>{setQuote(null);fn();};
 async function task(fn){setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="production"><h3>Print this edition</h3>{error&&<p role="alert" className="error">{error}</p>}
 {!status?.checkoutReady?<SetupStatus/>:<>
 {status.sandbox&&<p role="status">Sandbox test only: use test payment details. No books will be printed or shipped.</p>}
 <label className="field"><span>Approved production edition</span><select value={selected} onChange={e=>reset(()=>setSelected(e.target.value))}><option value="">Select an edition</option>{editions.map(e=><option key={e.id} value={e.id}>v{e.revision} · {new Date(e.created).toLocaleString()}</option>)}</select></label>
 {Object.keys(address).map(key=><label className="field" key={key}><span>{({name:'Recipient',street1:'Address',street2:'Address line 2',city:'City',state_code:'State / province',postcode:'Postal code',country_code:'Country code (US, GB, etc.)',phone_number:'Delivery phone'})[key]}</span><input maxLength={200} value={address[key]} onChange={e=>reset(()=>setAddress({...address,[key]:key==='country_code'?e.target.value.toUpperCase():e.target.value}))}/></label>)}
 <label className="field"><span>Copies (order one as a physical proof)</span><input type="number" min="1" max="999" value={quantity} onChange={e=>reset(()=>setQuantity(+e.target.value))}/></label>
 <label className="field"><span>Shipping service</span><select value={shipping} onChange={e=>reset(()=>setShipping(e.target.value))}>{['MAIL','PRIORITY_MAIL','GROUND','EXPEDITED','EXPRESS'].map(s=><option key={s}>{s}</option>)}</select></label>
 <button className="btn" disabled={busy||!selected} onClick={()=>task(async()=>setQuote(await api('orders',{editionId:selected,quantity,address,shippingLevel:shipping})))}>Get live estimate</button>
 {quote&&<><div className="cost-table">{[['Printing',quote.quote.line_item_costs?.reduce((n,l)=>n+Number(l.total_cost_excl_tax),0)],['Shipping',quote.quote.shipping_cost?.total_cost_excl_tax],['Fulfillment',quote.quote.fulfillment_cost?.total_cost_excl_tax],['Tax',quote.quote.total_tax],['Total',(quote.total/100).toFixed(2)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value===undefined?'Included':`${value} ${quote.currency}`}</strong></div>)}</div>
 <button className="btn" disabled={busy} onClick={()=>task(async()=>{const s=await api(`orders/${quote.id}/checkout`,{});if(!s.url?.startsWith('https://checkout.stripe.com/'))throw Error('Unexpected payment destination');window.location.assign(s.url);})}>{status.sandbox?'Pay in Stripe test mode':'Continue to secure payment'}</button></>}
 </>}</section>;
}
export function Orders(){
 const [orders,setOrders]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const load=()=>api('orders').then(rows=>{setOrders(rows);setError('');}).catch(e=>setError(e.message));
 useEffect(()=>{
  const id=new URLSearchParams(window.location.search).get('order');
  if(id&&/^[a-f0-9-]{36}$/i.test(id)){
   setBusy(id);
   api(`orders/${id}/refresh`,{}).catch(e=>setError(e.message)).finally(()=>{load();setBusy('');});
  }else load();
 },[]);
 useEffect(()=>{
  const id=new URLSearchParams(window.location.search).get('order');
  if(orders.some(o=>o.id===id))document.getElementById(`order-${id}`)?.scrollIntoView({block:'center'});
 },[orders.length]);
 useEffect(()=>{
  const timer=setInterval(()=>{if(document.visibilityState==='visible')load();},30000);
  const visible=()=>{if(document.visibilityState==='visible')load();};
  document.addEventListener('visibilitychange',visible);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[]);
 const alerts={needs_attention:'Your payment was received, but printer submission needs review. Do not place another order. Contact support with the order number below.',rejected:'The printer rejected this order. Contact support to resolve the files or arrange a refund.',error:'The printer reported a problem. Contact support with this order number.',unpaid:'Your payment is confirmed. Printer billing needs attention before production can begin.'};
 const labels={quoted:'Estimate saved — payment not confirmed',paid:'Payment confirmed — preparing submission',submitting:'Payment confirmed — sending to printer',submitted:'Payment confirmed — sent to printer',unpaid:'Payment confirmed — printer billing pending',production_delayed:'Payment confirmed — queued for production',production_ready:'Ready for production',in_production:'Printing in progress',shipped:'Shipped',rejected:'Printer rejected order — support required',needs_attention:'Order needs support review',canceled:'Canceled'};
 async function action(id,name){setBusy(id);setError('');try{await api(`orders/${id}/${name}`,{});await load();}catch(e){setError(e.message);}finally{setBusy('');}}
 return <section className="orders"><h2>My orders</h2><p>Printer notifications update your orders automatically. This page checks for saved updates every 30 seconds.</p>{error&&<p role="alert">{error}</p>}{!orders.length&&<p>No orders yet. Your library and approved proofs stay available while printing is being connected.</p>}
 {orders.map(o=><article className="order-card" id={`order-${o.id}`} key={o.id}><h3>{o.payload.title}</h3><p>{labels[o.state]||o.state.replaceAll('_',' ')} · {o.payload.quantity} copies · {(o.total/100).toFixed(2)} {o.currency.toUpperCase()}</p><small>Order {o.id}</small>{(alerts[o.state]||o.payload.syncError)&&<p className="error" role="alert">{alerts[o.state]||o.payload.syncError}</p>}{o.payload.lastChecked&&<p><small>Printer status checked {new Date(o.payload.lastChecked).toLocaleString()}</small></p>}<ol>{o.events.map((e,i)=><li key={i}>{e.message} <small>{new Date(e.created).toLocaleString()}</small></li>)}</ol>{o.payload.tracking?.map(u=><a key={u} href={u} target="_blank" rel="noreferrer">Track shipment ↗</a>)}<div className="inline-buttons"><button disabled={busy===o.id} onClick={()=>action(o.id,'refresh')}>Refresh order</button>{o.state==='quoted'&&<button disabled={busy===o.id} onClick={()=>action(o.id,'cancel')}>Cancel estimate</button>}</div><details className="order-support"><summary>Get help with this order</summary><SupportThread orderId={o.id}/></details></article>)}<OwnerDesk/></section>;
}
