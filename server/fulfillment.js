// A fail-closed orchestration seam. All dependencies below are trusted server adapters.
// This source is intentionally not mounted as an API in the preview deployment.
export async function fulfillApprovedOrder(orderId,{orders,payments,files,printer}) {
 return orders.withExclusiveLock(orderId,async()=>{
  const order=await orders.get(orderId);
  if(!order)throw Error('Order not found');
  if(order.providerJobId)return order;
  if(!order.approvedVersion?.interiorHash||!order.approvedVersion?.coverHash)throw Error('An approved immutable interior and full-cover version is required');
  const paid=await payments.verifyCapturedPayment(order.paymentId);
  if(!paid||paid.status!=='succeeded'||paid.orderId!==order.id||paid.amount!==order.totalMinor||paid.currency!==order.currency)throw Error('Verified matching payment is required before fulfillment');
  if(order.preflight?.status!=='passed'||order.preflight.interiorHash!==order.approvedVersion.interiorHash||order.preflight.coverHash!==order.approvedVersion.coverHash)throw Error('Printer preflight must match approved files');
  // Durable intent is written before the outbound request. An uncertain response must
  // be reconciled by external_id, never blindly retried (duplicate books cost money).
  if(order.submissionAttempted)throw Error('Reconcile the previous submission with the printer before retrying');
  const urls=await files.signImmutableVersion(order.approvedVersion,{expiresInSeconds:3600});
  if(!urls.interior.startsWith('https://')||!urls.cover.startsWith('https://'))throw Error('Private HTTPS signed URLs are required');
  await orders.markSubmissionAttempted(order.id);
  try {const job=await printer.submit({...order.providerPayload,external_id:order.id,approvedFiles:urls});if(!job.id)throw Error('Provider did not return a job ID');return orders.recordProviderJob(order.id,job);}
  catch(error){await orders.markNeedsAttention(order.id,'Provider submission needs review. Your approved files are preserved.');throw error;}
 });
}
