import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {requireAdmin} from './admin';
import {AppError} from './errors';
import type {Identity} from './session';
const role=z.enum(['ADMIN','SCANNER']);
export const staffLookupInput=z.object({email:z.email().trim().max(254)}).strict();
export const staffChangeInput=z.object({representativeId:z.uuid(),email:z.email().max(254),revision:z.number().int().nonnegative(),role,enabled:z.boolean(),reason:z.string().trim().min(5).max(500),confirmed:z.literal(true)}).strict();
export const staffFilters=z.object({email:z.string().trim().max(254).optional(),role:role.optional(),enabled:z.enum(['true','false']).optional(),cursor:z.uuid().optional()}).strict();
const selection={id:true,email:true,role:true,enabled:true,revision:true} as const;
export async function staffOverview(db:PrismaClient,identity:Identity,filters:z.infer<typeof staffFilters>){
 const actor=await requireAdmin(db,identity);
 const found=await db.staffUser.findMany({where:{...(filters.email?{email:{contains:filters.email.toLowerCase(),mode:'insensitive' as const}}:{}),...(filters.role?{role:filters.role}:{}),...(filters.enabled?{enabled:filters.enabled==='true'}:{}),...(filters.cursor?{id:{gt:filters.cursor}}:{})},select:selection,orderBy:{id:'asc'},take:51});
 return {actorId:actor.id,staff:found.slice(0,50),nextCursor:found.length>50?found[49].id:null};
}
export async function lookupStaffAccount(db:PrismaClient,identity:Identity,email:string){
 await requireAdmin(db,identity);
 const account=await db.representative.findUnique({where:{email:email.trim().toLowerCase()},select:{id:true,name:true,email:true,verifiedAt:true,authSubject:true}});
 if(!account?.verifiedAt)throw new AppError(404,'VERIFIED_ACCOUNT_REQUIRED','Ask this person to sign in and save their representative profile first. No verified account was found.');
 const staff=await db.staffUser.findUnique({where:{authSubject:account.authSubject},select:selection});
 return {representativeId:account.id,name:account.name,email:account.email,staff};
}
export async function changeStaffAccess(db:PrismaClient,identity:Identity,raw:z.infer<typeof staffChangeInput>){
 const parsed=staffChangeInput.safeParse(raw);if(!parsed.success)throw new AppError(400,'INVALID_INPUT','Confirm the account, access and reason.');const input=parsed.data;
 return db.$transaction(async tx=>{
  // Serialize all grants/demotions so two organizers cannot remove one another's last access.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(73194622)`;
  await tx.$queryRaw`SELECT id FROM "StaffUser" ORDER BY id FOR UPDATE`;
  const actor=await tx.staffUser.findUnique({where:{authSubject:identity.subject}});
  if(!actor?.enabled||actor.role!=='ADMIN')throw new AppError(403,'ADMIN_REQUIRED','Organizer access is required.');
  await tx.$queryRaw`SELECT id FROM "Representative" WHERE id=${input.representativeId}::uuid FOR SHARE`;
  const account=await tx.representative.findUnique({where:{id:input.representativeId}});
  if(!account?.verifiedAt||account.email!==input.email.toLowerCase())throw new AppError(409,'ACCOUNT_CHANGED','Verified account changed. Find the account again.');
  const previous=await tx.staffUser.findUnique({where:{authSubject:account.authSubject}});
  if((previous?.revision??0)!==input.revision)throw new AppError(409,'STALE_REVISION','Staff access changed. Find the account again.');
  if(previous?.role===input.role&&previous.enabled===input.enabled&&previous.email===account.email)throw new AppError(409,'NO_CHANGE','This account already has that access.');
  if(previous?.role==='ADMIN'&&previous.enabled&&(!input.enabled||input.role!=='ADMIN')&&await tx.staffUser.count({where:{role:'ADMIN',enabled:true}})<=1)throw new AppError(409,'LAST_ADMIN','Keep at least one active organizer. Grant another organizer access first.');
  if(!previous&&!input.enabled)throw new AppError(400,'INVALID_INPUT','Grant access before disabling a staff account.');
  if(await tx.staffUser.count({where:{email:account.email,...(previous?{id:{not:previous.id}}:{})}}))throw new AppError(409,'ACCOUNT_CONFLICT','This email is linked to another staff identity. Contact the database operator.');
  const staff=previous?await tx.staffUser.update({where:{id:previous.id},data:{email:account.email,role:input.role,enabled:input.enabled,revision:{increment:1}},select:selection}):await tx.staffUser.create({data:{authSubject:account.authSubject,email:account.email,role:input.role,enabled:true},select:selection});
  await tx.auditLog.create({data:{actorId:actor.id,action:'STAFF_ACCESS_CHANGED',entityType:'StaffUser',entityId:staff.id,metadata:{reason:input.reason,targetEmail:account.email,before:previous?{role:previous.role,enabled:previous.enabled,revision:previous.revision}:null,after:{role:staff.role,enabled:staff.enabled,revision:staff.revision}}}});
  return staff;
 },{maxWait:10000,timeout:15000});
}
export const auditFilters=z.object({action:z.string().trim().min(1).max(100).optional(),actorId:z.uuid().optional(),entityType:z.string().trim().min(1).max(100).optional(),entityId:z.string().trim().min(1).max(254).optional(),from:z.iso.datetime({offset:true}).optional(),to:z.iso.datetime({offset:true}).optional(),cursor:z.uuid().optional()}).strict().refine(x=>!x.from||!x.to||new Date(x.from)<=new Date(x.to),{message:'The end date must follow the start date.'});
// Explicit safe fields only; unknown/provider/token/evidence payloads never reach the browser.
export function auditDetails(metadata:Prisma.JsonValue|null){
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return {};
 const safe:Record<string,Prisma.JsonValue>={};
 for(const key of ['reason','fromStatus','toStatus','status','revision','newRevision','targetEmail','fromEmail','toEmail','eligibilityReviewed','previouslyPublished','mode','method','fromActive','toActive','published','fixtureId','startsAt','venue','beforeLabel','tableLabel','note','possibleDuplicate','fromName','toName','fromPriceMinor','toPriceMinor']){const value=metadata[key];if(typeof value==='string'||typeof value==='boolean'||typeof value==='number')safe[key]=value;}
 for(const key of ['before','after']){const value=metadata[key];if(value&&typeof value==='object'&&!Array.isArray(value)){const access:Record<string,Prisma.JsonValue>={};for(const k of ['role','enabled','revision','status','homeScore','awayScore','winnerRosterId','deciderNote']){const v=value[k];if(typeof v==='string'||typeof v==='boolean'||typeof v==='number')access[k]=v;}if(Object.keys(access).length)safe[key]=access;}}
 for(const key of ['variants','beforeVariants']){const variants=metadata[key];if(Array.isArray(variants))safe[key]=variants.slice(0,100).flatMap<Prisma.JsonValue>(v=>{if(!v||typeof v!=='object'||Array.isArray(v)||typeof v.id!=='string')return [];if(typeof v.from==='number'&&typeof v.to==='number')return [{id:v.id,from:v.from,to:v.to}];if(typeof v.label==='string'&&typeof v.enabled==='boolean')return [{id:v.id,label:v.label,enabled:v.enabled}];return [];});}
 return safe;
}
export async function auditHistory(db:PrismaClient,identity:Identity,filters:z.infer<typeof auditFilters>){
 await requireAdmin(db,identity);
 let boundary:Prisma.AuditLogWhereInput={};
 if(filters.cursor){const row=await db.auditLog.findUnique({where:{id:filters.cursor},select:{createdAt:true,id:true}});if(!row)throw new AppError(400,'INVALID_CURSOR','Reload audit history.');boundary={OR:[{createdAt:{lt:row.createdAt}},{createdAt:row.createdAt,id:{lt:row.id}}]};}
 const found=await db.auditLog.findMany({where:{AND:[boundary,{...(filters.action?{action:filters.action}:{}),...(filters.actorId?{actorId:filters.actorId}:{}),...(filters.entityType?{entityType:filters.entityType}:{}),...(filters.entityId?{entityId:filters.entityId}:{}),...((filters.from||filters.to)?{createdAt:{...(filters.from?{gte:new Date(filters.from)}:{}),...(filters.to?{lte:new Date(filters.to)}:{})}}:{})}]},select:{id:true,action:true,entityType:true,entityId:true,createdAt:true,metadata:true,actor:{select:{id:true,email:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:51});
 const [actions,actors,entities]=await Promise.all([db.auditLog.findMany({distinct:['action'],select:{action:true},orderBy:{action:'asc'},take:200}),db.staffUser.findMany({select:{id:true,email:true},orderBy:{email:'asc'},take:200}),db.auditLog.findMany({distinct:['entityType'],select:{entityType:true},orderBy:{entityType:'asc'},take:200})]);
 return {records:found.slice(0,50).map(r=>({...r,metadata:auditDetails(r.metadata)})),nextCursor:found.length>50?found[49].id:null,actions:actions.map(a=>a.action),actors,entityTypes:entities.map(e=>e.entityType)};
}
