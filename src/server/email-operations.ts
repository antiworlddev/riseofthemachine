import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {requireAdmin} from './admin';
import type {Identity} from './session';
import {AppError} from './errors';
import {concertSlug} from './ticketing';
import {kalaSlug} from './config';
export const emailFilters=z.object({mode:z.enum(['test','live']).default('test'),status:z.enum(['ALL','QUEUED','RETRYING','NEEDS_ATTENTION','SENT']).default('ALL'),before:z.uuid().optional()}).strict();
export const emailOperationInput=z.object({messageId:z.uuid(),revision:z.number().int().positive(),action:z.enum(['RETRY','RESEND']),reason:z.string().trim().min(5).max(500),confirmed:z.literal(true),acknowledgeDuplicate:z.literal(true).optional()}).strict().refine(x=>x.action!=='RESEND'||x.acknowledgeDuplicate===true,'Confirm possible duplicate delivery before resending.');
function scope(mode:string){return Prisma.sql`((m.kind='TICKETS_ISSUED' AND EXISTS(SELECT 1 FROM "Order" o JOIN "Event" e ON e.id=o."eventId" JOIN "PaymentAttempt" p ON p."orderId"=o.id WHERE o.id::text=m.payload->>'orderId' AND e.slug=${concertSlug()} AND p.domain=${mode} AND p.status='VERIFIED')) OR (m.kind IN ('TABLE_CONFIRMED','MERCH_CONFIRMED','MERCH_FULFILMENT','KALA_SUBMITTED','KALA_REVIEWED') AND m."deliveryMode"=${mode} AND m."scopeSlug" IN (${concertSlug()},${kalaSlug()})))`;}
export async function emailOverview(db:PrismaClient,identity:Identity,f:z.infer<typeof emailFilters>){
 await requireAdmin(db,identity);
 const status=f.status==='SENT'?Prisma.sql`m."deliveredAt" IS NOT NULL`:f.status==='NEEDS_ATTENTION'?Prisma.sql`m."deliveredAt" IS NULL AND m.blocked`:f.status==='QUEUED'?Prisma.sql`m."deliveredAt" IS NULL AND NOT m.blocked AND m.attempts=0`:f.status==='RETRYING'?Prisma.sql`m."deliveredAt" IS NULL AND NOT m.blocked AND m.attempts>0`:Prisma.sql`true`;
 const rows=await db.$queryRaw<{id:string;kind:string;entityId:string;revision:number;deliveryGeneration:number;attempts:number;blocked:boolean;deliveredAt:Date|null;createdAt:Date;nextAttemptAt:Date;firstAttemptAt:Date|null;lastErrorCode:string|null;lockedUntil:Date|null}[]>`SELECT m.id,m.kind,coalesce(m.payload->>'entityId',m.payload->>'orderId') AS "entityId",m.revision,m."deliveryGeneration",m.attempts,m.blocked,m."deliveredAt",m."createdAt",m."nextAttemptAt",m."firstAttemptAt",m."lastErrorCode",m."lockedUntil" FROM "OutboxMessage" m WHERE ${scope(f.mode)} AND ${status} AND ${f.before?Prisma.sql`m.id<${f.before}::uuid`:Prisma.sql`true`} ORDER BY m.id DESC LIMIT 51`;
 return {messages:rows.slice(0,50).map(m=>({...m,status:m.deliveredAt?'SENT':m.blocked?'NEEDS_ATTENTION':m.attempts?'RETRYING':'QUEUED'})),nextCursor:rows.length>50?rows[49].id:null,notificationsEnabled:process.env.NOTIFICATIONS_ENABLED==='true',deliveryEnabled:process.env.EMAIL_DELIVERY_ENABLED==='true'};
}
export async function operateEmail(db:PrismaClient,identity:Identity,raw:z.infer<typeof emailOperationInput>){
 const parsed=emailOperationInput.safeParse(raw);if(!parsed.success)throw new AppError(400,'INVALID_INPUT','Confirm the email action, reason and duplicate acknowledgement.');const input=parsed.data;
 return db.$transaction(async tx=>{
  const actor=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;if(!actor.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access required.');
  const ids=await tx.$queryRaw<{id:string}[]>`SELECT m.id FROM "OutboxMessage" m WHERE m.id=${input.messageId}::uuid AND (${scope('test')} OR ${scope('live')}) FOR UPDATE OF m`;
  if(!ids.length)throw new AppError(404,'EMAIL_NOT_FOUND','Email not found.');
  const message=await tx.outboxMessage.findUniqueOrThrow({where:{id:input.messageId}});
  if(message.revision!==input.revision)throw new AppError(409,'STALE_REVISION','Email operation changed. Reload before continuing.');
  if(message.lockedUntil&&message.lockedUntil>new Date())throw new AppError(409,'EMAIL_IN_FLIGHT','Delivery is in progress. Wait for the lease to finish and reload.');
  if(input.action==='RETRY'&&(message.deliveredAt||message.attempts>=8||message.firstAttemptAt&&Date.now()-message.firstAttemptAt.getTime()>23*3600000))throw new AppError(409,'RESEND_REQUIRED','Retry is no longer safe within the delivery window. Review the current record and use a confirmed resend if appropriate.');
  if(input.action==='RESEND'&&!message.deliveredAt&&!message.firstAttemptAt)throw new AppError(409,'RETRY_REQUIRED','This message has never been attempted. Use retry instead.');
  const result=await tx.outboxMessage.update({where:{id:message.id},data:{revision:{increment:1},blocked:false,nextAttemptAt:new Date(),lockedUntil:null,leaseToken:null,lastErrorCode:null,...(input.action==='RESEND'?{deliveryGeneration:{increment:1},attempts:0,firstAttemptAt:null,deliveredAt:null,providerMessageId:null,encryptedDeliveryPayload:null}:{})},select:{id:true,revision:true}});
  await tx.auditLog.create({data:{actorId:actor[0].id,action:`EMAIL_${input.action}_REQUESTED`,entityType:'OutboxMessage',entityId:message.id,metadata:{reason:input.reason,newRevision:result.revision,fromStatus:message.deliveredAt?'SENT':message.blocked?'NEEDS_ATTENTION':'QUEUED',possibleDuplicate:input.action==='RESEND'}}});return result;
 },{maxWait:10000,timeout:15000});
}
