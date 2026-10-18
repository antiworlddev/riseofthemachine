import {createHmac,timingSafeEqual} from 'node:crypto';
import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {AppError} from './errors';
import {requireAdmin} from './admin';
import type {Identity} from './session';
import {csvCell} from './merch-order-tools';
export const consentVersion='2026-10-18-v1';
export const signupInput=z.object({
 firstName:z.string().trim().min(1,'Enter your first name.').max(80).refine(v=>!/[\u0000-\u001f\u007f]/.test(v),'Check your name.'),
 email:z.string().trim().pipe(z.email().max(254)).transform(v=>v.toLowerCase()),
 source:z.enum(['waitlist','newsletter']),newsletter:z.boolean(),website:z.string().max(200).default(''),
}).strict().refine(v=>v.source!=='newsletter'||v.newsletter,{message:'Confirm that you want to receive ODUMODUBLVCK’s newsletter.',path:['newsletter']});
export async function subscribe(client:PrismaClient,input:z.infer<typeof signupInput>){
 if(input.website)return; // Return the same response for the honeypot without storing it.
 await client.$transaction(async tx=>{
  const now=new Date();
  // INSERT ... ON CONFLICT is atomic for simultaneous waitlist/newsletter submissions.
  const rows=await tx.$queryRaw<{id:string}[]>`INSERT INTO "Subscriber" (id,email,"firstName","waitlistAt","newsletterAt","createdAt","updatedAt")
   VALUES (gen_random_uuid(),${input.email},${input.firstName},${input.source==='waitlist'?now:null},${input.newsletter?now:null},${now},${now})
   ON CONFLICT (email) DO UPDATE SET "firstName"=EXCLUDED."firstName",
   "waitlistAt"=COALESCE("Subscriber"."waitlistAt",EXCLUDED."waitlistAt"),
   "waitlistUnsubscribedAt"=CASE WHEN EXCLUDED."waitlistAt" IS NOT NULL THEN NULL ELSE "Subscriber"."waitlistUnsubscribedAt" END,
   "newsletterAt"=CASE WHEN EXCLUDED."newsletterAt" IS NOT NULL THEN EXCLUDED."newsletterAt" ELSE "Subscriber"."newsletterAt" END,
   "unsubscribedAt"=CASE WHEN EXCLUDED."newsletterAt" IS NOT NULL THEN NULL ELSE "Subscriber"."unsubscribedAt" END,
   "mailjetSyncPending"=true,"mailjetRevision"="Subscriber"."mailjetRevision"+1,
   "mailjetNextAttemptAt"=EXCLUDED."updatedAt","mailjetAttempts"=0,"mailjetLastError"=NULL,
   "updatedAt"=EXCLUDED."updatedAt" RETURNING id`;
  await tx.subscriberConsent.createMany({data:[...(input.source==='waitlist'?[{subscriberId:rows[0].id,action:'WAITLIST_JOINED',source:input.source,version:consentVersion}]:[]),...(input.newsletter?[{subscriberId:rows[0].id,action:'NEWSLETTER_OPT_IN',source:input.source,version:consentVersion}]:[])]});
 });
}
export function subscriberOrigin(request:Request){
 const origin=process.env.APP_ORIGIN;
 if(!origin||new URL(origin).origin!==origin)throw new AppError(503,'SIGNUP_NOT_CONFIGURED','Signups will be available shortly.');
 if(request.headers.get('origin')!==origin)throw new AppError(403,'INVALID_ORIGIN','Please use the form on our website.');
}
function signingKey(){const key=process.env.SUBSCRIBER_TOKEN_KEY;if(!key||!/^[a-f0-9]{64}$/i.test(key))throw new AppError(503,'NEWSLETTER_NOT_CONFIGURED','Configure the subscriber token key before exporting mailing lists.');return Buffer.from(key,'hex');}
export function unsubscribeToken(id:string){return `${id}.${createHmac('sha256',signingKey()).update(`rotm-newsletter-unsubscribe-v1:${id}`).digest('hex')}`;}
export function verifyUnsubscribeToken(token:string){
 const parts=token.split('.');if(parts.length!==2||!z.uuid().safeParse(parts[0]).success||!/^[a-f0-9]{64}$/.test(parts[1]))throw new AppError(400,'INVALID_LINK','This unsubscribe link is invalid.');
 const expected=unsubscribeToken(parts[0]).split('.')[1];
 if(!timingSafeEqual(Buffer.from(parts[1],'hex'),Buffer.from(expected,'hex')))throw new AppError(400,'INVALID_LINK','This unsubscribe link is invalid.');
 return parts[0];
}
export async function unsubscribe(client:PrismaClient,token:string,scope:'all'|'newsletter'='all'){
 const id=verifyUnsubscribeToken(token);
 await client.$transaction(async tx=>{
  const now=new Date();
  const newsletter=await tx.subscriber.updateMany({where:{id,newsletterAt:{not:null},unsubscribedAt:null},data:{unsubscribedAt:now}});
  const waitlist=scope==='all'?await tx.subscriber.updateMany({where:{id,waitlistAt:{not:null},waitlistUnsubscribedAt:null},data:{waitlistUnsubscribedAt:now}}):{count:0};
  if(newsletter.count||waitlist.count)await tx.subscriber.update({where:{id},data:{mailjetSyncPending:true,mailjetRevision:{increment:1},mailjetNextAttemptAt:now,mailjetAttempts:0,mailjetLastError:null}});
  if(newsletter.count||waitlist.count)await tx.subscriberConsent.create({data:{subscriberId:id,action:scope==='all'?'ALL_OPT_OUT':'NEWSLETTER_OPT_OUT',source:'unsubscribe',version:consentVersion}});
 });
}
export const subscriberFilters=z.object({list:z.enum(['all','waitlist','newsletter','unsubscribed']).default('all'),before:z.uuid().optional()}).strict();
export function subscriberWhere(list:z.infer<typeof subscriberFilters>['list']):Prisma.SubscriberWhereInput{return list==='waitlist'?{waitlistAt:{not:null},waitlistUnsubscribedAt:null,mailjetSuppressedAt:null}:list==='newsletter'?{newsletterAt:{not:null},unsubscribedAt:null,mailjetSuppressedAt:null}:list==='unsubscribed'?{OR:[{unsubscribedAt:{not:null}},{waitlistUnsubscribedAt:{not:null}},{mailjetSuppressedAt:{not:null}}]}:{};}
const selection={mailjetSyncPending:true,mailjetSyncedAt:true,mailjetLastError:true,mailjetSuppressedAt:true,id:true,email:true,firstName:true,waitlistAt:true,waitlistUnsubscribedAt:true,newsletterAt:true,unsubscribedAt:true,createdAt:true} as const;
export async function subscriberOverview(client:PrismaClient,identity:Identity,filters:z.infer<typeof subscriberFilters>){
 await requireAdmin(client,identity);
 const where=subscriberWhere(filters.list);
 const [rows,total,waitlist,newsletter]=await Promise.all([
 client.subscriber.findMany({where,select:selection,orderBy:[{createdAt:'desc'},{id:'desc'}],take:51,...(filters.before?{cursor:{id:filters.before},skip:1}:{})}),
 client.subscriber.count(),client.subscriber.count({where:subscriberWhere('waitlist')}),client.subscriber.count({where:subscriberWhere('newsletter')})]);
 return {mailjetEnabled:process.env.MAILJET_ENABLED==='true',subscribers:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null,counts:{total,waitlist,newsletter}};
}
export async function exportSubscribers(client:PrismaClient,identity:Identity,list:z.infer<typeof subscriberFilters>['list']){
 const actor=await requireAdmin(client,identity);
 const rows=await client.subscriber.findMany({where:subscriberWhere(list),select:selection,orderBy:[{createdAt:'asc'},{id:'asc'}],take:5001});
 if(rows.length>5000)throw new AppError(400,'EXPORT_TOO_LARGE','Export is limited to 5,000 subscribers. Use a narrower list.');
 const origin=process.env.APP_ORIGIN;if(!origin||new URL(origin).origin!==origin)throw new AppError(503,'SIGNUP_NOT_CONFIGURED','Configure APP_ORIGIN first.');
 const csv=[['First name','Email','Waitlist joined','Waitlist unsubscribed','Newsletter consent','Newsletter unsubscribed','Mailjet suppression','Unsubscribe URL'],...rows.map(r=>[r.firstName,r.email,r.waitlistAt?.toISOString()??'',r.waitlistUnsubscribedAt?.toISOString()??'',r.newsletterAt?.toISOString()??'',r.unsubscribedAt?.toISOString()??'',r.mailjetSuppressedAt?.toISOString()??'',((r.newsletterAt&&!r.unsubscribedAt)||(r.waitlistAt&&!r.waitlistUnsubscribedAt))?`${origin}/newsletter/unsubscribe?token=${unsubscribeToken(r.id)}`:''])].map(row=>row.map(csvCell).join(',')).join('\r\n');
 await client.auditLog.create({data:{actorId:actor.id,action:'SUBSCRIBERS_EXPORTED',entityType:'Subscriber',entityId:'export',metadata:{list,count:rows.length}}});
 return csv;
}
export const retrySubscriberInput=z.object({id:z.uuid(),confirmed:z.literal(true)}).strict();
export async function retrySubscriberSync(client:PrismaClient,identity:Identity,id:string){
 return client.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;
  if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access is required.');
  await tx.$queryRaw`SELECT id FROM "Subscriber" WHERE id=${id}::uuid FOR UPDATE`;
  const fan=await tx.subscriber.findUnique({where:{id}});if(!fan)throw new AppError(404,'SUBSCRIBER_NOT_FOUND','Subscriber not found.');
  if(fan.mailjetLockedUntil&&fan.mailjetLockedUntil>new Date())throw new AppError(409,'SYNC_IN_PROGRESS','Sync is already in progress. Please wait.');
  await tx.subscriber.update({where:{id},data:{mailjetSyncPending:true,mailjetRevision:{increment:1},mailjetNextAttemptAt:new Date(),mailjetAttempts:0,mailjetLastError:null,mailjetLease:null,mailjetLockedUntil:null}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'MAILJET_SYNC_REQUEUED',entityType:'Subscriber',entityId:id}});
 });
}
