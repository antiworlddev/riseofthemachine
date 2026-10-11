import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { createTeam,myTeams,saveRoster,submitRoster } from '../../src/server/registration';
import { rateLimit } from '../../src/server/rate-limit';
import { AppError } from '../../src/server/errors';
import { seal,cookieName } from '../../src/server/session';

const connection=process.env.TEST_DATABASE_URL;
if(!connection) throw new Error('TEST_DATABASE_URL must point to a disposable PostgreSQL test database.');
const schema=process.env.PREPARED_TEST_SCHEMA ?? `rotm_test_${randomUUID().replaceAll('-','')}`;
if(!/^rotm_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid isolated test schema.');
const url=new URL(connection);url.searchParams.set('schema',schema);
const admin=new PrismaClient({datasourceUrl:connection});
const db=new PrismaClient({datasourceUrl:url.href});
process.env.KALA_REGISTRATION_ENABLED='true';
process.env.KALA_EVENT_SLUG='kala-games-integration';
const owner={subject:'owner',email:'owner@example.com'},outsider={subject:'outsider',email:'outsider@example.com'};
const player={participantKey:'p1',fullName:'Player One',jerseyNumber:1,captain:true};

test('registration transactions, ownership and race handling',async t=>{
 try{
  if(!process.env.PREPARED_TEST_SCHEMA) {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const migrated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});
  assert.equal(migrated.status,0,migrated.stderr+'\n'+migrated.stdout);
  }
  const event=await db.event.create({data:{slug:process.env.KALA_EVENT_SLUG!,name:'KALA GAMES TEST',dateLocal:'2026-12-19'}});
  const option=await db.teamOption.create({data:{eventId:event.id,key:'test-team',name:'Test Team',enabled:true}});
  await db.competition.create({data:{eventId:event.id,sportCode:'football',minPlayers:1,maxPlayers:2,registrationEnabled:true}});
  const input={teamOptionId:option.id,sportCodes:['football'],representative:{name:'Owner Rep',phone:'+2348000000000'}};
  const team=await createTeam(db,owner,input);const roster=team.rosters[0];
  await t.test('free registration creates no order or payment',async()=>{assert.equal(await db.order.count(),0);assert.equal(await db.paymentAttempt.count(),0);assert.equal(team.rosters.length,1);});
  await t.test('duplicate representative claims cannot take over existing team',async()=>{await assert.rejects(()=>createTeam(db,outsider,{...input,representative:{name:'Other Rep',phone:'+2348000000001'}}));assert.equal((await db.teamRegistration.findUniqueOrThrow({where:{id:team.id},include:{representative:true}})).representative.authSubject,owner.subject);});
  await t.test('other representative cannot list or edit team roster',async()=>{assert.deepEqual(await myTeams(db,outsider),[]);await assert.rejects(()=>saveRoster(db,outsider,roster.id,{revision:1,members:[player]}),e=>e instanceof AppError&&e.status===404);});
  await t.test('empty submission fails without changing state',async()=>{await assert.rejects(()=>submitRoster(db,owner,roster.id,1));assert.equal((await db.sportRoster.findUniqueOrThrow({where:{id:roster.id}})).status,'DRAFT');});
  await t.test('simultaneous saves preserve one revision winner',async()=>{
   const results=await Promise.allSettled([saveRoster(db,owner,roster.id,{revision:1,members:[player]}),saveRoster(db,owner,roster.id,{revision:1,members:[{...player,fullName:'Other Edit'}]})]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const failure=results.find(r=>r.status==='rejected');assert.ok(failure?.status==='rejected'&&failure.reason instanceof AppError&&failure.reason.code==='STALE_REVISION');
   assert.equal((await db.sportRoster.findUniqueOrThrow({where:{id:roster.id}})).revision,2);
  });
  await t.test('failed replacement rolls back deleted members and revision',async()=>{
   const before=await db.rosterMember.findMany({where:{rosterId:roster.id}});
   await assert.rejects(()=>saveRoster(db,owner,roster.id,{revision:2,members:[player,{...player}]}));
   assert.deepEqual(await db.rosterMember.findMany({where:{rosterId:roster.id}}),before);
   assert.equal((await db.sportRoster.findUniqueOrThrow({where:{id:roster.id}})).revision,2);
  });
  await t.test('simultaneous submit creates one submission audit',async()=>{
   const results=await Promise.allSettled([submitRoster(db,owner,roster.id,2),submitRoster(db,owner,roster.id,2)]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   assert.equal(await db.auditLog.count({where:{entityId:roster.id,action:'ROSTER_SUBMITTED'}}),1);
   assert.equal((await db.sportRoster.findUniqueOrThrow({where:{id:roster.id}})).status,'SUBMITTED');
  });
  await t.test('submitted roster cannot be edited',async()=>{await assert.rejects(()=>saveRoster(db,owner,roster.id,{revision:3,members:[]}));});
  await t.test('closed registration rejects writes',async()=>{process.env.KALA_REGISTRATION_ENABLED='false';try{await assert.rejects(()=>createTeam(db,owner,input),e=>e instanceof AppError&&e.code==='REGISTRATION_CLOSED');}finally{process.env.KALA_REGISTRATION_ENABLED='true';}});
  await t.test('route handlers reject unauthenticated, cross-origin, forged and unowned requests',async()=>{
   Object.assign(process.env,{DATABASE_URL:url.href,APP_ORIGIN:'http://localhost:3000',AUTH_ISSUER:'https://identity.example.com',AUTH_AUTHORIZATION_URL:'https://identity.example.com/authorize',AUTH_TOKEN_URL:'https://identity.example.com/token',AUTH_JWKS_URL:'https://identity.example.com/jwks',AUTH_CLIENT_ID:'route-tests',SESSION_KEY:'a'.repeat(64)});
   const teamsRoute=await import('../../src/app/api/kala/teams/route');
   const rosterRoute=await import('../../src/app/api/kala/rosters/[id]/route');
   const ownerCookie=`${cookieName('session')}=${await seal(owner,'session',3600)}`;
   const outsiderCookie=`${cookieName('session')}=${await seal(outsider,'session',3600)}`;
   const makeRequest=(method:string,body?:unknown,cookie=ownerCookie,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/kala/teams',{method,headers:{cookie,origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
   assert.equal((await teamsRoute.GET(makeRequest('GET',undefined,''))).status,401);
   const owned=await teamsRoute.GET(makeRequest('GET'));assert.equal(owned.status,200);assert.equal((await owned.json()).teams[0].id,team.id);
   const foreign=await teamsRoute.GET(makeRequest('GET',undefined,outsiderCookie));assert.deepEqual((await foreign.json()).teams,[]);
   assert.equal((await teamsRoute.POST(makeRequest('POST',input,ownerCookie,'https://attacker.example'))).status,403);
   assert.equal((await teamsRoute.POST(makeRequest('POST',{...input,representativeId:'forged'}))).status,400);
   const response=await rosterRoute.PUT(makeRequest('PUT',{revision:3,members:[]},outsiderCookie),{params:Promise.resolve({id:roster.id})});assert.equal(response.status,404);
   const missing=await rosterRoute.PUT(makeRequest('PUT',{revision:3,members:[]}),{params:Promise.resolve({id:'not-a-uuid'})});assert.equal(missing.status,400);
   const database=await import('../../src/server/db');await database.db().$disconnect();
  });
  await t.test('persistent account quota blocks the 61st request',async()=>{for(let i=0;i<60;i++) await rateLimit(db,'quota-test');await assert.rejects(()=>rateLimit(db,'quota-test'),e=>e instanceof AppError&&e.status===429);});
 }finally{
  await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();
 }
});
