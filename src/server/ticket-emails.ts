import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import QRCode from 'qrcode';
import {z} from 'zod';
import {decryptTicket,encryptTicket,requireTicketKey} from './ticket-tokens';
import {concertSlug} from './ticketing';
export type EmailPayload={from:string;to:string[];subject:string;html:string;text:string;attachments:{filename:string;content:string}[]};
export type EmailGateway=(payload:EmailPayload,key:string)=>Promise<string>;
class DeliveryError extends Error{constructor(public code:string,public permanent=false){super(code);}}
export const resendGateway:EmailGateway=async(payload,key)=>{
 let response:Response;try{response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});}catch{throw new DeliveryError('PROVIDER_UNAVAILABLE');}
 if(!response.ok)throw new DeliveryError(`PROVIDER_HTTP_${response.status}`,response.status<500&&response.status!==429&&response.status!==408);
 let data:unknown;try{data=await response.json();}catch{throw new DeliveryError('INVALID_PROVIDER_RESPONSE');}
 const parsed=z.object({id:z.string().min(1).max(200)}).safeParse(data);if(!parsed.success)throw new DeliveryError('INVALID_PROVIDER_RESPONSE');return parsed.data.id;
};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function configuration(){
 if(process.env.EMAIL_DELIVERY_ENABLED!=='true')throw new Error('Set EMAIL_DELIVERY_ENABLED=true to run ticket email delivery.');
 const from=process.env.TICKET_EMAIL_FROM??'',mode=process.env.TICKET_EMAIL_MODE??'test';
 if(!z.email().safeParse(from).success||!/^re_\S+$/.test(process.env.RESEND_API_KEY??'')||!['test','live'].includes(mode))throw new Error('Configure RESEND_API_KEY, TICKET_EMAIL_FROM and TICKET_EMAIL_MODE.');
 const origin=new URL(process.env.APP_ORIGIN??'');if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw new Error('Configure APP_ORIGIN.');requireTicketKey();return {from,mode,origin:origin.origin};
}
export async function emailStatuses(db:PrismaClient,ids:string[]){
 const messages=await db.outboxMessage.findMany({where:{deduplicationKey:{in:ids.map(id=>`tickets:${id}`)}},select:{deduplicationKey:true,deliveredAt:true,attempts:true,blocked:true,lastErrorCode:true}});
 return new Map(messages.map(m=>[m.deduplicationKey.slice(8),{status:m.deliveredAt?'SENT':m.blocked?'NEEDS_ATTENTION':m.attempts?'RETRYING':'QUEUED',attempts:m.attempts,sentAt:m.deliveredAt}]));
}
export async function deliverTicketEmails(db:PrismaClient,gateway:EmailGateway=resendGateway,limit=10){
 const config=configuration(),result={sent:0,retrying:0,blocked:0};
 for(let i=0;i<Math.min(50,Math.max(1,limit));i++){
  const lease=randomUUID();
  const message=await db.$transaction(async tx=>{
   const rows=await tx.$queryRaw<{id:string}[]>`SELECT m.id FROM "OutboxMessage" m JOIN "Order" o ON o.id::text=m.payload->>'orderId' JOIN "Event" e ON e.id=o."eventId" WHERE m.kind='TICKETS_ISSUED' AND m."deliveredAt" IS NULL AND NOT m.blocked AND m."nextAttemptAt"<=now() AND (m."lockedUntil" IS NULL OR m."lockedUntil"<now()) AND e.slug=${concertSlug()} AND EXISTS (SELECT 1 FROM "PaymentAttempt" p WHERE p."orderId"=o.id AND p.domain=${config.mode} AND p.status='VERIFIED') ORDER BY m."createdAt" LIMIT 1 FOR UPDATE OF m SKIP LOCKED`;
   if(!rows.length)return null;
   return tx.outboxMessage.update({where:{id:rows[0].id},data:{leaseToken:lease,lockedUntil:new Date(Date.now()+120000)}});
  });
  if(!message)break;
  let attempted=false;
  try{
   if(message.attempts>=8||message.firstAttemptAt&&Date.now()-message.firstAttemptAt.getTime()>23*3600000)throw new DeliveryError('RETRY_REVIEW_REQUIRED',true);
   const orderId=z.object({orderId:z.uuid()}).parse(message.payload).orderId;
   const order=await db.order.findUniqueOrThrow({where:{id:orderId},include:{event:true,lines:{include:{tier:true,tickets:{orderBy:{ordinal:'asc'}}}},payments:true}});
   const tickets=order.lines.flatMap(line=>line.tickets.map(ticket=>({...ticket,tierName:line.tier.name})));
   if(order.status!=='PAID'||order.needsReconciliation||!tickets.length||tickets.some(t=>t.status!=='ACTIVE'||!t.encryptedToken)||tickets.length!==order.lines.reduce((n,l)=>n+l.quantity,0))throw new DeliveryError('ORDER_NOT_DELIVERABLE',true);
   let payload:EmailPayload;
   if(message.encryptedDeliveryPayload)payload=JSON.parse(decryptTicket(message.encryptedDeliveryPayload,`mail:${message.id}`)) as EmailPayload;
   else{
    const codes=tickets.map(t=>({...t,code:decryptTicket(t.encryptedToken!,t.id)}));
    const banner=config.mode==='test'?'TEST TICKETS — practice only.\n\n':'';
    const text=`${banner}Hello ${order.buyerName},\nYour ${order.event.name} tickets are attached.\nOrder: ${order.id}\n${codes.map((t,i)=>`Ticket ${i+1}: ${t.tierName}\nCode: ${t.code}`).join('\n\n')}\n\nKeep these codes private. Each ticket admits one guest once.\nView your tickets: ${config.origin}/tickets/orders`;
    payload={from:config.from,to:[order.buyerEmail],subject:`${config.mode==='test'?'[TEST] ':''}Your ${order.event.name} tickets`,text,html:`<p>${escape(text).replaceAll('\n','<br>')}</p>`,attachments:await Promise.all(codes.map(async(t,i)=>({filename:`ticket-${i+1}.png`,content:(await QRCode.toBuffer(t.code,{width:512,margin:4,errorCorrectionLevel:'M'})).toString('base64')})))};
    await db.outboxMessage.updateMany({where:{id:message.id,leaseToken:lease},data:{encryptedDeliveryPayload:encryptTicket(JSON.stringify(payload),`mail:${message.id}`)}});
   }
   const claimed=await db.outboxMessage.updateMany({where:{id:message.id,leaseToken:lease,lockedUntil:{gt:new Date()}},data:{attempts:{increment:1},firstAttemptAt:message.firstAttemptAt??new Date()}});if(!claimed.count)continue;
   attempted=true;const providerMessageId=await gateway(payload,`ticket-email:${message.id}`);
   await db.outboxMessage.updateMany({where:{id:message.id,leaseToken:lease},data:{providerMessageId,deliveredAt:new Date(),encryptedDeliveryPayload:null,leaseToken:null,lockedUntil:null,lastErrorCode:null}});result.sent++;
  }catch(error){
   const attempts=message.attempts+(attempted?1:0),blocked=error instanceof DeliveryError?error.permanent||attempts>=8:!attempted;
   await db.outboxMessage.updateMany({where:{id:message.id,leaseToken:lease},data:{blocked,lastErrorCode:error instanceof DeliveryError?error.code:'DELIVERY_FAILED',nextAttemptAt:new Date(Date.now()+Math.min(3600000,60000*2**Math.min(attempts,6))),leaseToken:null,lockedUntil:null}});if(blocked)result.blocked++;else result.retrying++;
  }
 }
 return result;
}
