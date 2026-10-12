import {isTable,changeParkingStock,issueParking} from './table-stock';
import {randomBytes,randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {requireAdmin} from './admin';
import {AppError} from './errors';
import type {Identity} from './session';
import {concertSlug} from './ticketing';
import {refundGateway,type RefundGateway,type ProviderRefund} from './refund-provider';
import {encryptTicket,hashTicket,requireTicketKey} from './ticket-tokens';
import type {Verification} from './paystack';
const options={maxWait:10000,timeout:15000};
export const operationInput=z.object({kind:z.enum(['TICKET','MERCH']),orderId:z.uuid(),revision:z.number().int().positive(),expectedStatus:z.enum(['RESERVED','PAID','EXPIRED','CANCELLED','REFUNDED']),action:z.enum(['FULFIL','PREVIEW_REFUND','REFUND','SYNC_REFUND']),reason:z.string().trim().min(5).max(500),confirmed:z.literal(true),refundAmountMinor:z.number().int().positive().max(2147483647).optional()}).strict().refine(v=>v.action!=='REFUND'||v.refundAmountMinor!==undefined,'Preview the refund amount before confirming.');
export const operationFilters=z.object({mode:z.enum(['test','live']).default('test'),view:z.enum(['attention','all']).default('attention'),before:z.uuid().optional(),q:z.union([z.uuid(),z.email(),z.string().regex(/^(rotm|merch)-[a-f0-9]{32}$/)]).optional()}).strict();
export async function paymentOperations(db:PrismaClient,identity:Identity,input:z.infer<typeof operationFilters>){
 await requireAdmin(db,identity);
 const base={payments:{some:{domain:input.mode}},...(input.before?{id:{lt:input.before}}:{}),...(input.view==='attention'?{OR:[{needsReconciliation:true},{refund:{isNot:null}}]}:{})};
 const select={id:true,buyerName:true,buyerEmail:true,status:true,needsReconciliation:true,totalMinor:true,operationsRevision:true,refund:true,payments:{select:{reference:true,domain:true,status:true}}} as const;
 const search=input.q?{AND:[{OR:[...(z.uuid().safeParse(input.q).success?[{id:input.q}]:[]),{buyerEmail:input.q.toLowerCase()},{payments:{some:{reference:input.q}}}]}]}:{};
 const [tickets,merch]=await Promise.all([db.order.findMany({where:{...base,...search,event:{slug:concertSlug()}},select,orderBy:{id:'desc'},take:51}),db.merchOrder.findMany({where:{...base,...search,eventSlug:concertSlug()},select,orderBy:{id:'desc'},take:51})]);
 const all=[...tickets.map(o=>({...o,kind:'TICKET' as const})),...merch.map(o=>({...o,kind:'MERCH' as const}))].sort((a,b)=>b.id.localeCompare(a.id));
 return {orders:all.slice(0,50),nextCursor:all.length>50?all[49].id:null};
}
async function readOrder(tx:Prisma.TransactionClient,id:string,kind:'TICKET'|'MERCH'){
 if(kind==='TICKET'){
  const o=await tx.order.findUnique({where:{id},include:{event:true,lines:{include:{tier:true}},payments:true}});if(!o||o.event.slug!==concertSlug())throw new AppError(404,'ORDER_NOT_FOUND','Order not found.');
  return {...o,kind,fulfilmentStatus:'PENDING',payment:o.payments.length===1?o.payments[0]:null,lines:o.lines.map(l=>({id:l.id,stockId:l.tierId,quantity:l.quantity,parkingQuantity:l.parkingQuantity,table:isTable(l.tier.code)}))};
 }
 const o=await tx.merchOrder.findUnique({where:{id},include:{lines:true,payments:true}});if(!o||o.eventSlug!==concertSlug())throw new AppError(404,'ORDER_NOT_FOUND','Order not found.');
 return {...o,kind,payment:o.payments.length===1?o.payments[0]:null,lines:o.lines.map(l=>({id:l.id,stockId:l.variantId,quantity:l.quantity}))};
}
async function lockOrder(tx:Prisma.TransactionClient,id:string,kind:'TICKET'|'MERCH'){
 if(kind==='TICKET')await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id}::uuid FOR UPDATE`;
 else await tx.$queryRaw`SELECT id FROM "MerchOrder" WHERE id=${id}::uuid FOR UPDATE`;
 return readOrder(tx,id,kind);
}
async function staffLock(tx:Prisma.TransactionClient,identity:Identity){const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access required.');return staff[0].id;}
function checkPayment(o:Awaited<ReturnType<typeof readOrder>>,data:Verification,gateway:RefundGateway,exact:boolean){
 const paidAt=data.paid_at?new Date(data.paid_at):null;
 if(!o.payment||o.payment.domain!==gateway.domain||data.domain!==gateway.domain||data.reference!==o.payment.reference||data.currency!=='NGN'||data.status!=='success'||data.customer.email.trim().toLowerCase()!==o.buyerEmail||data.amount<=0||data.amount>2147483647||exact&&data.amount!==o.totalMinor||!paidAt||!Number.isFinite(paidAt.getTime())||paidAt.getTime()>Date.now()+60000)throw new AppError(409,'PAYMENT_NOT_MATCHED','Provider payment does not match this order. Investigate before resolving.');
 return paidAt;
}
async function claimPayment(tx:Prisma.TransactionClient,o:Awaited<ReturnType<typeof readOrder>>,data:Verification){
 const providerId=String(data.id);await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`provider:${providerId}`}))::text`;
 const [ticket,merch]=await Promise.all([tx.paymentAttempt.findUnique({where:{providerTransactionId:providerId}}),tx.merchPayment.findUnique({where:{providerTransactionId:providerId}})]);
 if(ticket&&(o.kind!=='TICKET'||ticket.id!==o.payment!.id)||merch&&(o.kind!=='MERCH'||merch.id!==o.payment!.id)||o.payment!.providerTransactionId&&o.payment!.providerTransactionId!==providerId)throw new AppError(409,'PAYMENT_ALREADY_USED','Provider transaction is already linked to another payment.');
 const update={status:'VERIFIED' as const,verifiedAt:new Date(),providerTransactionId:providerId};
 if(o.kind==='TICKET')await tx.paymentAttempt.update({where:{id:o.payment!.id},data:update});else await tx.merchPayment.update({where:{id:o.payment!.id},data:update});
}
async function changeStock(tx:Prisma.TransactionClient,o:Awaited<ReturnType<typeof readOrder>>,mode:'SELL'|'RELEASE'|'RESTOCK'){
 for(const line of [...o.lines].sort((a,b)=>a.stockId.localeCompare(b.stockId))){
  if(o.kind==='TICKET')await tx.$queryRaw`SELECT id FROM "TicketTier" WHERE id=${line.stockId}::uuid FOR UPDATE`;else await tx.$queryRaw`SELECT id FROM "MerchVariant" WHERE id=${line.stockId}::uuid FOR UPDATE`;
  const stock=o.kind==='TICKET'?await tx.ticketTier.findUniqueOrThrow({where:{id:line.stockId}}):await tx.merchVariant.findUniqueOrThrow({where:{id:line.stockId}});
  if(mode==='SELL'&&o.status!=='RESERVED'&&stock.capacity-stock.reserved-stock.sold<line.quantity)throw new AppError(409,'INSUFFICIENT_STOCK','Available stock cannot fulfil this payment. Refund or increase capacity before resolving.');
  const data=mode==='SELL'?{sold:{increment:line.quantity},...(o.status==='RESERVED'?{reserved:{decrement:line.quantity}}:{})}:mode==='RELEASE'?{reserved:{decrement:line.quantity}}:{sold:{decrement:line.quantity}};
  if(o.kind==='TICKET')await tx.ticketTier.update({where:{id:line.stockId},data});else await tx.merchVariant.update({where:{id:line.stockId},data});
 }
 if(o.kind==='TICKET')await changeParkingStock(tx,o.eventId,o.lines.reduce((n,l)=>n+l.parkingQuantity,0),mode==='SELL'?(o.status==='RESERVED'?'SELL':'REACQUIRE'):mode);
}
export async function operatePayment(db:PrismaClient,identity:Identity,input:z.infer<typeof operationInput>,supplied?:RefundGateway){
 await requireAdmin(db,identity);const gateway=supplied??refundGateway();
 const snapshot=await db.$transaction(tx=>readOrder(tx,input.orderId,input.kind));
 if(snapshot.payment?.domain!==gateway.domain)throw new AppError(409,'PAYMENT_MODE_CHANGED','Select the configured payment mode.');
 const existing=await db.paymentRefund.findUnique({where:input.kind==='TICKET'?{orderId:input.orderId}:{merchOrderId:input.orderId}});
 if(input.action==='SYNC_REFUND'){if(!existing)throw new AppError(404,'REFUND_NOT_FOUND','No refund request exists.');return syncRefund(db,existing.id,gateway,identity);}
 if(existing){if(input.action==='REFUND'||input.action==='PREVIEW_REFUND')return {refundStatus:existing.status};throw new AppError(409,'REFUND_EXISTS','A refund exists; this order cannot be fulfilled.');}
 if(input.action==='REFUND'&&process.env.REFUNDS_ENABLED!=='true')throw new AppError(503,'REFUNDS_DISABLED','Enable REFUNDS_ENABLED before initiating refunds.');
 const data=await gateway.verify(snapshot.payment!.reference);const paidAt=checkPayment(snapshot,data,gateway,input.action==='FULFIL');
 if(input.action==='PREVIEW_REFUND')return {amountMinor:data.amount,currency:'NGN',domain:gateway.domain,reference:snapshot.payment!.reference};
 if(input.action==='REFUND'&&data.amount!==input.refundAmountMinor)throw new AppError(409,'PAYMENT_CHANGED','Verified amount changed. Preview again before refunding.');
 if(input.action==='FULFIL'&&(await gateway.list(String(data.id))).length)throw new AppError(409,'REFUND_REVIEW_REQUIRED','Provider refunds exist; this payment cannot be fulfilled automatically.');
 const result=await db.$transaction(async tx=>{
  const actorId=await staffLock(tx,identity),o=await lockOrder(tx,input.orderId,input.kind);
  if(o.operationsRevision!==input.revision||o.status!==input.expectedStatus)throw new AppError(409,'STALE_REVISION','Order changed. Reload before taking action.');
  checkPayment(o,data,gateway,input.action==='FULFIL');
  if(await tx.paymentRefund.findUnique({where:input.kind==='TICKET'?{orderId:o.id}:{merchOrderId:o.id}}))throw new AppError(409,'REFUND_EXISTS','Another request created a refund. Reload.');
  if(o.status==='REFUNDED'||o.status==='CANCELLED'&&input.action==='FULFIL')throw new AppError(409,'ORDER_CLOSED','This order cannot be resolved automatically.');
  await claimPayment(tx,o,data);
  if(input.action==='FULFIL'){
   if(!o.needsReconciliation||!['RESERVED','EXPIRED'].includes(o.status))throw new AppError(409,'NOT_RECONCILIATION','Only an unfulfilled payment needing reconciliation can be accepted.');
   if(o.kind==='TICKET')requireTicketKey();
   await changeStock(tx,o,'SELL');
   const update={status:'PAID' as const,paidAt,needsReconciliation:false,operationsRevision:{increment:1}};
   if(o.kind==='TICKET'){
    await tx.order.update({where:{id:o.id},data:update});
    for(const line of o.lines.filter(l=>!l.table))for(let ordinal=1;ordinal<=line.quantity;ordinal++){const id=randomUUID(),token=randomBytes(32).toString('base64url');await tx.ticket.create({data:{id,orderLineId:line.id,ordinal,tokenHash:hashTicket(token),encryptedToken:encryptTicket(token,id)}});}
    await issueParking(tx,o.lines);
    if(o.lines.some(l=>!l.table))await tx.outboxMessage.create({data:{deduplicationKey:`tickets:${o.id}`,kind:'TICKETS_ISSUED',payload:{orderId:o.id}}});
   }else await tx.merchOrder.update({where:{id:o.id},data:update});
   await tx.auditLog.create({data:{actorId,action:'PAYMENT_RECONCILIATION_FULFILLED',entityType:input.kind,entityId:o.id,metadata:{reason:input.reason,reference:o.payment!.reference}}});return {resolved:true};
  }
  if(o.kind==='TICKET'&&(o.tableArrivedAt||await tx.admission.count({where:{ticket:{line:{orderId:o.id}}}})||await tx.parkingAdmission.count({where:{pass:{line:{orderId:o.id}}}})))throw new AppError(409,'ALREADY_ADMITTED','Admission or parking has been used. This refund requires separate support review.');
  if(o.kind==='MERCH'&&['DISPATCHED','COMPLETED'].includes(o.fulfilmentStatus))throw new AppError(409,'ALREADY_FULFILLED','Dispatched or collected goods need a returns review.');
  if(o.status==='RESERVED')await changeStock(tx,o,'RELEASE');
  const update={needsReconciliation:true,...(o.status==='RESERVED'?{status:'CANCELLED' as const}:{}),operationsRevision:{increment:1}};
  if(o.kind==='TICKET'){
   await tx.order.update({where:{id:o.id},data:update});await tx.ticket.updateMany({where:{line:{orderId:o.id}},data:{status:'VOID'}});await tx.parkingPass.updateMany({where:{line:{orderId:o.id}},data:{status:'VOID'}});
   await tx.outboxMessage.updateMany({where:{deduplicationKey:`tickets:${o.id}`,deliveredAt:null},data:{blocked:true,lastErrorCode:'REFUND_HOLD'}});
  }else await tx.merchOrder.update({where:{id:o.id},data:{...update,fulfilmentStatus:'PENDING',revision:{increment:1}}});
  const refund=await tx.paymentRefund.create({data:{...(input.kind==='TICKET'?{orderId:o.id}:{merchOrderId:o.id}),reference:o.payment!.reference,transactionId:String(data.id),domain:gateway.domain,amountMinor:data.amount,stockBasis:o.status==='PAID'?'SOLD':'NONE',reason:input.reason,requestedBy:actorId}});
  await tx.auditLog.create({data:{actorId,action:'FULL_REFUND_REQUESTED',entityType:input.kind,entityId:o.id,metadata:{refundId:refund.id,amountMinor:data.amount,reason:input.reason}}});return {refund};
 },options);
 if(!result.refund)return result;
 const requested=result.refund;
 try{
  const prior=await gateway.list(requested.transactionId);
  if(prior.length>1)throw new AppError(409,'REFUND_REVIEW_REQUIRED','Multiple provider refunds require manual review.');
  const provider=prior[0]??await gateway.create(requested.transactionId,requested.amountMinor,`ROTM ${requested.id}: ${input.reason}`);
  return applyRefund(db,requested.id,provider);
 }catch{
  await db.paymentRefund.updateMany({where:{id:requested.id,status:'INITIATING'},data:{status:'UNKNOWN'}});
  return {refundStatus:'UNKNOWN',message:'Refund could not be confirmed. Check provider status; do not initiate another refund.'};
 }
}
async function applyRefund(db:PrismaClient,id:string,provider:ProviderRefund,identity?:Identity){
 return db.$transaction(async tx=>{
  if(identity)await staffLock(tx,identity);
  const snapshot=await tx.paymentRefund.findUniqueOrThrow({where:{id}}),kind=snapshot.orderId?'TICKET':'MERCH',orderId=(snapshot.orderId??snapshot.merchOrderId)!;
  const o=await lockOrder(tx,orderId,kind);
  await tx.$queryRaw`SELECT id FROM "PaymentRefund" WHERE id=${id}::uuid FOR UPDATE`;
  const refund=await tx.paymentRefund.findUniqueOrThrow({where:{id}});
  if(provider.transaction!==refund.transactionId||provider.amount!==refund.amountMinor||provider.currency!==refund.currency||provider.domain!==refund.domain||refund.providerRefundId&&refund.providerRefundId!==provider.id)throw new AppError(409,'REFUND_NOT_MATCHED','Provider refund does not match the requested full refund.');
  if(refund.status==='processed')return {refundStatus:'processed'};
  if(provider.status==='processed'){
   if(refund.stockBasis==='SOLD')await changeStock(tx,o,'RESTOCK');
   const update={status:'REFUNDED' as const,needsReconciliation:false,operationsRevision:{increment:1}};
   if(kind==='TICKET')await tx.order.update({where:{id:orderId},data:update});else await tx.merchOrder.update({where:{id:orderId},data:{...update,fulfilmentStatus:'PENDING',revision:{increment:1}}});
  }
  await tx.paymentRefund.update({where:{id},data:{providerRefundId:provider.id,status:provider.status}});
  if(refund.status!==provider.status)await tx.auditLog.create({data:{action:'REFUND_PROVIDER_STATUS',entityType:kind,entityId:orderId,metadata:{refundId:id,from:refund.status,to:provider.status}}});
  return {refundStatus:provider.status};
 },options);
}
export async function syncRefund(db:PrismaClient,id:string,gateway:RefundGateway=refundGateway(),identity?:Identity){
 const refund=await db.paymentRefund.findUniqueOrThrow({where:{id}});if(refund.domain!==gateway.domain)throw new AppError(409,'PAYMENT_MODE_CHANGED','Refund is in a different provider environment.');
 if(refund.status==='processed')return {refundStatus:'processed'};
 const provider=refund.providerRefundId?await gateway.fetch(refund.providerRefundId):await gateway.list(refund.transactionId).then(items=>{if(items.length!==1)throw new AppError(409,'REFUND_REVIEW_REQUIRED','No unique matching provider refund found. Review in Paystack; no second request was sent.');return items[0];});
 return applyRefund(db,id,provider,identity);
}
export async function syncRefundReference(db:PrismaClient,reference:string){const refund=await db.paymentRefund.findUnique({where:{reference}});if(refund)await syncRefund(db,refund.id);}
