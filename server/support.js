import {assert,jsonBody,validId} from './security.js';
export const isOperator=(env,owner)=>!!env.SUPPORT_OWNER_HASH&&env.SUPPORT_OWNER_HASH===owner;
const one=async(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=async(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const decode=row=>row?{...row,messages:JSON.parse(row.messages)}:null;
export async function supportApi(request,env,owner,path){
 const admin=path[0]==='admin',method=request.method,url=new URL(request.url);
 if(admin)assert(isOperator(env,owner),403,'Owner access required');
 const orderId=admin?path[2]:path[1];
 if(admin&&method==='GET'&&!orderId){
  const page=Number(url.searchParams.get('page')||0);assert(Number.isInteger(page)&&page>=0&&page<=10000,400,'Invalid page');
  const rows=await all(env.DB,`SELECT o.id,o.state,o.total,o.currency,o.payment_id,o.job_id,o.payload,o.created,s.status AS support_status FROM orders o LEFT JOIN support s ON s.order_id=o.id ORDER BY o.created DESC LIMIT 51 OFFSET ?`,page*50);
  return {orders:rows.slice(0,50).map(r=>{const p=JSON.parse(r.payload);return {...r,payload:undefined,title:p.title,quantity:p.quantity,environment:p.environment||'sandbox',syncError:p.syncError};}),hasMore:rows.length>50};
 }
 assert(validId(orderId),400,'Invalid order');
 const order=await one(env.DB,admin?'SELECT * FROM orders WHERE id=?':'SELECT * FROM orders WHERE id=? AND owner=?',...[orderId,...(admin?[]:[owner])]);
 assert(order,404,'Order not found');
 const row=await one(env.DB,'SELECT * FROM support WHERE order_id=?',orderId);
 if(method==='GET')return {ticket:decode(row)};
 assert(method==='POST',405,'Method not allowed');
 const b=await jsonBody(request,8192);
 assert(typeof b.message==='string'&&b.message.trim().length>=3&&b.message.length<=3000,400,'Write a message of 3–3000 characters');
 assert(validId(b.messageId),400,'Missing message identifier');
 const messages=row?JSON.parse(row.messages):[];
 if(messages.some(m=>m.id===b.messageId&&m.actor===(admin?'support':'customer')))return {ticket:decode(row)};
 assert(messages.length<200,409,'This conversation is full. Please contact the shop owner.');
 assert(b.version===(row?.version||0),409,'This conversation changed. Reload it before replying.');
 const category=row?.category||b.category;
 assert(['order','printing','shipping','cancellation','refund'].includes(category),400,'Choose a request type');
 const status=admin?b.status:'open';assert(['open','reviewing','resolved'].includes(status),400,'Invalid request status');
 assert(!admin||row,409,'The customer must open a request first');
 const now=Date.now();messages.push({id:b.messageId,actor:admin?'support':'customer',text:b.message.trim(),created:now,...(admin?{status}:{})});
 if(row){
  const result=await run(env.DB,'UPDATE support SET messages=?,status=?,version=version+1,updated=? WHERE order_id=? AND version=?',JSON.stringify(messages),status,now,orderId,row.version);
  assert(result.meta.changes,409,'This conversation changed. Reload it before replying.');
 }else{
  const result=await run(env.DB,'INSERT OR IGNORE INTO support (order_id,owner,category,status,messages,version,created,updated) VALUES (?,?,?,?,?,1,?,?)',orderId,owner,category,status,JSON.stringify(messages),now,now);
  assert(result.meta.changes,409,'A request was just opened. Reload the conversation.');
 }
 return {ticket:decode(await one(env.DB,'SELECT * FROM support WHERE order_id=?',orderId))};
}
