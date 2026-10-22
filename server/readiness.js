export function profiles(env){
 try{return JSON.parse(env.LULU_PROFILES_JSON||'[]').filter(p=>p.provider==='lulu'&&p.verifiedAt&&p.id&&p.podPackageId&&p.binding==='paperback'&&p.width>0&&p.height>0&&p.bleed>=0&&p.minPages>0&&p.maxPages>=p.minPages);}catch{return [];}
}
export function readiness(env){
 const sandbox=env.LULU_ENVIRONMENT!=='production';
 const checks=[
 {key:'storage',label:'Private account storage',ready:!!(env.DB&&env.BUCKET)},
 {key:'printer',label:'Lulu credentials',ready:!!(env.LULU_CLIENT_KEY&&env.LULU_CLIENT_SECRET)},
 {key:'products',label:'Verified paperback specifications',ready:profiles(env).length>0},
 {key:'delivery',label:'Printer file access and payment callbacks tested',ready:env.EXTERNAL_DELIVERY_VERIFIED==='true'&&!!env.FILE_SIGNING_SECRET},
 {key:'payments',label:sandbox?'Stripe test account':'Stripe live account',ready:!!(env.STRIPE_SECRET_KEY?.startsWith(sandbox?'sk_test_':'sk_live_')&&env.STRIPE_WEBHOOK_SECRET)},
 {key:'contact',label:'Print order contact',ready:!!env.PRINT_CONTACT_EMAIL},
 {key:'sandbox',label:'End-to-end sandbox order verified',ready:env.SANDBOX_ORDER_VERIFIED==='true'},
 {key:'physical',label:'Physical proof inspected',ready:env.PHYSICAL_PROOF_VERIFIED==='true'},
 {key:'operations',label:'Support, tax, retention and recovery configured',ready:env.OPERATIONS_VERIFIED==='true'&&!!env.PRINT_CONTACT_EMAIL},
 ];
 // Sandbox orders do not print or charge real money. Live launch requirements
 // remain visible and mandatory for production, without falsely marking them done.
 const required=checks.filter(c=>sandbox?!['physical','sandbox','operations'].includes(c.key):true);
 return {checks,sandbox,checkoutReady:required.every(c=>c.ready)&&env.CHECKOUT_ENABLED==='true',formats:profiles(env)};
}
