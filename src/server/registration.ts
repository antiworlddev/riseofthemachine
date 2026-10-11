import { Prisma, type PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import type { Identity } from './session';
import { kalaSlug, requireRegistrationOpen } from './config';
import { AppError } from './errors';
import { rosterInput, teamInput } from './validation';
async function lockRegistrationEvent(tx:Prisma.TransactionClient) {
 const events=await tx.$queryRaw<{id:string;registrationEnabled:boolean}[]>`SELECT id,"registrationEnabled" FROM "Event" WHERE slug=${kalaSlug()} FOR SHARE`;
 if(!events[0]?.registrationEnabled) throw new AppError(403,'REGISTRATION_CLOSED','KALA GAMES registration is currently closed.');
}
const rosterSelection = { id:true,status:true,revision:true,reviewNote:true,reviewedAt:true,competition:{select:{sportCode:true,minPlayers:true,maxPlayers:true}},members:{select:{participantKey:true,fullName:true,jerseyNumber:true,captain:true},orderBy:{participantKey:'asc' as const}} };
export async function catalog(db: PrismaClient) {
 const event=await db.event.findUnique({where:{slug:kalaSlug()},select:{id:true,name:true,dateLocal:true,registrationEnabled:true,teamOptions:{where:{enabled:true},select:{id:true,name:true},orderBy:{name:'asc'}},competitions:{where:{registrationEnabled:true},select:{sportCode:true,minPlayers:true,maxPlayers:true},orderBy:{sportCode:'asc'}}}});
 if(!event) throw new AppError(503,'EVENT_NOT_CONFIGURED','KALA GAMES registration is not available yet.');
 return event;
}
export async function myTeams(db: PrismaClient,identity: Identity) {
 return db.teamRegistration.findMany({where:{event:{slug:kalaSlug()},representative:{authSubject:identity.subject}},select:{id:true,teamName:true,universityName:true,rosters:{select:rosterSelection}},orderBy:{createdAt:'asc'}});
}
export async function createTeam(db: PrismaClient,identity: Identity,input: z.infer<typeof teamInput>) {
 requireRegistrationOpen();
 return db.$transaction(async tx=>{
  await lockRegistrationEvent(tx);
  const option=await tx.teamOption.findUnique({where:{id:input.teamOptionId},include:{event:true}});
  if(!option || option.event.slug!==kalaSlug() || !option.enabled) throw new AppError(400,'INVALID_TEAM','Choose an available team.');
  // Lock organizer settings so closing an option cannot race this creation.
  await tx.$queryRaw`SELECT id FROM "TeamOption" WHERE id=${option.id}::uuid FOR UPDATE`;
  const current=await tx.teamOption.findUniqueOrThrow({where:{id:option.id}});
  if(!current.enabled) throw new AppError(403,'TEAM_CLOSED','Registration for this team is closed.');
  await tx.$queryRaw`SELECT id FROM "Competition" WHERE "eventId"=${option.eventId}::uuid AND "sportCode" IN (${Prisma.join(input.sportCodes)}) ORDER BY id FOR UPDATE`;
  const competitions=await tx.competition.findMany({where:{eventId:option.eventId,sportCode:{in:input.sportCodes},registrationEnabled:true}});
  if(competitions.length!==input.sportCodes.length) throw new AppError(403,'SPORT_CLOSED','Choose sports that are open for registration.');
  const representative=await tx.representative.upsert({where:{authSubject:identity.subject},create:{authSubject:identity.subject,email:identity.email,...input.representative,verifiedAt:new Date()},update:{email:identity.email,...input.representative,verifiedAt:new Date()}});
  const created=await tx.teamRegistration.create({data:{eventId:current.eventId,representativeId:representative.id,teamKey:current.key,teamName:current.name,universityName:current.universityName}});
  await tx.sportRoster.createMany({data:competitions.map(c=>({teamId:created.id,eventId:current.eventId,competitionId:c.id}))});
  const team=await tx.teamRegistration.findUniqueOrThrow({where:{id:created.id},select:{id:true,teamName:true,rosters:{select:rosterSelection}}});
  await tx.auditLog.create({data:{action:'TEAM_CREATED',entityType:'TeamRegistration',entityId:team.id,metadata:{representativeId:representative.id}}});
  return team;
 });
}
async function lockOwnedRoster(tx: Prisma.TransactionClient,identity: Identity,rosterId: string,revision: number) {
 await lockRegistrationEvent(tx);
 const rows=await tx.$queryRaw<{id:string}[]>`SELECT r.id FROM "SportRoster" r JOIN "TeamRegistration" t ON t.id=r."teamId" JOIN "Representative" p ON p.id=t."representativeId" JOIN "Event" e ON e.id=t."eventId" WHERE r.id=${rosterId}::uuid AND p."authSubject"=${identity.subject} AND e.slug=${kalaSlug()} FOR UPDATE OF r`;
 if(!rows.length) throw new AppError(404,'ROSTER_NOT_FOUND','Roster not found.');
 const roster=await tx.sportRoster.findUniqueOrThrow({where:{id:rosterId},include:{competition:true,team:{include:{option:true}},members:true}});
 if(roster.revision!==revision) throw new AppError(409,'STALE_REVISION','This roster changed. Reload it before saving.');
 if(roster.status!=='DRAFT' && roster.status!=='REJECTED') throw new AppError(409,'ROSTER_LOCKED','Only draft or rejected rosters can be edited.');
 // Same lock order for all mutations: roster (if existing), option, then competition.
 await tx.$queryRaw`SELECT id FROM "TeamOption" WHERE id=${roster.team.option.id}::uuid FOR UPDATE`;
 await tx.$queryRaw`SELECT id FROM "Competition" WHERE id=${roster.competitionId}::uuid FOR UPDATE`;
 const competition=await tx.competition.findUniqueOrThrow({where:{id:roster.competitionId}});
 const option=await tx.teamOption.findUniqueOrThrow({where:{id:roster.team.option.id}});
 if(!competition.registrationEnabled || !option.enabled) throw new AppError(403,'REGISTRATION_CLOSED','Registration for this team or sport is closed.');
 return {...roster,competition};
}
export async function saveRoster(db: PrismaClient,identity: Identity,rosterId: string,input: z.infer<typeof rosterInput>) {
 requireRegistrationOpen();
 return db.$transaction(async tx=>{
  const roster=await lockOwnedRoster(tx,identity,rosterId,input.revision);
  if(roster.competition.maxPlayers!==null && input.members.length>roster.competition.maxPlayers) throw new AppError(400,'TOO_MANY_PLAYERS','This roster exceeds the allowed player count.');
  await tx.rosterMember.deleteMany({where:{rosterId}});
  if(input.members.length) await tx.rosterMember.createMany({data:input.members.map(member=>({...member,rosterId}))});
  const updated=await tx.sportRoster.update({where:{id:rosterId},data:{revision:{increment:1}},select:rosterSelection});
  await tx.auditLog.create({data:{action:'ROSTER_SAVED',entityType:'SportRoster',entityId:rosterId,metadata:{representativeId:roster.team.representativeId,revision:updated.revision,fromStatus:roster.status}}});
  return updated;
 });
}
export async function submitRoster(db: PrismaClient,identity: Identity,rosterId: string,revision: number) {
 requireRegistrationOpen();
 return db.$transaction(async tx=>{
  const roster=await lockOwnedRoster(tx,identity,rosterId,revision);
  const count=roster.members.length,min=roster.competition.minPlayers??1,max=roster.competition.maxPlayers??100;
  if(count<min || count>max) throw new AppError(400,'ROSTER_SIZE','Check the required player count before submitting.');
  const updated=await tx.sportRoster.update({where:{id:rosterId},data:{status:'SUBMITTED',submittedAt:new Date(),revision:{increment:1}},select:rosterSelection});
  await tx.auditLog.create({data:{action:roster.status==='REJECTED'?'ROSTER_RESUBMITTED':'ROSTER_SUBMITTED',entityType:'SportRoster',entityId:rosterId,metadata:{representativeId:roster.team.representativeId,revision:updated.revision,fromStatus:roster.status}}});
  return updated;
 });
}
