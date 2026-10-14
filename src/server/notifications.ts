import {randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {encryptTicket,decryptTicket} from './ticket-tokens';
import {kalaSlug} from './config';
import {concertSlug} from './ticketing';
import {DeliveryError,emailConfiguration,deliverTicketEmails,resendGateway,type EmailGateway,type EmailPayload} from './ticket-emails';
const kinds=['TABLE_CONFIRMED','MERCH_CONFIRMED','MERCH_FULFILMENT','KALA_SUBMITTED','KALA_REVIEWED'] as const;
export type NotificationKind=typeof kinds[number];
const snapshotSchema=z.object({to:z.email(),subject:z.string().min(1).max(300),text:z.string().max(20000),linkPath:z.enum(['/tickets/orders','/merch/orders','/kala-games']),entityId:z.uuid(),revision:z.number().int().positive().optional(),representativeId:z.uuid().optional(),status:z.string().optional()}).strict();
type Snapshot=z.infer<typeof snapshotSchema>;
export async function queueNotification(tx:Prisma.TransactionClient,key:string,kind:NotificationKind,mode:'test'|'live',scopeSlug:string,data:Snapshot){
 if(process.env.NOTIFICATIONS_ENABLED!=='true')return;
 const snapshot=snapshotSchema.parse(data),id=randomUUID();
 await tx.outboxMessage.create({data:{id,deduplicationKey:key,kind,deliveryMode:mode,scopeSlug,payload:{entityId:snapshot.entityId},notificationSnapshot:encryptTicket(JSON.stringify(snapshot),`notification:${id}`)}});
}
export function kalaNotificationMode(){return z.enum(['test','live']).parse(process.env.KALA_NOTIFICATION_MODE??'test');}
export async function queueRosterNotification(tx:Prisma.TransactionClient,rosterId:string,revision:number,status:string,note?:string|null){
 if(process.env.NOTIFICATIONS_ENABLED!=='true')return;
 const r=await tx.sportRoster.findUniqueOrThrow({where:{id:rosterId},include:{competition:true,team:{include:{representative:true,event:true}}}});
 const mode=kalaNotificationMode();
 await queueNotification(tx,`kala:${rosterId}:${revision}`,status==='SUBMITTED'?'KALA_SUBMITTED':'KALA_REVIEWED',mode,r.team.event.slug,{to:r.team.representative.email,subject:`KALA GAMES roster ${status.toLowerCase()}`,text:`Hello ${r.team.representative.name},\n${r.team.teamName} · ${r.competition.sportCode}\nRoster status: ${status}\n${note?`Organizer reason/note: ${note}\n`:''}${status==='REJECTED'?'Correct the roster and resubmit it for review.':status==='SUBMITTED'?'Your roster is awaiting organizer review. Registration is free.':'Your roster has been approved.'}\nRoster: ${r.id}`,linkPath:'/kala-games',entityId:r.id,revision,representativeId:r.team.representativeId,status});
}
export async function queueOrderNotification(tx:Prisma.TransactionClient,kind:'TABLE_CONFIRMED'|'MERCH_CONFIRMED'|'MERCH_FULFILMENT',orderId:string,mode:'test'|'live'){
 if(process.env.NOTIFICATIONS_ENABLED!=='true')return;
 if(kind==='TABLE_CONFIRMED'){
  const o=await tx.order.findUniqueOrThrow({where:{id:orderId},include:{event:true,lines:{include:{tier:true}}}});
  await queueNotification(tx,`table:${o.id}`,kind,mode,o.event.slug,{to:o.buyerEmail,subject:`Your ${o.event.name} table booking`,text:`Hello ${o.buyerName},\nYour table booking is confirmed.\n${o.lines.map(l=>`${l.tier.name} · ${l.quantity} table · ${l.parkingQuantity} VIP parking pass(es)`).join('\n')}\nPaid: NGN ${(o.totalMinor/100).toFixed(2)}\nOrder: ${o.id}\nView your booking and private parking passes in your account. Seating and guest arrangements will be confirmed by the organizer.`,linkPath:'/tickets/orders',entityId:o.id});
 }else{
  const o=await tx.merchOrder.findUniqueOrThrow({where:{id:orderId},include:{lines:true}});
  const subject=kind==='MERCH_CONFIRMED'?'Your merch payment is confirmed':`Merch fulfilment: ${o.fulfilmentStatus.toLowerCase()}`;
  await queueNotification(tx,kind==='MERCH_CONFIRMED'?`merch-paid:${o.id}`:`merch-fulfilment:${o.id}:${o.revision}`,kind,mode,o.eventSlug,{to:o.buyerEmail,subject,text:`Hello ${o.buyerName},\n${subject}.\n${o.lines.map(l=>`${l.quantity} × ${l.productName} · ${l.variantLabel}`).join('\n')}\nPaid: NGN ${(o.totalMinor/100).toFixed(2)}\nMethod: ${o.fulfilment}\n${kind==='MERCH_FULFILMENT'?`Status: ${o.fulfilmentStatus}\n${o.trackingNote??''}\n`:''}${o.fulfilment==='PICKUP'?'Event pickup: collection details will be confirmed.':o.deliveryTerms??''}\nOrder: ${o.id}`,linkPath:'/merch/orders',entityId:o.id,...(kind==='MERCH_FULFILMENT'?{revision:o.revision,status:o.fulfilmentStatus}:{})});
 }
}
async function safeToSend(db:PrismaClient,message:{kind:string;deliveryMode:string|null;scopeSlug:string|null},snapshot:Snapshot){
 if(message.kind.startsWith('KALA_')){
  const r=await db.sportRoster.findUnique({where:{id:snapshot.entityId},include:{team:{include:{representative:true,event:true}}}});
  if(!r||r.team.event.slug!==kalaSlug()||r.team.representativeId!==snapshot.representativeId||r.team.representative.email!==snapshot.to)throw new DeliveryError('RECIPIENT_CHANGED',true);
  if(r.revision!==snapshot.revision||r.status!==snapshot.status)throw new DeliveryError('NOTIFICATION_SUPERSEDED',true);
 }else if(message.kind==='TABLE_CONFIRMED'){
  const o=await db.order.findUnique({where:{id:snapshot.entityId},include:{event:true,payments:true}});
  if(!o||o.event.slug!==concertSlug()||o.buyerEmail!==snapshot.to||o.status!=='PAID'||o.needsReconciliation||!o.payments.some(p=>p.domain===message.deliveryMode&&p.status==='VERIFIED'))throw new DeliveryError('ORDER_NOT_DELIVERABLE',true);
 }else{
  const o=await db.merchOrder.findUnique({where:{id:snapshot.entityId},include:{payments:true}});
  if(!o||o.eventSlug!==concertSlug()||o.buyerEmail!==snapshot.to||o.status!=='PAID'||o.needsReconciliation||!o.payments.some(p=>p.domain===message.deliveryMode&&p.status==='VERIFIED'))throw new DeliveryError('ORDER_NOT_DELIVERABLE',true);
  if(message.kind==='MERCH_FULFILMENT'&&(o.revision!==snapshot.revision||o.fulfilmentStatus!==snapshot.status))throw new DeliveryError('NOTIFICATION_SUPERSEDED',true);
 }
}
export async function deliverNotifications(db:PrismaClient,gateway:EmailGateway=resendGateway,limit=10,deadlineAt=Infinity){
 const result={sent:0,retrying:0,blocked:0};if(process.env.NOTIFICATIONS_ENABLED!=='true')return result;
 const config=emailConfiguration();
 for(let i=0;i<Math.min(50,Math.max(0,limit))&&Date.now()<deadlineAt;i++){
  const lease=randomUUID();const message=await db.$transaction(async tx=>{
   const ids=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "OutboxMessage" WHERE kind IN (${Prisma.join(kinds)}) AND "deliveryMode"=${config.mode} AND "scopeSlug" IN (${concertSlug()},${kalaSlug()}) AND "deliveredAt" IS NULL AND NOT blocked AND "nextAttemptAt"<=now() AND ("lockedUntil" IS NULL OR "lockedUntil"<now()) ORDER BY "createdAt",id LIMIT 1 FOR UPDATE SKIP LOCKED`;
   return ids.length?tx.outboxMessage.update({where:{id:ids[0].id},data:{leaseToken:lease,lockedUntil:new Date(Date.now()+120000)}}):null;
  });if(!message)break;let attempted=false;
  try{
   if(message.attempts>=8||message.firstAttemptAt&&Date.now()-message.firstAttemptAt.getTime()>23*3600000)throw new DeliveryError('RETRY_REVIEW_REQUIRED',true);
   if(!message.notificationSnapshot)throw new DeliveryError('SNAPSHOT_MISSING',true);
   const snapshot=snapshotSchema.parse(JSON.parse(decryptTicket(message.notificationSnapshot,`notification:${message.id}`)));await safeToSend(db,message,snapshot);
   let payload:EmailPayload;
   if(message.encryptedDeliveryPayload)payload=JSON.parse(decryptTicket(message.encryptedDeliveryPayload,`mail:${message.id}`)) as EmailPayload;
   else{const text=`${config.mode==='test'?'TEST NOTIFICATION — practice only.\n\n':''}${snapshot.text}\n\nView current details: ${config.origin}${snapshot.linkPath}`;const html=text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)).replaceAll('\n','<br>');payload={from:config.from,to:[snapshot.to],subject:`${config.mode==='test'?'[TEST] ':''}${snapshot.subject}`,text,html:`<p>${html}</p>`,attachments:[]};await db.outboxMessage.updateMany({where:{id:message.id,leaseToken:lease},data:{encryptedDeliveryPayload:encryptTicket(JSON.stringify(payload),`mail:${message.id}`)}});}
   const claimed=await db.outboxMessage.updateMany({where:{id:message.id,leaseToken:lease,lockedUntil:{gt:new Date()}},data:{attempts:{increment:1},firstAttemptAt:message.firstAttemptAt??new Date()}});if(!claimed.count)continue;
   attempted=true;const providerMessageId=await gateway(payload,`event-email:${message.id}:g${message.deliveryGeneration}`);
   await db.outboxMessage.updateMany({where:{id:message.id,leaseToken:lease},data:{providerMessageId,deliveredAt:new Date(),encryptedDeliveryPayload:null,leaseToken:null,lockedUntil:null,lastErrorCode:null}});result.sent++;
  }catch(error){const attempts=message.attempts+(attempted?1:0),blocked=error instanceof DeliveryError?error.permanent||attempts>=8:!attempted;await db.outboxMessage.updateMany({where:{id:message.id,leaseToken:lease},data:{blocked,lastErrorCode:error instanceof DeliveryError?error.code:'DELIVERY_FAILED',nextAttemptAt:new Date(Date.now()+Math.min(3600000,60000*2**Math.min(attempts,6))),leaseToken:null,lockedUntil:null}});if(blocked)result.blocked++;else result.retrying++;}
 }
 return result;
}
export async function deliverEmails(db:PrismaClient,gateway:EmailGateway=resendGateway,limit=10,deadlineAt=Infinity){
 const budget=Math.min(50,Math.max(1,limit)),tickets=await deliverTicketEmails(db,gateway,Math.max(1,Math.floor(budget/2)),deadlineAt);
 let remaining=budget-tickets.sent-tickets.retrying-tickets.blocked;
 const notifications=remaining>0?await deliverNotifications(db,gateway,remaining,deadlineAt):{sent:0,retrying:0,blocked:0};remaining-=notifications.sent+notifications.retrying+notifications.blocked;
 const extra=remaining>0?await deliverTicketEmails(db,gateway,remaining,deadlineAt):{sent:0,retrying:0,blocked:0};return {sent:tickets.sent+notifications.sent+extra.sent,retrying:tickets.retrying+notifications.retrying+extra.retrying,blocked:tickets.blocked+notifications.blocked+extra.blocked};
}
