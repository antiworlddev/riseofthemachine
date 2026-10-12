import {createHash,randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {AppError} from './errors';
import {authConfig} from './config';
import type {Identity} from './session';
import {paystackGateway,type Gateway} from './paystack';
import {concertSlug} from './ticketing';
import {requireAdmin} from './admin';
const options={maxWait:10000,timeout:15000};
const buyer={buyerName:z.string().trim().min(2).max(120),phone:z.string().trim().regex(/^\+?[0-9 ()-]{7,24}$/),idempotencyKey:z.uuid(),items:z.array(z.object({variantId:z.uuid(),quantity:z.number().int().min(1).max(10)}).strict()).min(1).max(10)};
const address=z.object({line1:z.string().trim().min(5).max(200),city:z.string().trim().min(2).max(80),state:z.string().trim().min(2).max(80),country:z.literal('Nigeria')}).strict();
export const merchInput=z.discriminatedUnion('fulfilment',[
 z.object({...buyer,fulfilment:z.literal('PICKUP')}).strict(),
 z.object({...buyer,fulfilment:z.literal('DELIVERY'),address,acceptSeparateDeliveryCharge:z.literal(true)}).strict()
]).superRefine((v,c)=>{if(new Set(v.items.map(i=>i.variantId)).size!==v.items.length)c.addIssue({code:'custom',message:'Combine duplicate cart items.'});if(v.items.reduce((n,i)=>n+i.quantity,0)>10)c.addIssue({code:'custom',message:'Maximum ten items per order.'});});
export const merchReference=z.object({reference:z.string().regex(/^merch-[a-f0-9]{32}$/)}).strict();
export const fulfilmentInput=z.object({revision:z.number().int().positive(),status:z.enum(['READY','DISPATCHED','COMPLETED']),note:z.string().trim().max(500).default('')}).strict();
export const deliveryTerms='Delivery is quoted and charged separately after purchase. The checkout total covers merchandise only. Our team will confirm the fee and arrangements before dispatch.';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export async function merchCatalog(db:PrismaClient){
 let configured=true;try{paystackGateway();}catch{configured=false;}
 const products=await db.merchProduct.findMany({orderBy:{slug:'asc'},include:{variants:{orderBy:{label:'asc'}}}});
 return {salesOpen:configured&&process.env.MERCH_SALES_ENABLED==='true',deliveryTerms,products:products.map(p=>({id:p.id,name:p.name,description:p.description,kind:p.kind,priceMinor:p.priceMinor,variants:p.variants.map(v=>({id:v.id,label:v.label,available:p.active&&v.capacity-v.reserved-v.sold>0}))}))};
}
async function release(tx:Prisma.TransactionClient,order:{id:string;lines:{variantId:string;quantity:number}[]}){
 for(const l of [...order.lines].sort((a,b)=>a.variantId.localeCompare(b.variantId))){await tx.$queryRaw`SELECT id FROM "MerchVariant" WHERE id=${l.variantId}::uuid FOR UPDATE`;await tx.merchVariant.update({where:{id:l.variantId},data:{reserved:{decrement:l.quantity}}});}
 await tx.merchOrder.update({where:{id:order.id},data:{status:'EXPIRED'}});
 await tx.auditLog.create({data:{action:'MERCH_ORDER_EXPIRED',entityType:'MerchOrder',entityId:order.id}});
}
export async function expireMerch(db:PrismaClient,limit=25,deadlineAt=Infinity){
 if(Date.now()>=deadlineAt)return 0;
 const found=await db.merchOrder.findMany({where:{eventSlug:concertSlug(),status:'RESERVED',expiresAt:{lte:new Date()}},select:{id:true},take:Math.min(100,Math.max(1,limit)),orderBy:{expiresAt:'asc'}});let count=0;
 for(const o of found){if(Date.now()>=deadlineAt)break;count+=await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "MerchOrder" WHERE id=${o.id}::uuid FOR UPDATE`;const order=await tx.merchOrder.findUniqueOrThrow({where:{id:o.id},include:{lines:true}});if(order.status!=='RESERVED'||order.expiresAt>new Date())return 0;await release(tx,order);return 1;},options);}return count;
}
export async function reserveMerch(db:PrismaClient,identity:Identity,input:z.infer<typeof merchInput>,domain:'test'|'live'){
 if(process.env.MERCH_SALES_ENABLED!=='true')throw new AppError(403,'MERCH_CLOSED','Merch sales are currently closed.');
 const normalized={...input,items:[...input.items].sort((a,b)=>a.variantId.localeCompare(b.variantId))};
 const idempotencyKey=hash(JSON.stringify(['merch',concertSlug(),identity.subject,input.idempotencyKey])),requestHash=hash(JSON.stringify(normalized));
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`merch-buyer:${identity.subject}`}))::text`;
  const existing=await tx.merchOrder.findUnique({where:{idempotencyKey},include:{payments:true}});if(existing){if(existing.requestHash!==requestHash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','The checkout changed. Start a new checkout.');return existing;}
  if(await tx.merchOrder.count({where:{buyerSubject:identity.subject,status:'RESERVED',expiresAt:{gt:new Date()}}})>=3)throw new AppError(429,'TOO_MANY_RESERVATIONS','Finish an existing checkout or wait for it to expire.');
  const lines:{variantId:string;productName:string;variantLabel:string;quantity:number;unitPriceMinor:number}[]=[];let total=0;
  // Shared product locks prevent stock setup changing prices/availability mid-reservation.
  const variants=await tx.merchVariant.findMany({where:{id:{in:normalized.items.map(i=>i.variantId)}},select:{id:true,productId:true}});
  for(const productId of [...new Set(variants.map(v=>v.productId))].sort())await tx.$queryRaw`SELECT id FROM "MerchProduct" WHERE id=${productId}::uuid FOR SHARE`;
  for(const item of normalized.items){
   await tx.$queryRaw`SELECT id FROM "MerchVariant" WHERE id=${item.variantId}::uuid FOR UPDATE`;
   const variant=await tx.merchVariant.findUnique({where:{id:item.variantId},include:{product:true}});
   if(!variant?.product.active)throw new AppError(409,'UNAVAILABLE','A cart item is unavailable.');
   if(variant.capacity-variant.reserved-variant.sold<item.quantity)throw new AppError(409,'SOLD_OUT','Not enough stock for a cart item.');
   total+=variant.product.priceMinor*item.quantity;lines.push({variantId:variant.id,productName:variant.product.name,variantLabel:variant.label,quantity:item.quantity,unitPriceMinor:variant.product.priceMinor});
   await tx.merchVariant.update({where:{id:variant.id},data:{reserved:{increment:item.quantity}}});
  }
  if(!Number.isSafeInteger(total)||total<=0||total>2147483647)throw new AppError(400,'INVALID_TOTAL','Order total is invalid.');
  const order=await tx.merchOrder.create({data:{eventSlug:concertSlug(),idempotencyKey,requestHash,buyerSubject:identity.subject,buyerEmail:identity.email.toLowerCase(),buyerName:input.buyerName,phone:input.phone,fulfilment:input.fulfilment,...(input.fulfilment==='DELIVERY'?{address:input.address,deliveryTerms}:{}),totalMinor:total,expiresAt:new Date(Date.now()+15*60000),lines:{create:lines},payments:{create:{reference:`merch-${randomUUID().replaceAll('-','')}`,amountMinor:total,currency:'NGN',domain}}},include:{payments:true}});
  await tx.auditLog.create({data:{action:'MERCH_ORDER_RESERVED',entityType:'MerchOrder',entityId:order.id,metadata:{totalMinor:total,fulfilment:input.fulfilment}}});return order;
 },options);
}
export async function merchCheckout(db:PrismaClient,identity:Identity,input:z.infer<typeof merchInput>,gateway:Gateway=paystackGateway()){
 await expireMerch(db,5);const order=await reserveMerch(db,identity,input,gateway.domain),payment=order.payments[0];
 if(order.status!=='RESERVED'||order.expiresAt<=new Date())throw new AppError(409,'ORDER_CLOSED','Reservation has ended. Check your orders.');
 if(payment.domain!==gateway.domain)throw new AppError(409,'PAYMENT_MODE_CHANGED','Payment mode changed.');
 if(payment.authorizationUrl)return {authorizationUrl:payment.authorizationUrl,orderId:order.id};
 if(!(await db.merchPayment.updateMany({where:{id:payment.id,initializingAt:null},data:{initializingAt:new Date()}})).count)throw new AppError(409,'CHECKOUT_STARTING','Checkout is already starting or needs support. Check your orders.');
 try{const url=await gateway.initialize({email:order.buyerEmail,amount:order.totalMinor,currency:'NGN',reference:payment.reference,callback_url:`${authConfig().APP_ORIGIN}/merch/orders`});await db.merchPayment.update({where:{id:payment.id},data:{authorizationUrl:url}});return {authorizationUrl:url,orderId:order.id};}
 catch{await db.merchPayment.updateMany({where:{id:payment.id,status:'PENDING'},data:{status:'FAILED'}});throw new AppError(503,'CHECKOUT_UNCERTAIN','Checkout could not be confirmed. Check your orders; reservations expire after 15 minutes.');}
}
export async function verifyMerch(db:PrismaClient,reference:string,identity?:Identity,gateway:Gateway=paystackGateway()){
 const attempt=await db.merchPayment.findUnique({where:{reference},include:{order:true}});
 if(!attempt||attempt.order.eventSlug!==concertSlug()||identity&&attempt.order.buyerSubject!==identity.subject)throw new AppError(404,'ORDER_NOT_FOUND','Order not found.');
 if(attempt.domain!==gateway.domain)throw new AppError(409,'PAYMENT_MODE_CHANGED','Payment environment changed.');
 if(attempt.order.status==='REFUNDED')return {status:'REFUNDED',needsReconciliation:false};
 if(attempt.order.status==='PAID')return {status:'PAID',needsReconciliation:attempt.order.needsReconciliation};
 const data=await gateway.verify(reference);if(data.status!=='success')return {status:attempt.order.status,needsReconciliation:attempt.order.needsReconciliation};
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "MerchOrder" WHERE id=${attempt.orderId}::uuid FOR UPDATE`;
  const order=await tx.merchOrder.findUniqueOrThrow({where:{id:attempt.orderId},include:{lines:true}});if(order.status==='REFUNDED')return {status:'REFUNDED',needsReconciliation:false};if(order.status==='PAID')return {status:'PAID',needsReconciliation:order.needsReconciliation};
  const paidAt=data.paid_at?new Date(data.paid_at):null;
  if(data.reference!==reference||data.amount!==order.totalMinor||data.currency!=='NGN'||data.domain!==attempt.domain||data.customer.email.trim().toLowerCase()!==order.buyerEmail||!paidAt||!Number.isFinite(paidAt.getTime())||paidAt.getTime()>Date.now()+60000){
   await tx.merchOrder.update({where:{id:order.id},data:{needsReconciliation:true}});if(!order.needsReconciliation)await tx.auditLog.create({data:{action:'MERCH_PAYMENT_MISMATCH',entityType:'MerchOrder',entityId:order.id}});return {status:order.status,needsReconciliation:true};
  }
  const providerId=String(data.id);await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`provider:${providerId}`}))::text`;
  const prior=await tx.merchPayment.findUnique({where:{providerTransactionId:providerId}});
  if(prior&&prior.id!==attempt.id||await tx.paymentAttempt.findUnique({where:{providerTransactionId:providerId}}))throw new AppError(409,'PAYMENT_ALREADY_USED','Payment already linked to another order.');
  await tx.merchPayment.update({where:{id:attempt.id},data:{status:'VERIFIED',verifiedAt:new Date(),providerTransactionId:providerId}});
  if(order.needsReconciliation||order.status!=='RESERVED'||order.expiresAt<=new Date()||paidAt>order.expiresAt){if(order.status==='RESERVED')await release(tx,order);await tx.merchOrder.update({where:{id:order.id},data:{needsReconciliation:true}});if(!order.needsReconciliation)await tx.auditLog.create({data:{action:'MERCH_LATE_PAYMENT_REVIEW',entityType:'MerchOrder',entityId:order.id}});return {status:order.status==='RESERVED'?'EXPIRED':order.status,needsReconciliation:true};}
  for(const l of [...order.lines].sort((a,b)=>a.variantId.localeCompare(b.variantId))){await tx.$queryRaw`SELECT id FROM "MerchVariant" WHERE id=${l.variantId}::uuid FOR UPDATE`;await tx.merchVariant.update({where:{id:l.variantId},data:{reserved:{decrement:l.quantity},sold:{increment:l.quantity}}});}
  await tx.merchOrder.update({where:{id:order.id},data:{status:'PAID',paidAt}});
  await tx.auditLog.create({data:{action:'MERCH_ORDER_PAID',entityType:'MerchOrder',entityId:order.id}});return {status:'PAID',needsReconciliation:false};
 },options);
}
const publicSelect={refund:{select:{status:true,amountMinor:true,currency:true}},id:true,buyerName:true,phone:true,fulfilment:true,address:true,deliveryTerms:true,status:true,totalMinor:true,createdAt:true,expiresAt:true,needsReconciliation:true,fulfilmentStatus:true,trackingNote:true,revision:true,lines:{select:{productName:true,variantLabel:true,quantity:true,unitPriceMinor:true}},payments:{select:{reference:true,domain:true,status:true,authorizationUrl:true}}} satisfies Prisma.MerchOrderSelect;
export async function myMerchOrders(db:PrismaClient,identity:Identity){const orders=await db.merchOrder.findMany({where:{buyerSubject:identity.subject,eventSlug:concertSlug()},orderBy:{createdAt:'desc'},take:50,select:publicSelect});return orders.map(o=>({...o,payments:o.payments.map(p=>({...p,authorizationUrl:o.status==='RESERVED'&&o.expiresAt>new Date()&&!o.needsReconciliation?p.authorizationUrl:null}))}));}
export async function adminMerchOrders(db:PrismaClient,identity:Identity,mode:'test'|'live',before?:string){await requireAdmin(db,identity);const found=await db.merchOrder.findMany({where:{eventSlug:concertSlug(),payments:{some:{domain:mode}},...(before?{id:{lt:before}}:{})},orderBy:{id:'desc'},take:51,select:{...publicSelect,buyerEmail:true,payments:{select:{reference:true,domain:true,status:true}}}});return {orders:found.slice(0,50),nextCursor:found.length>50?found[49].id:null};}
export async function updateMerchFulfilment(db:PrismaClient,identity:Identity,id:string,input:z.infer<typeof fulfilmentInput>){
 return db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access required.');
  await tx.$queryRaw`SELECT id FROM "MerchOrder" WHERE id=${id}::uuid FOR UPDATE`;const o=await tx.merchOrder.findUnique({where:{id},include:{payments:true}});
  if(!o||o.eventSlug!==concertSlug())throw new AppError(404,'ORDER_NOT_FOUND','Order not found.');
  if(o.revision!==input.revision)throw new AppError(409,'STALE_REVISION','Order changed. Reload before updating.');
  if(o.status!=='PAID'||o.needsReconciliation||!o.payments.some(p=>p.status==='VERIFIED'))throw new AppError(409,'ORDER_NOT_PAID','Only verified paid orders can be fulfilled.');
  const valid=o.fulfilment==='PICKUP'?{PENDING:'READY',READY:'COMPLETED'}:{PENDING:'DISPATCHED',DISPATCHED:'COMPLETED'};
  if(valid[o.fulfilmentStatus as keyof typeof valid]!==input.status)throw new AppError(409,'INVALID_TRANSITION','Use the next fulfilment step for this order.');
  if(input.status==='DISPATCHED'&&!input.note)throw new AppError(400,'NOTE_REQUIRED','Confirm delivery fee arrangements and add courier/tracking details.');
  const updated=await tx.merchOrder.update({where:{id},data:{fulfilmentStatus:input.status,trackingNote:input.note||o.trackingNote,revision:{increment:1}},select:{revision:true}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'MERCH_FULFILMENT_UPDATED',entityType:'MerchOrder',entityId:id,metadata:{from:o.fulfilmentStatus,to:input.status}}});return updated;
 },options);
}
