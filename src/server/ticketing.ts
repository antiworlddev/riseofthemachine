import {emailStatuses} from './ticket-emails';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { Prisma,type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { Identity } from './session';
import { authConfig } from './config';
import { AppError } from './errors';
import { paystackGateway,type Gateway } from './paystack';
import { decryptTicket,encryptTicket,hashTicket,requireTicketKey } from './ticket-tokens';
export const concertSlug=()=>process.env.CONCERT_EVENT_SLUG||'rise-of-the-machine-2026';
export const checkoutInput=z.object({tierCode:z.enum(['regular','vip']),quantity:z.number().int().min(1).max(10),buyerName:z.string().trim().min(2).max(120),idempotencyKey:z.uuid()}).strict();
export const referenceInput=z.object({reference:z.string().regex(/^rotm-[a-f0-9]{32}$/)}).strict();
const txOptions={maxWait:10000,timeout:15000};
export async function ticketCatalog(db:PrismaClient){
 const event=await db.event.findUnique({where:{slug:concertSlug()},select:{name:true,dateLocal:true,salesEnabled:true,tiers:{where:{code:{in:['regular','vip']}},select:{code:true,name:true,priceMinor:true,currency:true,active:true,capacity:true,reserved:true,sold:true},orderBy:{priceMinor:'asc'}}}});
 if(!event)throw new AppError(503,'EVENT_NOT_CONFIGURED','Ticket information is not available yet.');
 let configured=true;try{paystackGateway();requireTicketKey();}catch{configured=false;}
 const enquiry=z.email().safeParse(process.env.TABLE_ENQUIRY_EMAIL?.trim());
 return {event:{name:event.name,dateLocal:event.dateLocal},salesOpen:configured&&process.env.TICKET_SALES_ENABLED==='true'&&event.salesEnabled,tiers:event.tiers.map(t=>({code:t.code,name:t.name,priceMinor:t.priceMinor,currency:t.currency,available:t.active&&t.capacity-t.reserved-t.sold>0})),tables:[3000000,5000000,10000000].map(price=>({price,url:enquiry.success?`mailto:${enquiry.data}?subject=${encodeURIComponent(`RISE OF THE MACHINE — ₦${price.toLocaleString('en-NG')} table enquiry`)}`:null}))};
}
export async function reserveOrder(db:PrismaClient,identity:Identity,input:z.infer<typeof checkoutInput>,domain:'test'|'live'){
 if(process.env.TICKET_SALES_ENABLED!=='true')throw new AppError(403,'SALES_CLOSED','Ticket sales are currently closed.');
 const idempotencyKey=createHash('sha256').update(JSON.stringify([concertSlug(),identity.subject,input.idempotencyKey])).digest('hex');
 return db.$transaction(async tx=>{
  const buyerLock=`ticket-buyer:${identity.subject}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${buyerLock}))::text`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))::text`;
  const existing=await tx.order.findUnique({where:{idempotencyKey},include:{lines:{include:{tier:true}},payments:true}});
  if(existing){const line=existing.lines[0];if(existing.buyerSubject!==identity.subject||existing.buyerName!==input.buyerName||line.quantity!==input.quantity||line.tier.code!==input.tierCode)throw new AppError(409,'IDEMPOTENCY_CONFLICT','This checkout request changed. Start a new checkout.');return existing;}
  if(await tx.order.count({where:{buyerSubject:identity.subject,status:'RESERVED',expiresAt:{gt:new Date()}}})>=3)throw new AppError(429,'TOO_MANY_RESERVATIONS','Complete or wait for your existing reservations before starting another checkout.');
  const events=await tx.$queryRaw<{id:string;salesEnabled:boolean}[]>`SELECT id,"salesEnabled" FROM "Event" WHERE slug=${concertSlug()} FOR SHARE`;
  const event=events[0];if(!event?.salesEnabled)throw new AppError(403,'SALES_CLOSED','Ticket sales are currently closed.');
  const tiers=await tx.$queryRaw<{id:string;priceMinor:number;currency:string;capacity:number;reserved:number;sold:number;active:boolean}[]>`SELECT id,"priceMinor",currency,capacity,reserved,sold,active FROM "TicketTier" WHERE "eventId"=${event.id}::uuid AND code=${input.tierCode} FOR UPDATE`;
  const tier=tiers[0];if(!tier?.active||tier.currency!=='NGN'||tier.priceMinor<=0)throw new AppError(403,'TIER_CLOSED','This ticket tier is unavailable.');
  if(tier.capacity-tier.reserved-tier.sold<input.quantity)throw new AppError(409,'SOLD_OUT','There are not enough tickets available.');
  await tx.ticketTier.update({where:{id:tier.id},data:{reserved:{increment:input.quantity}}});
  const total=tier.priceMinor*input.quantity;if(!Number.isSafeInteger(total)||total>2147483647)throw new AppError(400,'INVALID_TOTAL','This order is too large.');
  const created=await tx.order.create({data:{eventId:event.id,idempotencyKey,buyerSubject:identity.subject,buyerName:input.buyerName,buyerEmail:identity.email.toLowerCase(),totalMinor:total,currency:tier.currency,expiresAt:new Date(Date.now()+15*60*1000)}});
  await tx.orderLine.create({data:{orderId:created.id,eventId:event.id,tierId:tier.id,quantity:input.quantity,unitPriceMinor:tier.priceMinor}});
  await tx.paymentAttempt.create({data:{orderId:created.id,reference:`rotm-${randomUUID().replaceAll('-','')}`,amountMinor:total,currency:tier.currency,domain}});
  const order=await tx.order.findUniqueOrThrow({where:{id:created.id},include:{lines:{include:{tier:true}},payments:true}});
  await tx.auditLog.create({data:{action:'ORDER_RESERVED',entityType:'Order',entityId:order.id,metadata:{quantity:input.quantity,totalMinor:total}}});return order;
 },txOptions);
}
export async function checkout(db:PrismaClient,identity:Identity,input:z.infer<typeof checkoutInput>,gateway:Gateway=paystackGateway()){
 requireTicketKey();const order=await reserveOrder(db,identity,input,gateway.domain),attempt=order.payments[0];
 if(order.status!=='RESERVED'||order.expiresAt.getTime()<=Date.now())throw new AppError(409,'ORDER_CLOSED','This reservation has ended. Check your orders before starting another checkout.');
 if(attempt.domain!==gateway.domain)throw new AppError(409,'PAYMENT_MODE_CHANGED','This checkout belongs to a different payment environment.');
 if(attempt.authorizationUrl)return {orderId:order.id,reference:attempt.reference,authorizationUrl:attempt.authorizationUrl,expiresAt:order.expiresAt};
 const claimed=await db.paymentAttempt.updateMany({where:{id:attempt.id,initializingAt:null},data:{initializingAt:new Date()}});
 if(!claimed.count)throw new AppError(409,'CHECKOUT_STARTING','Checkout is already starting, or needs payment support. Check your orders shortly.');
 try{const url=await gateway.initialize({email:order.buyerEmail,amount:order.totalMinor,currency:order.currency,reference:attempt.reference,callback_url:`${authConfig().APP_ORIGIN}/tickets/confirmation`});await db.paymentAttempt.update({where:{id:attempt.id},data:{authorizationUrl:url}});return {orderId:order.id,reference:attempt.reference,authorizationUrl:url,expiresAt:order.expiresAt};}
 catch{await db.paymentAttempt.updateMany({where:{id:attempt.id,status:'PENDING'},data:{status:'FAILED'}});throw new AppError(503,'CHECKOUT_UNCERTAIN','Checkout could not be confirmed. Check your orders before trying again; the reservation expires after 15 minutes.');}
}
async function release(tx:Prisma.TransactionClient,order:{id:string;lines:{tierId:string;quantity:number}[]},status:'EXPIRED'|'CANCELLED'){
 for(const line of [...order.lines].sort((a,b)=>a.tierId.localeCompare(b.tierId))){await tx.$queryRaw`SELECT id FROM "TicketTier" WHERE id=${line.tierId}::uuid FOR UPDATE`;await tx.ticketTier.update({where:{id:line.tierId},data:{reserved:{decrement:line.quantity}}});}
 await tx.order.update({where:{id:order.id},data:{status}});
 await tx.auditLog.create({data:{action:`ORDER_${status}`,entityType:'Order',entityId:order.id}});
}
export async function expireReservations(db:PrismaClient,limit=100,deadlineAt=Infinity){
 if(Date.now()>=deadlineAt)return 0;
 const expired=await db.order.findMany({where:{event:{slug:concertSlug()},status:'RESERVED',expiresAt:{lte:new Date()}},select:{id:true},orderBy:{expiresAt:'asc'},take:Math.min(100,Math.max(1,limit))});let count=0;
 for(const item of expired){if(Date.now()>=deadlineAt)break;count+=await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${item.id}::uuid FOR UPDATE`;const order=await tx.order.findUniqueOrThrow({where:{id:item.id},include:{lines:true}});if(order.status!=='RESERVED'||order.expiresAt.getTime()>Date.now())return 0;await release(tx,order,'EXPIRED');return 1;},txOptions);}
 return count;
}
export async function verifyPayment(db:PrismaClient,reference:string,identity?:Identity,gateway:Gateway=paystackGateway()){
 const attempt=await db.paymentAttempt.findUnique({where:{reference},include:{order:true}});
 if(!attempt||attempt.order.eventId!==(await db.event.findUnique({where:{slug:concertSlug()},select:{id:true}}))?.id||(identity&&attempt.order.buyerSubject!==identity.subject))throw new AppError(404,'ORDER_NOT_FOUND','Order not found.');
 if(attempt.domain!==gateway.domain)throw new AppError(409,'PAYMENT_MODE_CHANGED','Payment environment does not match this order.');
 if(attempt.order.status==='REFUNDED')return {orderId:attempt.orderId,status:'REFUNDED',needsReconciliation:false};
 if(attempt.order.status==='PAID')return {orderId:attempt.orderId,status:'PAID',needsReconciliation:attempt.order.needsReconciliation};
 const data=await gateway.verify(reference);
 if(data.status!=='success')return {orderId:attempt.orderId,status:attempt.order.status,needsReconciliation:attempt.order.needsReconciliation,paymentStatus:data.status};
 requireTicketKey();
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${attempt.orderId}::uuid FOR UPDATE`;
  const order=await tx.order.findUniqueOrThrow({where:{id:attempt.orderId},include:{lines:true}});
  if(order.status==='REFUNDED')return {orderId:order.id,status:'REFUNDED',needsReconciliation:false};if(order.status==='PAID')return {orderId:order.id,status:'PAID',needsReconciliation:order.needsReconciliation};
  const paidAt=data.paid_at?new Date(data.paid_at):null;
  const mismatch=data.reference!==reference||data.amount!==order.totalMinor||data.currency!==order.currency||data.domain!==attempt.domain||data.customer.email.trim().toLowerCase()!==order.buyerEmail||!paidAt||!Number.isFinite(paidAt.getTime())||paidAt.getTime()>Date.now()+60000;
  if(mismatch){await tx.order.update({where:{id:order.id},data:{needsReconciliation:true}});if(!order.needsReconciliation)await tx.auditLog.create({data:{action:'PAYMENT_MISMATCH',entityType:'Order',entityId:order.id}});return {orderId:order.id,status:order.status,needsReconciliation:true};}
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`provider:${String(data.id)}`}))::text`;
  if(await tx.merchPayment.findUnique({where:{providerTransactionId:String(data.id)}}))throw new AppError(409,'PAYMENT_ALREADY_USED','This payment is already linked to another order.');
  const prior=await tx.paymentAttempt.findUnique({where:{providerTransactionId:String(data.id)}});if(prior&&prior.id!==attempt.id)throw new AppError(409,'PAYMENT_ALREADY_USED','This payment is already linked to another order.');
  await tx.paymentAttempt.update({where:{id:attempt.id},data:{status:'VERIFIED',verifiedAt:new Date(),providerTransactionId:String(data.id)}});
  if(order.needsReconciliation||order.status!=='RESERVED'||order.expiresAt.getTime()<=Date.now()||paidAt!.getTime()>order.expiresAt.getTime()){
   if(order.status==='RESERVED')await release(tx,order,'EXPIRED');
   await tx.order.update({where:{id:order.id},data:{needsReconciliation:true}});
   if(!order.needsReconciliation)await tx.auditLog.create({data:{action:'LATE_PAYMENT_REQUIRES_RECONCILIATION',entityType:'Order',entityId:order.id}});
   return {orderId:order.id,status:order.status==='RESERVED'?'EXPIRED':order.status,needsReconciliation:true};
  }
  await tx.order.update({where:{id:order.id},data:{status:'PAID',paidAt}});
  for(const line of [...order.lines].sort((a,b)=>a.tierId.localeCompare(b.tierId))){
   await tx.$queryRaw`SELECT id FROM "TicketTier" WHERE id=${line.tierId}::uuid FOR UPDATE`;
   await tx.ticketTier.update({where:{id:line.tierId},data:{reserved:{decrement:line.quantity},sold:{increment:line.quantity}}});
   for(let ordinal=1;ordinal<=line.quantity;ordinal++){const token=randomBytes(32).toString('base64url'),id=randomUUID();await tx.ticket.create({data:{id,orderLineId:line.id,ordinal,tokenHash:hashTicket(token),encryptedToken:encryptTicket(token,id)}});}
  }
  await tx.outboxMessage.create({data:{deduplicationKey:`tickets:${order.id}`,kind:'TICKETS_ISSUED',payload:{orderId:order.id}}});
  await tx.auditLog.create({data:{action:'ORDER_PAID',entityType:'Order',entityId:order.id,metadata:{paymentAttemptId:attempt.id}}});return {orderId:order.id,status:'PAID',needsReconciliation:order.needsReconciliation};
 },txOptions);
}
export async function myOrders(db:PrismaClient,identity:Identity){
 const orders=await db.order.findMany({where:{buyerSubject:identity.subject,event:{slug:concertSlug()}},orderBy:{createdAt:'desc'},take:50,select:{id:true,status:true,needsReconciliation:true,totalMinor:true,currency:true,expiresAt:true,createdAt:true,refund:{select:{status:true,amountMinor:true,currency:true}},lines:{select:{quantity:true,unitPriceMinor:true,tier:{select:{name:true}},tickets:{select:{id:true,ordinal:true,status:true,encryptedToken:true},orderBy:{ordinal:'asc'}}}},payments:{select:{reference:true,authorizationUrl:true,status:true,domain:true}}}});
 const emails=await emailStatuses(db,orders.map(o=>o.id));
 return orders.map(order=>({...order,emailDelivery:emails.get(order.id)??null,payments:order.payments.map(p=>({...p,authorizationUrl:order.status==='RESERVED'&&order.expiresAt.getTime()>Date.now()?p.authorizationUrl:null})),lines:order.lines.map(line=>({...line,tickets:line.tickets.map(t=>({id:t.id,ordinal:t.ordinal,status:t.status,code:order.status==='PAID'&&t.status==='ACTIVE'&&t.encryptedToken?decryptTicket(t.encryptedToken,t.id):null}))}))}));
}
