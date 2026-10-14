import {queueRosterNotification} from './notifications';
import {eligibilitySelection,membersFingerprint} from './eligibility';
import { type PrismaClient } from '@prisma/client';
import type { Identity } from './session';
import { AppError } from './errors';
import { kalaSlug } from './config';
import { z } from 'zod';
export const reviewInput=z.object({revision:z.number().int().positive(),decision:z.enum(['APPROVED','REJECTED']),note:z.string().trim().max(1000).default(''),eligibilityConfirmed:z.literal(true).optional()}).strict().refine(x=>x.decision!=='REJECTED'||x.note.length>0,{message:'Explain why the roster is being rejected.',path:['note']});
export async function requireAdmin(db:PrismaClient,identity:Identity){
 const staff=await db.staffUser.findUnique({where:{authSubject:identity.subject}});
 if(!staff?.enabled||staff.role!=='ADMIN') throw new AppError(403,'ADMIN_REQUIRED','Organizer access is required.');
 return staff;
}
export async function listRosters(db:PrismaClient,identity:Identity,status:'SUBMITTED'|'APPROVED'|'REJECTED',cursor?:string){
 await requireAdmin(db,identity);
 const records=await db.sportRoster.findMany({where:{team:{event:{slug:kalaSlug()}},status},select:{id:true,status:true,revision:true,submittedAt:true,reviewedAt:true,reviewNote:true,currentEligibility:{select:eligibilitySelection},team:{select:{teamName:true,universityName:true,representative:{select:{name:true,email:true,phone:true}}}},competition:{select:{sportCode:true,minPlayers:true,maxPlayers:true}},members:{select:{participantKey:true,fullName:true,jerseyNumber:true,captain:true},orderBy:{participantKey:'asc'}}},orderBy:{id:'asc'},take:51,...(cursor?{cursor:{id:cursor},skip:1}:{})});
 const hasMore=records.length>50;const rosters=records.slice(0,50);
 return {rosters,nextCursor:hasMore?rosters.at(-1)!.id:null};
}
export async function reviewRoster(db:PrismaClient,identity:Identity,rosterId:string,input:z.infer<typeof reviewInput>){
 return db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;
  if(!staff.length) throw new AppError(403,'ADMIN_REQUIRED','Organizer access is required.');
  // Tournament operations take the tournament lock before roster locks.
  const events=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Event" WHERE slug=${kalaSlug()} FOR SHARE`;
  const scoped=await tx.sportRoster.findFirst({where:{id:rosterId,eventId:events[0]?.id??'00000000-0000-0000-0000-000000000000'},select:{competitionId:true}});
  if(!scoped)throw new AppError(404,'ROSTER_NOT_FOUND','Roster not found.');
  const tournament=await tx.tournament.findUnique({where:{competitionId:scoped.competitionId},select:{id:true}});
  if(tournament)await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id=${tournament.id}::uuid FOR UPDATE`;
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT r.id FROM "SportRoster" r JOIN "Event" e ON e.id=r."eventId" WHERE r.id=${rosterId}::uuid AND e.slug=${kalaSlug()} FOR UPDATE OF r`;
  if(!rows.length) throw new AppError(404,'ROSTER_NOT_FOUND','Roster not found.');
  const roster=await tx.sportRoster.findUniqueOrThrow({where:{id:rosterId},include:{currentEligibility:true,members:true}});
  if(roster.revision!==input.revision) throw new AppError(409,'STALE_REVISION','Another review changed this roster. Reload before reviewing.');
  const approvalRevoked=roster.status==='APPROVED'&&input.decision==='REJECTED';
  if(input.decision==='REJECTED'&&!input.note.trim())throw new AppError(400,'REJECTION_REASON_REQUIRED','Explain why the roster is being rejected.');
  if(roster.status!=='SUBMITTED'&&!approvalRevoked) throw new AppError(409,'NOT_PENDING','Only submitted rosters can be reviewed.');
  if(roster.currentEligibility&&!approvalRevoked){
   if(roster.currentEligibility.decision!=='PENDING'||roster.currentEligibility.membersHash!==membersFingerprint(roster.members))throw new AppError(409,'ELIGIBILITY_MISMATCH','Eligibility declaration does not match this submitted roster.');
   if(input.decision==='APPROVED'&&!input.eligibilityConfirmed)throw new AppError(400,'ELIGIBILITY_REVIEW_REQUIRED','Confirm that you checked the captured eligibility requirements and evidence before approving.');
   await tx.eligibilitySubmission.update({where:{id:roster.currentEligibility.id},data:{decision:input.decision,reviewedBy:staff[0].id,reviewedAt:new Date(),reviewNote:input.note||null}});
  }
  const result=await tx.sportRoster.update({where:{id:rosterId},data:{status:input.decision,reviewNote:input.note||null,reviewedAt:new Date(),revision:{increment:1}},select:{id:true,status:true,revision:true,reviewNote:true,reviewedAt:true}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:approvalRevoked?'ROSTER_APPROVAL_REVOKED':`ROSTER_${input.decision}`,entityType:'SportRoster',entityId:rosterId,metadata:{fromStatus:roster.status,reason:input.note||null,toStatus:input.decision,revision:result.revision,eligibilitySubmissionId:roster.currentEligibilityId,eligibilityReviewed:!!roster.currentEligibility&&!approvalRevoked}}});
  if(approvalRevoked&&tournament&&await tx.tournamentEntry.count({where:{tournamentId:tournament.id,rosterId}})){
   const previous=await tx.tournament.findUniqueOrThrow({where:{id:tournament.id}});
   await tx.tournament.update({where:{id:tournament.id},data:{published:false,revision:{increment:1}}});
   await tx.auditLog.create({data:{actorId:staff[0].id,action:'TOURNAMENT_ENTRY_REVIEW_HOLD',entityType:'Tournament',entityId:tournament.id,metadata:{rosterId,reason:input.note,previouslyPublished:previous.published}}});
  }
  await queueRosterNotification(tx,rosterId,result.revision,input.decision,input.note);
  return result;
 },{maxWait:10000,timeout:15000});
}
