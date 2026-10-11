import { type PrismaClient } from '@prisma/client';
import type { Identity } from './session';
import { AppError } from './errors';
import { kalaSlug } from './config';
import { z } from 'zod';
export const reviewInput=z.object({revision:z.number().int().positive(),decision:z.enum(['APPROVED','REJECTED']),note:z.string().trim().max(1000).default('')}).strict().refine(x=>x.decision!=='REJECTED'||x.note.length>0,{message:'Explain why the roster is being rejected.',path:['note']});
export async function requireAdmin(db:PrismaClient,identity:Identity){
 const staff=await db.staffUser.findUnique({where:{authSubject:identity.subject}});
 if(!staff?.enabled||staff.role!=='ADMIN') throw new AppError(403,'ADMIN_REQUIRED','Organizer access is required.');
 return staff;
}
export async function listRosters(db:PrismaClient,identity:Identity,status:'SUBMITTED'|'APPROVED'|'REJECTED',cursor?:string){
 await requireAdmin(db,identity);
 const records=await db.sportRoster.findMany({where:{team:{event:{slug:kalaSlug()}},status},select:{id:true,status:true,revision:true,submittedAt:true,reviewedAt:true,reviewNote:true,team:{select:{teamName:true,universityName:true,representative:{select:{name:true,email:true,phone:true}}}},competition:{select:{sportCode:true,minPlayers:true,maxPlayers:true}},members:{select:{participantKey:true,fullName:true,jerseyNumber:true,captain:true},orderBy:{participantKey:'asc'}}},orderBy:{id:'asc'},take:51,...(cursor?{cursor:{id:cursor},skip:1}:{})});
 const hasMore=records.length>50;const rosters=records.slice(0,50);
 return {rosters,nextCursor:hasMore?rosters.at(-1)!.id:null};
}
export async function reviewRoster(db:PrismaClient,identity:Identity,rosterId:string,input:z.infer<typeof reviewInput>){
 return db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;
  if(!staff.length) throw new AppError(403,'ADMIN_REQUIRED','Organizer access is required.');
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT r.id FROM "SportRoster" r JOIN "Event" e ON e.id=r."eventId" WHERE r.id=${rosterId}::uuid AND e.slug=${kalaSlug()} FOR UPDATE OF r`;
  if(!rows.length) throw new AppError(404,'ROSTER_NOT_FOUND','Roster not found.');
  const roster=await tx.sportRoster.findUniqueOrThrow({where:{id:rosterId}});
  if(roster.revision!==input.revision) throw new AppError(409,'STALE_REVISION','Another review changed this roster. Reload before reviewing.');
  if(roster.status!=='SUBMITTED') throw new AppError(409,'NOT_PENDING','Only submitted rosters can be reviewed.');
  const result=await tx.sportRoster.update({where:{id:rosterId},data:{status:input.decision,reviewNote:input.note||null,reviewedAt:new Date(),revision:{increment:1}},select:{id:true,status:true,revision:true,reviewNote:true,reviewedAt:true}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:`ROSTER_${input.decision}`,entityType:'SportRoster',entityId:rosterId,metadata:{fromStatus:'SUBMITTED',toStatus:input.decision,revision:result.revision}}});
  return result;
 },{maxWait:10000,timeout:15000});
}
