import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hmac,verifyStripeSignature,moneyMinor,sameOrigin,limitedBody} from '../server/security.js';
import {readiness} from '../server/readiness.js';
import {matchingPayment,handleApi} from '../server/api.js';
test('checkout stays closed without accounts, external delivery and verification',()=>{
 const state=readiness({DB:{},BUCKET:{}});
 assert.equal(state.checkoutReady,false);
 assert.equal(state.checks.find(c=>c.key==='storage').ready,true);
 assert.equal(readiness({CHECKOUT_ENABLED:'true'}).checkoutReady,false);
});
test('sandbox checkout requires test credentials and contact; live launch still requires all checks',()=>{
 const env={DB:{},BUCKET:{},LULU_CLIENT_KEY:'test',LULU_CLIENT_SECRET:'test',LULU_ENVIRONMENT:'sandbox',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'fixture',PRINT_CONTACT_EMAIL:'test@example.com',FILE_SIGNING_SECRET:'fixture',EXTERNAL_DELIVERY_VERIFIED:'true',CHECKOUT_ENABLED:'true',LULU_PROFILES_JSON:JSON.stringify([{id:'test',provider:'lulu',verifiedAt:'2026-10-22',podPackageId:'test',binding:'paperback',width:432,height:648,bleed:9,minPages:32,maxPages:800}])};
 assert.equal(readiness(env).checkoutReady,true);
 assert.equal(readiness(env).checks.find(c=>c.key==='operations').ready,false);
 for(const delta of [{STRIPE_SECRET_KEY:'sk_live_fixture'},{PRINT_CONTACT_EMAIL:''},{EXTERNAL_DELIVERY_VERIFIED:'false'},{CHECKOUT_ENABLED:'false'}])assert.equal(readiness({...env,...delta}).checkoutReady,false);
 const live={...env,LULU_ENVIRONMENT:'production',STRIPE_SECRET_KEY:'sk_live_fixture'};
 assert.equal(readiness(live).checkoutReady,false);
 assert.equal(readiness({...live,SANDBOX_ORDER_VERIFIED:'true',PHYSICAL_PROOF_VERIFIED:'true',OPERATIONS_VERIFIED:'true'}).checkoutReady,true);
});
test('webhook rejects tampering and replayed signatures',async()=>{
 const now=Date.now(),t=Math.floor(now/1000),raw='{"id":"event"}',secret='test-secret';
 const signature=await hmac(secret,`${t}.${raw}`);
 await verifyStripeSignature(raw,`t=${t},v1=${signature}`,secret,now);
 await assert.rejects(verifyStripeSignature(raw+'x',`t=${t},v1=${signature}`,secret,now),/Invalid/);
 await assert.rejects(verifyStripeSignature(raw,`t=${t},v1=${signature}`,secret,now+301000),/Expired/);
});
test('payment must match immutable quote and environment',()=>{
 const order={id:'order',total:1501,currency:'usd'};
 const session={payment_status:'paid',client_reference_id:'order',amount_total:1501,currency:'usd',livemode:false};
 assert.equal(matchingPayment(order,session,true),true);
 for(const delta of [{amount_total:1500},{currency:'eur'},{client_reference_id:'another'},{payment_status:'unpaid'},{livemode:true}]){
  assert.equal(matchingPayment(order,{...session,...delta},true),false);
 }
});
test('money conversion uses cents and rejects ambiguous precision',()=>{
 assert.equal(moneyMinor('14.84'),1484);
 assert.throws(()=>moneyMinor('14.845'));assert.throws(()=>moneyMinor('-1.00'));
});
test('cross-origin writes and oversized uploads are rejected',async()=>{
 assert.throws(()=>sameOrigin(new Request('https://folio.test/api/projects',{headers:{Origin:'https://evil.test'}})));
 await assert.rejects(limitedBody(new Request('https://folio.test',{method:'POST',body:'123456'}),5),/too large/);
});
test('API refuses unauthenticated access before reading account data',async()=>{
 const env={DB:{prepare(){throw Error('must not query');}},BUCKET:{}};
 const r=await handleApi(new Request('https://folio.test/api/projects'),env);
 assert.equal(r.status,401);
});
test('file reads derive the namespace from authenticated identity',async()=>{
 const keys=[],env={DB:{},BUCKET:{async get(key){keys.push(key);return null;}}},hash='a'.repeat(64);
 for(const id of ['alice','bob'])await handleApi(new Request(`https://folio.test/api/files/${hash}`,{headers:{'oai-authenticated-user-id':id}}),env);
 assert.equal(keys.length,2);assert.notEqual(keys[0],keys[1]);assert(keys.every(k=>k.endsWith(hash)));
});


test('Lulu tracking accepts supported response shapes and rejects unsafe links',async()=>{
 const {trackingUrls}=await import('../server/lulu.js');
 assert.deepEqual(trackingUrls({line_items:[{tracking_urls:['https://carrier.test/one','javascript:alert(1)']},{status:{messages:{tracking_urls:'https://carrier.test/two'}}}],status:{line_item_statuses:[{messages:{tracking_urls:['https://carrier.test/one','https://user:password@carrier.test/private','invalid']}}]}}),['https://carrier.test/one','https://carrier.test/two']);
 assert.deepEqual(trackingUrls({}),[]);
});


test('Lulu signatures cover the raw payload in hex or base64',async()=>{
 const {verifyLuluSignature}=await import('../server/security.js');
 const raw='{"topic":"PRINT_JOB_STATUS_CHANGED"}',hex=await hmac('test',raw);
 await verifyLuluSignature(raw,hex,'test');
 await verifyLuluSignature(raw,Buffer.from(hex,'hex').toString('base64'),'test');
 await assert.rejects(verifyLuluSignature(raw+' ',hex,'test'),/Invalid/);
 await assert.rejects(verifyLuluSignature(raw,null,'test'),/Missing/);
});
