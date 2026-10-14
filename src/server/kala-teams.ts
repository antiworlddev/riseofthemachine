import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import type {Identity} from './session';
import {kalaSlug,requireRegistrationOpen} from './config';
import {AppError} from './errors';
import {requireAdmin} from './admin';
import {rosterSelection} from './registration';
import {teamInput} from './validation';
const options={maxWait:10000,timeout:15000};
export const representativeInput=teamInput.shape.representative;
export const addSportsInput=z.object({revision:z.number().int().positive(),sportCodes:teamInput.shape.sportCodes}).strict();
export const lookupInput=z.object({email:z.email().trim().max(254)}).strict();
export const transferInput=z.object({teamId:z.uuid(),revision:z.number().int().positive(),currentRepresentativeId:z.uuid(),newRepresentativeId:z.uuid(),newEmail:z.email().max(254),reason:z.string().trim().min(5).max(500),confirmed:z.literal(true)}).strict();
export async function representativeProfile(db:PrismaClient,identity:Identity){return db.representative.findUnique({where:{authSubject:identity.subject},select:{name:true,email:true,phone:true}});}
export async function saveRepresentativeProfile(db:PrismaClient,identity:Identity,input:z.infer<typeof representativeInput>){
 try{return await db.representative.upsert({where:{authSubject:identity.subject},create:{authSubject:identity.subject,email:identity.email.toLowerCase(),...input,verifiedAt:new Date()},update:{email:identity.email.toLowerCase(),...input,verifiedAt:new Date()},select:{name:true,email:true,phone:true}});}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')throw new AppError(409,'PROFILE_CONFLICT','That verified email is already linked to another representative account. Contact the organizer.');throw e;}
}
export async function addTeamSports(db:PrismaClient,identity:Identity,teamId:string,input:z.infer<typeof addSportsInput>){
 requireRegistrationOpen();
 return db.$transaction(async tx=>{
  const events=await tx.$queryRaw<{id:string;registrationEnabled:boolean}[]>`SELECT id,"registrationEnabled" FROM "Event" WHERE slug=${kalaSlug()} FOR SHARE`;
  const event=events[0];if(!event?.registrationEnabled)throw new AppError(403,'REGISTRATION_CLOSED','KALA GAMES registration is currently closed.');
  await tx.$queryRaw`SELECT id FROM "TeamRegistration" WHERE id=${teamId}::uuid FOR UPDATE`;
  const team=await tx.teamRegistration.findFirst({where:{id:teamId,eventId:event.id,representative:{authSubject:identity.subject}},include:{option:true,rosters:{select:{competition:{select:{sportCode:true}}}}}});
  if(!team)throw new AppError(404,'TEAM_NOT_FOUND','Team not found.');
  if(team.ownershipRevision!==input.revision)throw new AppError(409,'STALE_REVISION','Team changed. Reload before adding sports.');
  await tx.$queryRaw`SELECT id FROM "TeamOption" WHERE id=${team.option.id}::uuid FOR UPDATE`;
  if(!(await tx.teamOption.findUniqueOrThrow({where:{id:team.option.id}})).enabled)throw new AppError(403,'TEAM_CLOSED','Registration for this team is closed.');
  if(input.sportCodes.some(code=>team.rosters.some(r=>r.competition.sportCode===code)))throw new AppError(409,'SPORT_ALREADY_ADDED','One of these sports already has a roster. Reload your team.');
  await tx.$queryRaw`SELECT id FROM "Competition" WHERE "eventId"=${event.id}::uuid AND "sportCode" IN (${Prisma.join(input.sportCodes)}) ORDER BY id FOR UPDATE`;
  const competitions=await tx.competition.findMany({where:{eventId:event.id,sportCode:{in:input.sportCodes},registrationEnabled:true}});
  if(competitions.length!==input.sportCodes.length)throw new AppError(403,'SPORT_CLOSED','Choose sports that are open for registration.');
  await tx.sportRoster.createMany({data:competitions.map(c=>({teamId:team.id,eventId:event.id,competitionId:c.id}))});
  await tx.teamRegistration.update({where:{id:team.id},data:{ownershipRevision:{increment:1}}});
  await tx.auditLog.create({data:{action:'TEAM_SPORTS_ADDED',entityType:'TeamRegistration',entityId:team.id,metadata:{representativeId:team.representativeId,sportCodes:input.sportCodes,newRevision:team.ownershipRevision+1}}});
  return tx.teamRegistration.findUniqueOrThrow({where:{id:team.id},select:{id:true,ownershipRevision:true,teamName:true,rosters:{select:rosterSelection}}});
 },options);
}
export async function lookupRepresentative(db:PrismaClient,identity:Identity,email:string){
 await requireAdmin(db,identity);
 const matches=await db.$queryRaw<{id:string;name:string;email:string;verifiedAt:Date|null}[]>`SELECT id,name,email,"verifiedAt" FROM "Representative" WHERE lower(email)=lower(${email.trim()}) LIMIT 2`;
 const p=matches.length===1?matches[0]:null;
 if(!p?.verifiedAt)throw new AppError(404,'REPRESENTATIVE_NOT_FOUND','This person must sign in and save their KALA representative profile first, with a unique verified account.');
 return {id:p.id,name:p.name,email:p.email};
}
export async function transferTeam(db:PrismaClient,identity:Identity,input:z.infer<typeof transferInput>){
 return db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;
  if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access required.');
  const events=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Event" WHERE slug=${kalaSlug()} FOR SHARE`;
  if(!events.length)throw new AppError(503,'EVENT_NOT_CONFIGURED','KALA GAMES is not configured.');
  await tx.$queryRaw`SELECT id FROM "TeamRegistration" WHERE id=${input.teamId}::uuid FOR UPDATE`;
  const team=await tx.teamRegistration.findUnique({where:{id:input.teamId},include:{representative:true}});
  if(!team||team.eventId!==events[0].id)throw new AppError(404,'TEAM_NOT_FOUND','Team not found.');
  if(team.ownershipRevision!==input.revision||team.representativeId!==input.currentRepresentativeId)throw new AppError(409,'STALE_REVISION','Team ownership changed. Reload before transferring.');
  if(team.representativeId===input.newRepresentativeId)throw new AppError(400,'SAME_REPRESENTATIVE','This person already represents the team.');
  await tx.$queryRaw`SELECT id FROM "Representative" WHERE id=${input.newRepresentativeId}::uuid FOR SHARE`;
  const target=await tx.representative.findUnique({where:{id:input.newRepresentativeId}});
  if(!target?.verifiedAt||target.email.toLowerCase()!==input.newEmail.toLowerCase())throw new AppError(409,'TARGET_CHANGED','The verified representative changed. Look them up again.');
  await tx.$queryRaw`SELECT id FROM "SportRoster" WHERE "teamId"=${team.id}::uuid ORDER BY id FOR UPDATE`;
  await tx.sportRoster.updateMany({where:{teamId:team.id},data:{revision:{increment:1}}});
  const updated=await tx.teamRegistration.update({where:{id:team.id},data:{representativeId:target.id,ownershipRevision:{increment:1}},select:{id:true,ownershipRevision:true}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'TEAM_REPRESENTATIVE_TRANSFERRED',entityType:'TeamRegistration',entityId:team.id,metadata:{fromId:team.representativeId,fromName:team.representative.name,fromEmail:team.representative.email,toId:target.id,toName:target.name,toEmail:target.email,reason:input.reason,newRevision:updated.ownershipRevision}}});return updated;
 },options);
}
export async function organizerTeams(db:PrismaClient,identity:Identity,before?:string){
 await requireAdmin(db,identity);
 const found=await db.teamRegistration.findMany({where:{event:{slug:kalaSlug()},...(before?{id:{gt:before}}:{})},orderBy:{id:'asc'},take:51,select:{id:true,teamName:true,ownershipRevision:true,representative:{select:{id:true,name:true,email:true}},rosters:{select:{id:true,status:true,competition:{select:{sportCode:true}}}}}});
 const teams=found.slice(0,50),history=await db.auditLog.findMany({where:{entityType:'TeamRegistration',entityId:{in:teams.map(t=>t.id)},action:'TEAM_REPRESENTATIVE_TRANSFERRED'},orderBy:{createdAt:'desc'},take:100,select:{entityId:true,metadata:true,createdAt:true,actor:{select:{email:true}}}});
 return {teams,history,nextCursor:found.length>50?teams[49].id:null};
}
