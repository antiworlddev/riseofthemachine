import { type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { Identity } from './session';
import { requireAdmin } from './admin';
import { kalaSlug,registrationOpen } from './config';
import { AppError } from './errors';

const revision=z.number().int().positive();
const code=z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60);
const name=z.string().trim().min(2).max(120);
export const settingsInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('registration'),revision,enabled:z.boolean()}).strict(),
 z.object({action:z.literal('team'),revision,id:z.uuid().optional(),key:code,name,universityName:z.string().trim().max(120).nullable(),enabled:z.boolean()}).strict(),
 z.object({action:z.literal('sport'),revision,id:z.uuid().optional(),sportCode:code,minPlayers:z.number().int().min(1).max(100),maxPlayers:z.number().int().min(1).max(100),enabled:z.boolean()}).strict(),
]).refine(v=>v.action!=='sport'||v.minPlayers<=v.maxPlayers,{message:'Minimum players must not exceed maximum players.'});

export async function getSettings(db:PrismaClient,identity:Identity){
 await requireAdmin(db,identity);
 const event=await db.event.findUnique({where:{slug:kalaSlug()},select:{id:true,name:true,registrationEnabled:true,settingsRevision:true,teamOptions:{include:{_count:{select:{registrations:true}}},orderBy:{name:'asc'}},competitions:{orderBy:{sportCode:'asc'}}}});
 if(!event)throw new AppError(503,'EVENT_NOT_CONFIGURED','KALA GAMES is not configured.');
 return {event,environmentEnabled:registrationOpen()};
}

export async function updateSettings(db:PrismaClient,identity:Identity,input:z.infer<typeof settingsInput>){
 return db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;
  if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access is required.');
  const events=await tx.$queryRaw<{id:string;settingsRevision:number}[]>`SELECT id,"settingsRevision" FROM "Event" WHERE slug=${kalaSlug()} FOR UPDATE`;
  const event=events[0];if(!event)throw new AppError(503,'EVENT_NOT_CONFIGURED','KALA GAMES is not configured.');
  if(event.settingsRevision!==input.revision)throw new AppError(409,'STALE_REVISION','Settings changed. Reload before saving.');
  let entityId=event.id;
  if(input.action==='registration'){
   if(input.enabled){
    if(!registrationOpen())throw new AppError(403,'ENVIRONMENT_CLOSED','Set KALA_REGISTRATION_ENABLED=true in your app environment before opening registration.');
    const teams=await tx.teamOption.count({where:{eventId:event.id,enabled:true}});
    const sports=await tx.competition.findMany({where:{eventId:event.id,registrationEnabled:true}});
    if(!teams||!sports.length||sports.some(s=>s.minPlayers===null||s.maxPlayers===null))throw new AppError(400,'SETUP_REQUIRED','Enable at least one team and one sport with player limits before opening registration.');
   }
   await tx.event.update({where:{id:event.id},data:{registrationEnabled:input.enabled}});
  }else if(input.action==='team'){
   const data={name:input.name,universityName:input.universityName||null,enabled:input.enabled};
   if(input.id){
    const team=await tx.teamOption.findFirst({where:{id:input.id,eventId:event.id},include:{_count:{select:{registrations:true}}}});
    if(!team)throw new AppError(404,'TEAM_NOT_FOUND','Team not found.');
    if(team.key!==input.key)throw new AppError(400,'IMMUTABLE_KEY','Existing team keys cannot be changed.');
    if(team._count.registrations&&(team.name!==data.name||team.universityName!==data.universityName))throw new AppError(409,'TEAM_IN_USE','This team already has a registration. Its name and university cannot be changed.');
    await tx.teamOption.update({where:{id:team.id},data});entityId=team.id;
   }else{
    if(await tx.teamOption.findUnique({where:{eventId_key:{eventId:event.id,key:input.key}}}))throw new AppError(409,'ALREADY_EXISTS','A team with this key already exists.');
    entityId=(await tx.teamOption.create({data:{eventId:event.id,key:input.key,...data}})).id;
   }
  }else{
   const data={minPlayers:input.minPlayers,maxPlayers:input.maxPlayers,registrationEnabled:input.enabled};
   if(input.id){
    const sport=await tx.competition.findFirst({where:{id:input.id,eventId:event.id}});
    if(!sport)throw new AppError(404,'SPORT_NOT_FOUND','Sport not found.');
    if(sport.sportCode!==input.sportCode)throw new AppError(400,'IMMUTABLE_CODE','Existing sport codes cannot be changed.');
    const lockedRosters=await tx.sportRoster.findMany({where:{competitionId:sport.id,status:{in:['SUBMITTED','APPROVED']}},select:{_count:{select:{members:true}}}});
    if(lockedRosters.some(r=>r._count.members<input.minPlayers||r._count.members>input.maxPlayers))throw new AppError(409,'ROSTERS_IN_USE','These limits would invalidate a submitted or approved roster. Review those rosters before changing limits.');
    await tx.competition.update({where:{id:sport.id},data});entityId=sport.id;
   }else{
    if(await tx.competition.findUnique({where:{eventId_sportCode:{eventId:event.id,sportCode:input.sportCode}}}))throw new AppError(409,'ALREADY_EXISTS','A sport with this code already exists.');
    entityId=(await tx.competition.create({data:{eventId:event.id,sportCode:input.sportCode,...data}})).id;
   }
  }
  const updated=await tx.event.update({where:{id:event.id},data:{settingsRevision:{increment:1}},select:{settingsRevision:true}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'KALA_SETTINGS_UPDATED',entityType:input.action==='team'?'TeamOption':input.action==='sport'?'Competition':'Event',entityId,metadata:{...input,settingsRevision:updated.settingsRevision}}});
  return updated;
 },{maxWait:10000,timeout:15000});
}
