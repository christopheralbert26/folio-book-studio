import React,{useEffect,useState} from 'react';
import {api} from './api';
export function SupportThread({orderId,admin=false,onChange}){
 const [ticket,setTicket]=useState(null),[message,setMessage]=useState(''),[category,setCategory]=useState('order'),[status,setStatus]=useState('reviewing'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const path=admin?`admin/orders/${orderId}`:`support/${orderId}`;
 async function load(){try{const r=await api(path);setTicket(r.ticket);setLoaded(true);setError('');}catch(e){setError(e.message);}}
 useEffect(()=>{load();},[path]);
 async function send(e){e.preventDefault();setBusy(true);setError('');try{
  const r=await api(path,{message,category,status,version:ticket?.version||0,messageId:crypto.randomUUID()});setTicket(r.ticket);setMessage('');onChange?.();
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="support-thread"><h4>{admin?'Customer conversation':'Order support'}</h4>
 {error&&<p role="alert" className="error">{error}</p>}
 <button className="text-button" onClick={load} disabled={busy}>Reload conversation</button>
 {ticket&&<><p>Request: {ticket.category} · <strong>{ticket.status}</strong></p><ol className="support-messages">{ticket.messages.map(m=><li key={m.id}><strong>{m.actor==='support'?'Shop support':'Customer'}</strong> <small>{new Date(m.created).toLocaleString()}{m.status?` · ${m.status}`:''}</small><p>{m.text}</p></li>)}</ol></>}
 {loaded&&(!admin||ticket)?<form onSubmit={send}>
 {!ticket&&<label className="field"><span>What do you need help with?</span><select value={category} onChange={e=>setCategory(e.target.value)}>{['order','printing','shipping','cancellation','refund'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>}
 <label className="field"><span>{admin?'Reply visible to customer':'Message to shop support'}</span><textarea required minLength={3} maxLength={3000} rows={4} value={message} onChange={e=>setMessage(e.target.value)}/></label>
 {admin&&<label className="field"><span>Request status after reply</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="reviewing">Under review</option><option value="open">Open</option><option value="resolved">Resolved</option></select></label>}
 <p><small>{admin?'Resolving a request does not refund a payment or cancel printing.':'Replies appear here in your account. Do not include card details or passwords. A request does not automatically cancel or refund an order.'}</small></p>
 <button className="btn secondary" disabled={busy||message.trim().length<3}>{busy?'Saving…':admin?'Send reply':ticket?'Send follow-up':'Open support request'}</button>
 </form>:loaded&&<p>No support request for this order.</p>}
 </section>;
}
export function OwnerDesk(){
 const [allowed,setAllowed]=useState(false),[open,setOpen]=useState(false),[data,setData]=useState(null),[page,setPage]=useState(0),[error,setError]=useState(''),[filter,setFilter]=useState('all');
 useEffect(()=>{api('status').then(s=>setAllowed(s.operator)).catch(()=>{});},[]);
 const load=()=>api(`admin/orders?page=${page}`).then(d=>{setData(d);setError('');}).catch(e=>setError(e.message));
 useEffect(()=>{if(open&&allowed)load();},[open,allowed,page]);
 if(!allowed)return null;
 const rows=data?.orders.filter(o=>filter==='all'||o.support_status==='open'||o.support_status==='reviewing'||['needs_attention','error','rejected','unpaid'].includes(o.state)||o.syncError)||[];
 return <section className="owner-desk"><h2>Owner order desk</h2><p>Private management for the shop owner.</p><button className="btn secondary" onClick={()=>setOpen(!open)}>{open?'Close order desk':'Manage orders and support'}</button>
 {open&&<><p>Review printer status before promising cancellation. Confirm refunds in Stripe and printing changes in Lulu, then record the outcome in your reply.</p><div className="inline-buttons"><a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer">Open Stripe ↗</a><a href="https://developers.sandbox.lulu.com/print-jobs" target="_blank" rel="noreferrer">Lulu sandbox ↗</a><a href="https://developers.lulu.com/print-jobs" target="_blank" rel="noreferrer">Lulu production ↗</a><button onClick={load}>Refresh desk</button></div>
 <label className="field"><span>Show on this page</span><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All orders</option><option value="attention">Requests and problems</option></select></label>
 {error&&<p role="alert">{error}</p>}{data&&!rows.length&&<p>No matching orders on this page.</p>}
 {rows.map(o=><details className="order-card" key={o.id}><summary>{o.title} · {o.state.replaceAll('_',' ')} · {o.support_status||'No request'} · {o.environment}</summary><p>Order {o.id}</p><p>{o.quantity} copies · {(o.total/100).toFixed(2)} {o.currency.toUpperCase()}</p><p>Lulu job: {o.job_id||'Not submitted'}</p><p className="break-id">Stripe checkout: {o.payment_id||'Not started'}</p>{o.syncError&&<p role="alert">{o.syncError}</p>}<SupportThread orderId={o.id} admin onChange={load}/></details>)}
 <div className="inline-buttons"><button disabled={page===0} onClick={()=>setPage(page-1)}>Previous page</button><span>Page {page+1}</span><button disabled={!data?.hasMore} onClick={()=>setPage(page+1)}>Next page</button></div></>}
 </section>;
}
