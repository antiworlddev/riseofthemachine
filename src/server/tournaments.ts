import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {AppError} from './errors';
import {requireAdmin} from './admin';
import {kalaSlug} from './config';
import type {Identity} from './session';
import {buildDraw,shuffled,standings,leagueRules} from './tournament-rules';
const text=(min:number,max:number)=>z.string().trim().max(max).refine(v=>Array.from(v).length>=min,`Enter at least ${min} characters.`);
const uuid=z.uuid().transform(v=>v.toLowerCase());
const revision=z.number().int().positive(),reason=z.string().trim().min(5).max(500),score=z.number().int().min(0).max(100000);
const configuration=z.discriminatedUnion('format',[z.object({format:z.literal('ROUND_ROBIN'),scoreLabel:text(2,40),rules:leagueRules}).strict(),z.object({format:z.literal('KNOCKOUT'),scoreLabel:text(2,40)}).strict()]);
export const tournamentInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('CONFIGURE'),competitionId:uuid,revision:revision.nullable(),configuration}).strict(),
 z.object({action:z.literal('DRAW'),tournamentId:uuid,revision,rosterIds:z.array(uuid).min(2).max(32).refine(v=>new Set(v).size===v.length,'Duplicate draw entry.'),confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('PUBLISH'),tournamentId:uuid,revision,published:z.boolean(),confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('RESET_DRAW'),tournamentId:uuid,revision,reason,confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('SCHEDULE'),tournamentId:uuid,fixtureId:uuid,revision,startsAt:z.iso.datetime({offset:true}).nullable(),venue:text(2,120).nullable(),reason}).strict(),
 z.object({action:z.literal('RESULT'),tournamentId:uuid,fixtureId:uuid,revision,homeScore:score,awayScore:score,deciderSide:z.enum(['HOME','AWAY']).optional(),deciderNote:text(5,300).optional(),reason,confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('CLEAR_RESULT'),tournamentId:uuid,fixtureId:uuid,revision,reason,confirmed:z.literal(true)}).strict()
]);
const fixtureSelection={id:true,round:true,slot:true,homeRosterId:true,awayRosterId:true,winnerRosterId:true,status:true,homeScore:true,awayScore:true,deciderNote:true,startsAt:true,venue:true,revision:true,nextFixtureId:true,nextSide:true} as const;
const tournamentSelection={id:true,competitionId:true,format:true,scoreLabel:true,rules:true,published:true,revision:true,drawnAt:true,entries:{select:{rosterId:true,teamName:true,drawPosition:true},orderBy:{drawPosition:'asc' as const}},fixtures:{select:fixtureSelection,orderBy:[{round:'asc'},{slot:'asc'}]}} satisfies Prisma.TournamentSelect;
function withStandings<T extends {format:string;rules:Prisma.JsonValue;entries:{rosterId:string;teamName:string}[];fixtures:Parameters<typeof standings>[1]}>(t:T){return {...t,standings:t.format==='ROUND_ROBIN'?standings(t.entries,t.fixtures,leagueRules.parse(t.rules)):[]};}
export async function tournamentOverview(db:PrismaClient,identity:Identity,competitionId?:string){
 await requireAdmin(db,identity);competitionId=competitionId?.toLowerCase();
 const competitions=await db.competition.findMany({where:{event:{slug:kalaSlug()}},select:{id:true,sportCode:true},orderBy:{sportCode:'asc'}}),selected=competitionId?competitions.find(c=>c.id===competitionId):competitions[0];
 if(competitionId&&!selected)throw new AppError(404,'SPORT_NOT_FOUND','Sport not found.');
 if(!selected)return {competitions,selected:null,tournament:null,approvedRosters:[]};
 const [t,approvedRosters]=await Promise.all([db.tournament.findUnique({where:{competitionId:selected.id},select:tournamentSelection}),db.sportRoster.findMany({where:{competitionId:selected.id,status:'APPROVED'},select:{id:true,team:{select:{teamName:true}}},orderBy:{id:'asc'}})]);
 const ineligibleEntries=t?await db.tournamentEntry.findMany({where:{tournamentId:t.id,roster:{status:{not:'APPROVED'}}},select:{rosterId:true,teamName:true,roster:{select:{status:true}}}}):[];
 return {competitions,selected,ineligibleEntries,tournament:t?withStandings(t):null,approvedRosters:approvedRosters.map(r=>({id:r.id,teamName:r.team.teamName}))};
}
export async function publishedTournaments(db:PrismaClient){
 return db.$transaction(async tx=>{
 const tournaments=await tx.tournament.findMany({where:{published:true,competition:{event:{slug:kalaSlug()}}},select:{...tournamentSelection,competition:{select:{sportCode:true}}},orderBy:{competition:{sportCode:'asc'}}});
 return tournaments.map(t=>{const {revision,competitionId,...publicTournament}=withStandings(t);return {...publicTournament,fixtures:t.fixtures.map(({revision,...fixture})=>fixture)};});
 },{isolationLevel:'RepeatableRead',maxWait:10000,timeout:15000});
}
async function lockStaff(tx:Prisma.TransactionClient,identity:Identity){const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access required.');return staff[0].id;}
export async function operateTournament(db:PrismaClient,identity:Identity,input:z.infer<typeof tournamentInput>){
 return db.$transaction(async tx=>{
  const actorId=await lockStaff(tx,identity);
  const events=input.action==='CONFIGURE'?await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Event" WHERE slug=${kalaSlug()} FOR UPDATE`:await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Event" WHERE slug=${kalaSlug()} FOR SHARE`;
  if(!events.length)throw new AppError(503,'EVENT_NOT_CONFIGURED','KALA GAMES is not configured.');
  if(input.action==='CONFIGURE'){
   await tx.$queryRaw`SELECT id FROM "Competition" WHERE id=${input.competitionId}::uuid FOR UPDATE`;
   const c=await tx.competition.findUnique({where:{id:input.competitionId}});if(!c||c.eventId!==events[0].id)throw new AppError(404,'SPORT_NOT_FOUND','Sport not found.');
   const previous=await tx.tournament.findUnique({where:{competitionId:c.id}});
   if(previous&&(previous.revision!==input.revision||previous.drawnAt)||!previous&&input.revision!==null)throw new AppError(409,previous?.drawnAt?'DRAW_LOCKED':'STALE_REVISION','Reset an unpublished, unplayed draw before changing rules, or reload changed settings.');
   const configuration=input.configuration,data={format:configuration.format,scoreLabel:configuration.scoreLabel,rules:configuration.format==='ROUND_ROBIN'?configuration.rules:Prisma.DbNull};
   const result=previous?await tx.tournament.update({where:{id:previous.id},data:{...data,revision:{increment:1}}}):await tx.tournament.create({data:{competitionId:c.id,...data}});
   await tx.auditLog.create({data:{actorId,action:'TOURNAMENT_CONFIGURED',entityType:'Tournament',entityId:result.id,metadata:{configuration,newRevision:result.revision}}});return {id:result.id,revision:result.revision};
  }
  await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id=${input.tournamentId}::uuid FOR UPDATE`;
  const t=await tx.tournament.findUnique({where:{id:input.tournamentId},include:{competition:true,entries:true,fixtures:true}});
  if(!t||t.competition.eventId!==events[0].id)throw new AppError(404,'TOURNAMENT_NOT_FOUND','Tournament not found.');
  if((input.action==='RESULT'||input.action==='PUBLISH'&&input.published)&&await tx.tournamentEntry.count({where:{tournamentId:t.id,roster:{status:{not:'APPROVED'}}}}))throw new AppError(409,'ENTRIES_NEED_REVIEW','A draw entry is no longer approved. Resolve roster review before publishing or confirming results.');
  const fixtureAction=['SCHEDULE','RESULT','CLEAR_RESULT'].includes(input.action);
  if(!fixtureAction&&t.revision!==input.revision)throw new AppError(409,'STALE_REVISION','Tournament changed. Reload.');
  let metadata:Prisma.InputJsonObject={action:input.action};
  if(input.action==='DRAW'){
   if(t.drawnAt||t.entries.length||t.fixtures.length)throw new AppError(409,'DRAW_EXISTS','A draw already exists.');
   await tx.$queryRaw`SELECT id FROM "SportRoster" WHERE id IN (${Prisma.join(input.rosterIds.map(id=>Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`;
   const rosters=await tx.sportRoster.findMany({where:{id:{in:input.rosterIds},competitionId:t.competitionId,status:'APPROVED'},include:{team:true}});
   if(rosters.length!==input.rosterIds.length)throw new AppError(400,'INVALID_ENTRY','Choose approved rosters for this sport only.');
   const order=shuffled(rosters),fixtures=buildDraw(t.format as 'ROUND_ROBIN'|'KNOCKOUT',order.map(r=>r.id));
   await tx.tournamentEntry.createMany({data:order.map((r,i)=>({tournamentId:t.id,rosterId:r.id,teamName:r.team.teamName,drawPosition:i+1}))});
   await tx.fixture.createMany({data:fixtures.sort((a,b)=>b.round-a.round).map(f=>({...f,tournamentId:t.id}))});
   await tx.tournament.update({where:{id:t.id},data:{drawnAt:new Date()}});metadata={...metadata,order:order.map(r=>({rosterId:r.id,teamName:r.team.teamName})),fixtures:fixtures.map(f=>({...f}))};
  }else if(input.action==='PUBLISH'){
   if(input.published&&(!t.drawnAt||t.entries.length<2||!t.fixtures.length))throw new AppError(400,'DRAW_REQUIRED','Generate a draw before publishing.');
   await tx.tournament.update({where:{id:t.id},data:{published:input.published}});metadata={...metadata,published:input.published};
  }else if(input.action==='RESET_DRAW'){
   if(t.published||t.fixtures.some(f=>f.status==='FINAL'))throw new AppError(409,'DRAW_IN_USE','Only unpublished draws with no entered results can be reset.');
   await tx.fixture.updateMany({where:{tournamentId:t.id},data:{nextFixtureId:null,nextSide:null}});
   await tx.fixture.deleteMany({where:{tournamentId:t.id}});await tx.tournamentEntry.deleteMany({where:{tournamentId:t.id}});await tx.tournament.update({where:{id:t.id},data:{drawnAt:null}});metadata={...metadata,reason:input.reason};
  }else{
   await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id=${input.fixtureId}::uuid FOR UPDATE`;
   const match=t.fixtures.find(f=>f.id===input.fixtureId);if(!match)throw new AppError(404,'FIXTURE_NOT_FOUND','Fixture not found.');
   if(match.revision!==input.revision)throw new AppError(409,'STALE_REVISION','Fixture changed. Reload.');
   if(match.status==='BYE')throw new AppError(409,'BYE_LOCKED','A draw bye is not a played fixture.');
   if(input.action==='SCHEDULE'){
    if(match.status==='FINAL')throw new AppError(409,'RESULT_EXISTS','Clear the result before changing its schedule.');
    await tx.fixture.update({where:{id:match.id},data:{startsAt:input.startsAt?new Date(input.startsAt):null,venue:input.venue,revision:{increment:1}}});metadata={...metadata,fixtureId:match.id,reason:input.reason,startsAt:input.startsAt,venue:input.venue};
   }else{
    if(input.action==='CLEAR_RESULT'&&match.status!=='FINAL')throw new AppError(409,'NO_RESULT','No result exists to clear.');
    if(input.action==='RESULT'&&(!match.homeRosterId||!match.awayRosterId))throw new AppError(409,'PARTICIPANTS_PENDING','Both qualifying teams must be known before entering a result.');
    let winner:string|null=null,deciderNote:string|null=null;
    if(input.action==='RESULT'){
     if(input.homeScore!==input.awayScore){if(input.deciderSide||input.deciderNote)throw new AppError(400,'DECIDER_NOT_APPLICABLE','Deciders apply only to tied knockout scores.');winner=input.homeScore>input.awayScore?match.homeRosterId:match.awayRosterId;}
     else if(t.format==='ROUND_ROBIN'){if(input.deciderSide||input.deciderNote)throw new AppError(400,'DECIDER_NOT_APPLICABLE','League draws do not have a qualifying-side decider.');if(!leagueRules.parse(t.rules).allowDraws)throw new AppError(400,'DRAW_NOT_ALLOWED','These rules do not permit drawn results.');}
     else {if(!input.deciderSide||!input.deciderNote)throw new AppError(400,'DECIDER_REQUIRED','Select the qualifying team and explain the tied-score decider.');winner=input.deciderSide==='HOME'?match.homeRosterId:match.awayRosterId;deciderNote=input.deciderNote;}
    }
    if(winner!==match.winnerRosterId){
     const path=[];let childId=match.nextFixtureId;while(childId){const child=t.fixtures.find(f=>f.id===childId)!;path.push(child);childId=child.nextFixtureId;}
     if(path.some(f=>f.status==='FINAL'))throw new AppError(409,'DOWNSTREAM_RESULT_EXISTS','Clear later-round results first before changing a qualifying winner.');
     let parent=match;for(const child of path){await tx.fixture.update({where:{id:child.id},data:{...(parent.nextSide==='HOME'?{homeRosterId:parent.id===match.id?winner:null}:{awayRosterId:parent.id===match.id?winner:null}),revision:{increment:1}}});parent=child;}
    }
    await tx.fixture.update({where:{id:match.id},data:{status:input.action==='RESULT'?'FINAL':'SCHEDULED',homeScore:input.action==='RESULT'?input.homeScore:null,awayScore:input.action==='RESULT'?input.awayScore:null,winnerRosterId:winner,deciderNote,revision:{increment:1}}});
    metadata={...metadata,fixtureId:match.id,reason:input.reason,before:{homeScore:match.homeScore,awayScore:match.awayScore,winnerRosterId:match.winnerRosterId},after:{homeScore:input.action==='RESULT'?input.homeScore:null,awayScore:input.action==='RESULT'?input.awayScore:null,winnerRosterId:winner,deciderNote}};
   }
  }
  const updated=await tx.tournament.update({where:{id:t.id},data:{revision:{increment:1}},select:{revision:true}});
  await tx.auditLog.create({data:{actorId,action:`TOURNAMENT_${input.action}`,entityType:'Tournament',entityId:t.id,metadata:{...metadata,newRevision:updated.revision}}});return updated;
 },{maxWait:10000,timeout:15000});
}
