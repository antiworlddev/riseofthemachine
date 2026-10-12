import {configureTables,assignTable,tableOverview} from '../../src/server/tables';
import {checkParking} from '../../src/server/parking';
import {tablePackages} from '../../src/server/table-stock';
import {createMerchQuote,configureShipping,shippingRates,quoteInput} from '../../src/server/shipping';
import {unseal} from '../../src/server/session';
import {operatePayment,paymentOperations,operationInput} from '../../src/server/payment-operations';
import type {RefundGateway,ProviderRefund} from '../../src/server/refund-provider';
import {merchInventory,updateInventory,inventoryInput} from '../../src/server/merch-inventory';
import {configureMerchStock} from '../../scripts/setup-merch';
import {seedMerch} from '../../scripts/seed-merch';
import {merchInput,merchCatalog,merchCheckout,reserveMerch,verifyMerch,myMerchOrders,expireMerch,adminMerchOrders,updateMerchFulfilment} from '../../src/server/merch';
import {deliverTicketEmails,type EmailPayload} from '../../src/server/ticket-emails';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { createTeam,myTeams,saveRoster,submitRoster } from '../../src/server/registration';
import { rateLimit } from '../../src/server/rate-limit';
import { AppError } from '../../src/server/errors';
import {ticketOverview,adminOrders,configureSales,ticketFilters} from '../../src/server/ticket-admin';
import {checkTicket,scannerSession} from '../../src/server/admission';
import { checkout,reserveOrder,verifyPayment,myOrders,expireReservations,ticketCatalog,concertSlug } from '../../src/server/ticketing';
import type { Gateway,Verification } from '../../src/server/paystack';
import { getSettings,settingsInput,updateSettings } from '../../src/server/settings';
import { listRosters,requireAdmin,reviewInput,reviewRoster } from '../../src/server/admin';
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
  const event=await db.event.create({data:{slug:process.env.KALA_EVENT_SLUG!,name:'KALA GAMES TEST',dateLocal:'2026-12-19',registrationEnabled:true}});
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
  await t.test('admin review rejects ordinary, scanner and disabled staff accounts',async()=>{
   await assert.rejects(()=>listRosters(db,owner,'SUBMITTED'),e=>e instanceof AppError&&e.status===403);
   const staff=await db.staffUser.create({data:{authSubject:owner.subject,email:owner.email,role:'SCANNER',enabled:true}});
   await assert.rejects(()=>requireAdmin(db,owner));
   await db.staffUser.update({where:{id:staff.id},data:{role:'ADMIN',enabled:false}});await assert.rejects(()=>requireAdmin(db,owner));
   await db.staffUser.update({where:{id:staff.id},data:{enabled:true}});assert.equal((await requireAdmin(db,owner)).id,staff.id);
  });
  await t.test('simultaneous opposite reviews persist one decision and one audit',async()=>{
   assert.equal(reviewInput.safeParse({revision:3,decision:'REJECTED',note:''}).success,false);
   const results=await Promise.allSettled([reviewRoster(db,owner,roster.id,{revision:3,decision:'APPROVED',note:'Checked eligibility'}),reviewRoster(db,owner,roster.id,{revision:3,decision:'REJECTED',note:'Missing eligibility proof'})]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   const persisted=await db.sportRoster.findUniqueOrThrow({where:{id:roster.id}});assert.equal(persisted.revision,4);assert.ok(persisted.reviewedAt);
   const audit=await db.auditLog.findMany({where:{entityId:roster.id,action:{in:['ROSTER_APPROVED','ROSTER_REJECTED']}}});assert.equal(audit.length,1);assert.ok(audit[0].actorId);
   const mine=await myTeams(db,owner);assert.equal(mine[0].rosters[0].reviewNote,persisted.reviewNote);
   await assert.rejects(()=>reviewRoster(db,owner,roster.id,{revision:4,decision:'APPROVED',note:''}));
  });
  await t.test('rejection requires note and persists representative-visible feedback',async()=>{
   const option2=await db.teamOption.create({data:{eventId:event.id,key:'second-test-team',name:'Second Test Team',enabled:true}});
   const team2=await createTeam(db,outsider,{...input,teamOptionId:option2.id});const draft=team2.rosters[0];
   const saved=await saveRoster(db,outsider,draft.id,{revision:1,members:[player]});const submitted=await submitRoster(db,outsider,draft.id,saved.revision);
   const result=await reviewRoster(db,owner,draft.id,{revision:submitted.revision,decision:'REJECTED',note:'Please provide eligibility confirmation.'});assert.equal(result.status,'REJECTED');
   assert.equal((await myTeams(db,outsider))[0].rosters[0].reviewNote,'Please provide eligibility confirmation.');
   await assert.rejects(()=>saveRoster(db,owner,draft.id,{revision:result.revision,members:[player]}),e=>e instanceof AppError&&e.status===404);
   process.env.KALA_REGISTRATION_ENABLED='false';
   try{await assert.rejects(()=>saveRoster(db,outsider,draft.id,{revision:result.revision,members:[player]}),e=>e instanceof AppError&&e.code==='REGISTRATION_CLOSED');}finally{process.env.KALA_REGISTRATION_ENABLED='true';}
   await assert.rejects(()=>saveRoster(db,outsider,draft.id,{revision:result.revision,members:[player,player,player]}),e=>e instanceof AppError&&e.code==='TOO_MANY_PLAYERS');
   const empty=await saveRoster(db,outsider,draft.id,{revision:result.revision,members:[]});
   await assert.rejects(()=>submitRoster(db,outsider,draft.id,empty.revision),e=>e instanceof AppError&&e.code==='ROSTER_SIZE');
   const corrected=await saveRoster(db,outsider,draft.id,{revision:empty.revision,members:[{...player,fullName:'Eligible Player'}]});
   assert.equal(corrected.status,'REJECTED');assert.equal(corrected.reviewNote,result.reviewNote);
   await assert.rejects(()=>submitRoster(db,outsider,draft.id,empty.revision),e=>e instanceof AppError&&e.code==='STALE_REVISION');
   const resubmissions=await Promise.allSettled([submitRoster(db,outsider,draft.id,corrected.revision),submitRoster(db,outsider,draft.id,corrected.revision)]);
   assert.equal(resubmissions.filter(r=>r.status==='fulfilled').length,1);
   const pending=await db.sportRoster.findUniqueOrThrow({where:{id:draft.id}});assert.equal(pending.status,'SUBMITTED');assert.equal(pending.reviewNote,result.reviewNote);
   assert.ok((await listRosters(db,owner,'SUBMITTED')).rosters.some(r=>r.id===draft.id));
   assert.equal(await db.auditLog.count({where:{entityId:draft.id,action:'ROSTER_RESUBMITTED'}}),1);
   await assert.rejects(()=>reviewRoster(db,owner,draft.id,{revision:result.revision,decision:'APPROVED',note:''}),e=>e instanceof AppError&&e.code==='STALE_REVISION');
   const approved=await reviewRoster(db,owner,draft.id,{revision:pending.revision,decision:'APPROVED',note:'Corrections checked.'});
   await assert.rejects(()=>saveRoster(db,outsider,draft.id,{revision:approved.revision,members:[player]}),e=>e instanceof AppError&&e.code==='ROSTER_LOCKED');
  });
  await t.test('settings enforce staff access, strict rules, and one concurrent winner',async()=>{
   await assert.rejects(()=>getSettings(db,outsider),e=>e instanceof AppError&&e.code==='ADMIN_REQUIRED');
   await assert.rejects(()=>updateSettings(db,outsider,{action:'registration',revision:1,enabled:false}),e=>e instanceof AppError&&e.code==='ADMIN_REQUIRED');
   assert.equal(settingsInput.safeParse({action:'sport',revision:1,sportCode:'volleyball',minPlayers:5,maxPlayers:2,enabled:true}).success,false);
   assert.equal(settingsInput.safeParse({action:'registration',revision:1,enabled:true,role:'ADMIN'}).success,false);
   const before=(await getSettings(db,owner)).event.settingsRevision;
   const changes=await Promise.allSettled([
    updateSettings(db,owner,{action:'team',revision:before,key:'dashboard-team',name:'Dashboard Team',universityName:null,enabled:true}),
    updateSettings(db,owner,{action:'team',revision:before,key:'dashboard-team',name:'Dashboard Team',universityName:null,enabled:true})
   ]);
   assert.equal(changes.filter(r=>r.status==='fulfilled').length,1);
   const failure=changes.find(r=>r.status==='rejected');assert.ok(failure?.status==='rejected'&&failure.reason.code==='STALE_REVISION');
   const current=await getSettings(db,owner);assert.equal(current.event.settingsRevision,before+1);
   assert.equal(await db.auditLog.count({where:{action:'KALA_SETTINGS_UPDATED'}}),1);
   await assert.rejects(()=>updateSettings(db,owner,{action:'team',revision:current.event.settingsRevision,key:'dashboard-team',name:'Duplicate',universityName:null,enabled:true}),e=>e instanceof AppError&&e.code==='ALREADY_EXISTS');
   await assert.rejects(()=>updateSettings(db,owner,{action:'team',revision:current.event.settingsRevision,id:option.id,key:option.key,name:'Renamed',universityName:null,enabled:true}),e=>e instanceof AppError&&e.code==='TEAM_IN_USE');
   const sport=current.event.competitions[0];
   await assert.rejects(()=>updateSettings(db,owner,{action:'sport',revision:current.event.settingsRevision,id:sport.id,sportCode:sport.sportCode,minPlayers:2,maxPlayers:2,enabled:true}),e=>e instanceof AppError&&e.code==='ROSTERS_IN_USE');
   const foreignEvent=await db.event.create({data:{slug:'foreign-event',name:'Other event',dateLocal:'2026-12-20'}});
   const foreignTeam=await db.teamOption.create({data:{eventId:foreignEvent.id,key:'foreign',name:'Foreign'}});
   await assert.rejects(()=>updateSettings(db,owner,{action:'team',revision:current.event.settingsRevision,id:foreignTeam.id,key:'foreign',name:'Foreign',universityName:null,enabled:true}),e=>e instanceof AppError&&e.code==='TEAM_NOT_FOUND');
   await updateSettings(db,owner,{action:'sport',revision:current.event.settingsRevision,sportCode:'volleyball',minPlayers:6,maxPlayers:12,enabled:false});
   const afterSport=await getSettings(db,owner);assert.ok(afterSport.event.competitions.some(s=>s.sportCode==='volleyball'&&s.minPlayers===6&&s.maxPlayers===12&&!s.registrationEnabled));
   await assert.rejects(()=>updateSettings(db,owner,{action:'sport',revision:afterSport.event.settingsRevision,sportCode:'volleyball',minPlayers:6,maxPlayers:12,enabled:true}),e=>e instanceof AppError&&e.code==='ALREADY_EXISTS');
  });
  await t.test('database registration switch closes writes and catalog, and reopening validates setup',async()=>{
   let current=await getSettings(db,owner);
   await updateSettings(db,owner,{action:'registration',revision:current.event.settingsRevision,enabled:false});
   assert.equal((await getSettings(db,owner)).event.registrationEnabled,false);
   const newOption=await db.teamOption.findUniqueOrThrow({where:{eventId_key:{eventId:event.id,key:'dashboard-team'}}});
   await assert.rejects(()=>createTeam(db,owner,{...input,teamOptionId:newOption.id}),e=>e instanceof AppError&&e.code==='REGISTRATION_CLOSED');
   current=await getSettings(db,owner);
   process.env.KALA_REGISTRATION_ENABLED='false';
   try{await assert.rejects(()=>updateSettings(db,owner,{action:'registration',revision:current.event.settingsRevision,enabled:true}),e=>e instanceof AppError&&e.code==='ENVIRONMENT_CLOSED');}finally{process.env.KALA_REGISTRATION_ENABLED='true';}
   await db.competition.updateMany({where:{eventId:event.id},data:{registrationEnabled:false}});
   await assert.rejects(()=>updateSettings(db,owner,{action:'registration',revision:current.event.settingsRevision,enabled:true}),e=>e instanceof AppError&&e.code==='SETUP_REQUIRED');
   const sport=current.event.competitions[0];
   await updateSettings(db,owner,{action:'sport',revision:current.event.settingsRevision,id:sport.id,sportCode:sport.sportCode,minPlayers:1,maxPlayers:2,enabled:true});
   current=await getSettings(db,owner);
   await updateSettings(db,owner,{action:'registration',revision:current.event.settingsRevision,enabled:true});
   const added=await createTeam(db,owner,{...input,teamOptionId:newOption.id});
   const draft=added.rosters[0];current=await getSettings(db,owner);
   await updateSettings(db,owner,{action:'team',revision:current.event.settingsRevision,id:newOption.id,key:newOption.key,name:newOption.name,universityName:null,enabled:false});
   await assert.rejects(()=>saveRoster(db,owner,draft.id,{revision:1,members:[player]}),e=>e instanceof AppError&&e.code==='REGISTRATION_CLOSED');
   assert.ok((await myTeams(db,owner)).some(t=>t.id===added.id));
   current=await getSettings(db,owner);
   await updateSettings(db,owner,{action:'team',revision:current.event.settingsRevision,id:newOption.id,key:newOption.key,name:newOption.name,universityName:null,enabled:true});
   current=await getSettings(db,owner);
   await updateSettings(db,owner,{action:'registration',revision:current.event.settingsRevision,enabled:false});
   await assert.rejects(()=>saveRoster(db,owner,draft.id,{revision:1,members:[player]}),e=>e instanceof AppError&&e.code==='REGISTRATION_CLOSED');
   await assert.rejects(()=>submitRoster(db,owner,draft.id,1),e=>e instanceof AppError&&e.code==='REGISTRATION_CLOSED');
   current=await getSettings(db,owner);await updateSettings(db,owner,{action:'registration',revision:current.event.settingsRevision,enabled:true});
  });
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
   const foreign=await teamsRoute.GET(makeRequest('GET',undefined,outsiderCookie));assert.equal((await foreign.json()).teams.some((t:{id:string})=>t.id===team.id),false);
   assert.equal((await teamsRoute.POST(makeRequest('POST',input,ownerCookie,'https://attacker.example'))).status,403);
   assert.equal((await teamsRoute.POST(makeRequest('POST',{...input,representativeId:'forged'}))).status,400);
   const response=await rosterRoute.PUT(makeRequest('PUT',{revision:3,members:[]},outsiderCookie),{params:Promise.resolve({id:roster.id})});assert.equal(response.status,404);
   const missing=await rosterRoute.PUT(makeRequest('PUT',{revision:3,members:[]}),{params:Promise.resolve({id:'not-a-uuid'})});assert.equal(missing.status,400);
   const adminRoute=await import('../../src/app/api/admin/rosters/[id]/review/route');
   assert.equal((await adminRoute.POST(makeRequest('POST',{revision:4,decision:'APPROVED',note:''},outsiderCookie),{params:Promise.resolve({id:roster.id})})).status,403);
   assert.equal((await adminRoute.POST(makeRequest('POST',{revision:4,decision:'APPROVED',note:''},ownerCookie,'https://attacker.example'),{params:Promise.resolve({id:roster.id})})).status,403);
   assert.equal((await adminRoute.POST(makeRequest('POST',{revision:4,decision:'REJECTED',note:''}),{params:Promise.resolve({id:roster.id})})).status,400);
   const settingsRoute=await import('../../src/app/api/admin/settings/route');
   assert.equal((await settingsRoute.GET(makeRequest('GET',undefined,''))).status,401);
   assert.equal((await settingsRoute.GET(makeRequest('GET',undefined,outsiderCookie))).status,403);
   assert.equal((await settingsRoute.GET(makeRequest('GET'))).status,200);
   assert.equal((await settingsRoute.PATCH(makeRequest('PATCH',{action:'registration',revision:1,enabled:false},ownerCookie,'https://attacker.example'))).status,403);
   assert.equal((await settingsRoute.PATCH(makeRequest('PATCH',{action:'registration',revision:1,enabled:false,role:'ADMIN'}))).status,400);
   const database=await import('../../src/server/db');await database.db().$disconnect();
  });
  await t.test('ticket reservation, verified issuance and reconciliation',async t=>{
   process.env.CONCERT_EVENT_SLUG='concert-integration';process.env.TICKET_SALES_ENABLED='true';process.env.TICKET_TOKEN_KEY='b'.repeat(64);process.env.PAYSTACK_MODE='test';process.env.PAYSTACK_SECRET_KEY='sk_test_'+'x'.repeat(32);process.env.TABLE_ENQUIRY_EMAIL='bookings@example.com';
   const concert=await db.event.create({data:{slug:'concert-integration',name:'Concert',dateLocal:'2026-12-20',salesEnabled:true}});
   const regular=await db.ticketTier.create({data:{eventId:concert.id,code:'regular',name:'Regular',priceMinor:2000000,capacity:2,active:true}});
   const vip=await db.ticketTier.create({data:{eventId:concert.id,code:'vip',name:'VIP',priceMinor:10000000,capacity:20,active:true}});
   const buyer={subject:'buyer',email:'buyer@example.com'},other={subject:'other-buyer',email:'other@example.com'};
   const input={tierCode:'regular' as const,quantity:2,buyerName:'Buyer',idempotencyKey:randomUUID()};
   const values=new Map<string,Verification>();let initCount=0;
   const gateway:Gateway={domain:'test',initialize:async args=>{initCount++;return 'https://checkout.paystack.com/test-checkout';},verify:async reference=>{const value=values.get(reference);if(!value)throw new Error('Missing fake verification');return value;}};
   const success=(reference:string,amount:number,email=buyer.email):Verification=>({id:String(Math.floor(Math.random()*1000000000)+1),reference,amount,currency:'NGN',domain:'test',status:'success',paid_at:new Date().toISOString(),customer:{email}});
   let orderId='',reference='';
   await t.test('confirmed catalog shows table prices and email enquiry',async()=>{const result=await ticketCatalog(db);assert.equal(result.salesOpen,true);assert.deepEqual(result.tables.map(t=>t.price),[3000000,5000000,10000000]);assert.ok(result.tables.every(t=>t.url?.startsWith('mailto:bookings@example.com')));});
   await t.test('concurrent checkout retry reserves and initializes once',async()=>{
    const results=await Promise.allSettled([checkout(db,buyer,input,gateway),checkout(db,buyer,input,gateway)]);assert.ok(results.some(r=>r.status==='fulfilled'));
    const persisted=await checkout(db,buyer,input,gateway);orderId=persisted.orderId;reference=persisted.reference;
    assert.equal(await db.order.count({where:{buyerSubject:buyer.subject}}),1);assert.equal(initCount,1);assert.equal((await db.ticketTier.findUniqueOrThrow({where:{id:regular.id}})).reserved,2);
    assert.equal((await db.order.findUniqueOrThrow({where:{id:orderId}})).totalMinor,4000000);
    await assert.rejects(()=>checkout(db,buyer,{...input,quantity:1},gateway),e=>e instanceof AppError&&e.code==='IDEMPOTENCY_CONFLICT');
    await assert.rejects(()=>reserveOrder(db,other,{...input,quantity:1,idempotencyKey:randomUUID()},'test'),e=>e instanceof AppError&&e.code==='SOLD_OUT');
   });
   await t.test('unpaid and foreign payments cannot issue tickets',async()=>{
    values.set(reference,{...success(reference,4000000),status:'pending'});assert.equal((await verifyPayment(db,reference,buyer,gateway)).status,'RESERVED');assert.equal(await db.ticket.count(),0);
    await assert.rejects(()=>verifyPayment(db,reference,other,gateway),e=>e instanceof AppError&&e.code==='ORDER_NOT_FOUND');assert.deepEqual(await myOrders(db,other),[]);
   });
   await t.test('simultaneous verification issues exact tickets once and preserves codes',async()=>{
    values.set(reference,success(reference,4000000));await Promise.all([verifyPayment(db,reference,buyer,gateway),verifyPayment(db,reference,undefined,gateway)]);
    const inventory=await db.ticketTier.findUniqueOrThrow({where:{id:regular.id}});assert.equal(inventory.reserved,0);assert.equal(inventory.sold,2);assert.equal(await db.ticket.count(),2);
    assert.equal(await db.auditLog.count({where:{entityId:orderId,action:'ORDER_PAID'}}),1);assert.equal(await db.outboxMessage.count({where:{deduplicationKey:`tickets:${orderId}`}}),1);
    const mine=await myOrders(db,buyer),codes=mine[0].lines[0].tickets.map(t=>t.code);assert.ok(codes.every(Boolean));assert.equal(new Set(codes).size,2);
    await verifyPayment(db,reference,buyer,gateway);assert.deepEqual((await myOrders(db,buyer))[0].lines[0].tickets.map(t=>t.code),codes);
    const stored=await db.ticket.findMany();assert.ok(stored.every(t=>t.encryptedToken&&!codes.includes(t.encryptedToken)&&!codes.includes(t.tokenHash)));
   });
   await t.test('ticket email retries preserve encrypted payload and provider key, then send once',async()=>{
    process.env.EMAIL_DELIVERY_ENABLED='true';process.env.RESEND_API_KEY='re_mock_only';process.env.TICKET_EMAIL_FROM='tickets@example.com';process.env.TICKET_EMAIL_MODE='test';
    const calls:{payload:EmailPayload;key:string}[]=[];
    const sender=async(payload:EmailPayload,key:string)=>{calls.push({payload,key});if(calls.length===1)throw new Error('uncertain timeout');return 'mock-email-id';};
    assert.deepEqual(await deliverTicketEmails(db,sender,10,Date.now()-1),{sent:0,retrying:0,blocked:0});assert.equal(calls.length,0);
    const first=await deliverTicketEmails(db,sender);assert.equal(first.retrying,1);
    const queued=await db.outboxMessage.findUniqueOrThrow({where:{deduplicationKey:`tickets:${orderId}`}});assert.equal(queued.attempts,1);assert.ok(queued.encryptedDeliveryPayload);assert.ok(!queued.encryptedDeliveryPayload.includes(buyer.email));
    assert.equal(calls[0].payload.to[0],buyer.email);assert.equal(calls[0].payload.attachments.length,2);assert.equal(Buffer.from(calls[0].payload.attachments[0].content,'base64').subarray(1,4).toString(),'PNG');assert.ok(calls[0].payload.subject.startsWith('[TEST]'));
    await db.outboxMessage.update({where:{id:queued.id},data:{nextAttemptAt:new Date(0)}});
    process.env.TICKET_EMAIL_FROM='changed@example.com';
    const results=await Promise.all([deliverTicketEmails(db,sender),deliverTicketEmails(db,sender)]);assert.equal(results.reduce((n,r)=>n+r.sent,0),1);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
    assert.equal((await myOrders(db,buyer))[0].emailDelivery?.status,'SENT');assert.equal((await db.outboxMessage.findUniqueOrThrow({where:{id:queued.id}})).encryptedDeliveryPayload,null);
    await deliverTicketEmails(db,sender);assert.equal(calls.length,2);
   });
   await t.test('disabled delivery leaves queue unchanged and expired retry window requires review',async()=>{
    const queued=await db.outboxMessage.findUniqueOrThrow({where:{deduplicationKey:`tickets:${orderId}`}});
    await db.outboxMessage.update({where:{id:queued.id},data:{deliveredAt:null,firstAttemptAt:new Date(Date.now()-24*3600000),nextAttemptAt:new Date(0)}});
    process.env.EMAIL_DELIVERY_ENABLED='false';await assert.rejects(()=>deliverTicketEmails(db,async()=>{throw new Error('must not send');}));assert.equal((await db.outboxMessage.findUniqueOrThrow({where:{id:queued.id}})).attempts,2);
    process.env.EMAIL_DELIVERY_ENABLED='true';const result=await deliverTicketEmails(db,async()=>{throw new Error('must not send');});assert.equal(result.blocked,1);assert.equal((await myOrders(db,buyer))[0].emailDelivery?.status,'NEEDS_ATTENTION');
   });
   await t.test('email worker stops revoked tickets and reconciliation orders before sending',async()=>{
    const message=await db.outboxMessage.findUniqueOrThrow({where:{deduplicationKey:`tickets:${orderId}`}}),ticket=await db.ticket.findFirstOrThrow();
    const reset=()=>db.outboxMessage.update({where:{id:message.id},data:{blocked:false,deliveredAt:null,attempts:0,firstAttemptAt:null,nextAttemptAt:new Date(0)}});
    const sender=async()=>{assert.fail('non-deliverable order must not send');return '';};
    await reset();await db.ticket.update({where:{id:ticket.id},data:{status:'VOID'}});assert.equal((await deliverTicketEmails(db,sender)).blocked,1);await db.ticket.update({where:{id:ticket.id},data:{status:'ACTIVE'}});
    await reset();await db.order.update({where:{id:orderId},data:{needsReconciliation:true}});assert.equal((await deliverTicketEmails(db,sender)).blocked,1);await db.order.update({where:{id:orderId},data:{needsReconciliation:false}});
   });
   await t.test('staff check-in rejects ordinary and disabled accounts',async()=>{
    process.env.ADMISSION_MODE='test';
    await assert.rejects(()=>scannerSession(db,buyer),e=>e instanceof AppError&&e.code==='SCANNER_REQUIRED');
    const code=(await myOrders(db,buyer))[0].lines[0].tickets[0].code!;
    await assert.rejects(()=>checkTicket(db,buyer,code),e=>e instanceof AppError&&e.code==='SCANNER_REQUIRED');
    await db.staffUser.update({where:{authSubject:owner.subject},data:{enabled:false}});
    await assert.rejects(()=>checkTicket(db,owner,code,true),e=>e instanceof AppError&&e.code==='SCANNER_REQUIRED');
    await db.staffUser.update({where:{authSubject:owner.subject},data:{enabled:true}});
   });
   await t.test('preview validates ticket, payment mode, void status and does not admit',async()=>{
    const ticket=(await myOrders(db,buyer))[0].lines[0].tickets[0];
    assert.equal((await checkTicket(db,owner,'z'.repeat(43))).status,'INVALID');
    process.env.ADMISSION_MODE='live';assert.equal((await checkTicket(db,owner,ticket.code!,true)).status,'WRONG_MODE');
    process.env.ADMISSION_MODE='test';
    await db.order.update({where:{id:orderId},data:{needsReconciliation:true}});assert.equal((await checkTicket(db,owner,ticket.code!,true)).status,'PAYMENT_REVIEW');
    await db.order.update({where:{id:orderId},data:{needsReconciliation:false,status:'CANCELLED'}});assert.equal((await checkTicket(db,owner,ticket.code!,true)).status,'NOT_PAID');
    await db.order.update({where:{id:orderId},data:{status:'PAID'}});
    await db.ticket.update({where:{id:ticket.id},data:{status:'VOID'}});assert.equal((await checkTicket(db,owner,ticket.code!,true)).status,'VOID');
    await db.ticket.update({where:{id:ticket.id},data:{status:'ACTIVE'}});assert.equal((await checkTicket(db,owner,ticket.code!)).status,'READY');assert.equal(await db.admission.count(),0);
   });
   await t.test('simultaneous admission has one winner and retries report used',async()=>{
    const code=(await myOrders(db,buyer))[0].lines[0].tickets[0].code!;
    const results=await Promise.all([checkTicket(db,owner,code,true),checkTicket(db,owner,code,true)]);
    assert.equal(results.filter(r=>r.status==='ADMITTED').length,1);assert.equal(results.filter(r=>r.status==='USED').length,1);assert.equal(await db.admission.count(),1);
    const used=await checkTicket(db,owner,code,true);assert.equal(used.status,'USED');assert.ok(used.ticket?.admittedAt);
    assert.equal(await db.auditLog.count({where:{action:'TICKET_ADMITTED'}}),1);
    const logs=await db.auditLog.findMany({where:{action:'ADMISSION_DENIED'}});assert.ok(logs.every(l=>!JSON.stringify(l.metadata).includes(code)));
   });
   await t.test('scanner role can admit without organizer privileges; scanner API is protected',async()=>{
    const scanner={subject:'scanner-identity',email:'scanner@example.com'};
    await db.staffUser.create({data:{authSubject:scanner.subject,email:scanner.email,role:'SCANNER',enabled:true}});
    await assert.rejects(()=>getSettings(db,scanner),e=>e instanceof AppError&&e.code==='ADMIN_REQUIRED');
    const ticket=(await myOrders(db,buyer))[0].lines[0].tickets.find(t=>t.id!==undefined&&t.ordinal===2)!;
    assert.equal((await checkTicket(db,scanner,ticket.code!,true)).status,'ADMITTED');assert.equal(await db.admission.count(),2);
    const admitRoute=await import('../../src/app/api/admission/admit/route');const cookie=`${cookieName('session')}=${await seal(scanner,'session',3600)}`;
    const request=(origin:string,auth:string,body:unknown)=>new Request('http://localhost:3000/api/admission/admit',{method:'POST',headers:{origin,cookie:auth,'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await admitRoute.POST(request('http://localhost:3000','',{token:ticket.code}))).status,401);
    assert.equal((await admitRoute.POST(request('https://attacker.example',cookie,{token:ticket.code}))).status,403);
    assert.equal((await admitRoute.POST(request('http://localhost:3000',cookie,{token:ticket.code,staffId:'forged'}))).status,400);
    const response=await admitRoute.POST(request('http://localhost:3000',cookie,{token:ticket.code}));assert.equal(response.status,200);assert.equal((await response.json()).status,'USED');
    const database=await import('../../src/server/db');await database.db().$disconnect();
   });
   await t.test('mismatched payment is held for reconciliation without tickets',async()=>{
    const order=await checkout(db,buyer,{...input,tierCode:'vip',quantity:1,idempotencyKey:randomUUID()},gateway);values.set(order.reference,{...success(order.reference,10000000),domain:'live'});
    assert.equal((await verifyPayment(db,order.reference,buyer,gateway)).needsReconciliation,true);
    for(const patch of [{amount:1},{currency:'USD'},{reference:'wrong-reference'},{customer:{email:'wrong@example.com'}}]){values.set(order.reference,{...success(order.reference,10000000),...patch});assert.equal((await verifyPayment(db,order.reference,buyer,gateway)).needsReconciliation,true);}
    assert.equal(await db.ticket.count(),2);assert.equal((await db.order.findUniqueOrThrow({where:{id:order.orderId}})).status,'RESERVED');
   });
   await t.test('expiry releases once; late successful payment never issues',async()=>{
    const order=await checkout(db,other,{...input,tierCode:'vip',quantity:1,idempotencyKey:randomUUID()},gateway);
    await db.order.update({where:{id:order.orderId},data:{expiresAt:new Date(Date.now()-1000)}});
    assert.equal(await expireReservations(db),1);assert.equal(await expireReservations(db),0);assert.equal((await db.ticketTier.findUniqueOrThrow({where:{id:vip.id}})).reserved,1);
    values.set(order.reference,success(order.reference,10000000,other.email));const result=await verifyPayment(db,order.reference,other,gateway);assert.equal(result.status,'EXPIRED');assert.equal(result.needsReconciliation,true);assert.equal(await db.ticket.count(),2);
    await verifyPayment(db,order.reference,other,gateway);assert.equal(await db.auditLog.count({where:{entityId:order.orderId,action:'LATE_PAYMENT_REQUIRES_RECONCILIATION'}}),1);
   });
   await t.test('different buyers racing the last ticket cannot oversell',async()=>{
    await db.ticketTier.update({where:{id:vip.id},data:{capacity:2}});
    const racers=[{subject:'race-one',email:'raceone@example.com'},{subject:'race-two',email:'racetwo@example.com'}];
    const results=await Promise.allSettled(racers.map(identity=>reserveOrder(db,identity,{...input,tierCode:'vip',quantity:1,idempotencyKey:randomUUID()},'test')));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const loser=results.find(r=>r.status==='rejected');assert.ok(loser?.status==='rejected'&&loser.reason.code==='SOLD_OUT');
    const winner=results.find(r=>r.status==='fulfilled');assert.ok(winner?.status==='fulfilled');await db.order.update({where:{id:winner.value.id},data:{expiresAt:new Date(Date.now()-1000)}});assert.equal(await expireReservations(db),1);
    await db.ticketTier.update({where:{id:vip.id},data:{capacity:20}});
   });
   await t.test('uncertain initialization is persisted and is not retried blindly',async()=>{
    const request={...input,tierCode:'vip' as const,quantity:1,idempotencyKey:randomUUID()};let attempts=0;
    const failed={...gateway,initialize:async()=>{attempts++;throw new Error('Provider timeout');}};
    await assert.rejects(()=>checkout(db,other,request,failed),e=>e instanceof AppError&&e.code==='CHECKOUT_UNCERTAIN');
    await assert.rejects(()=>checkout(db,other,request,failed),e=>e instanceof AppError&&e.code==='CHECKOUT_STARTING');assert.equal(attempts,1);
    const orders=await myOrders(db,other);assert.equal(orders.filter(o=>o.status==='RESERVED').length,1);assert.equal(orders.find(o=>o.status==='RESERVED')!.payments[0].status,'FAILED');
   });
   await t.test('ticket endpoints enforce auth, origin, and reject forged amounts',async()=>{
    const checkoutRoute=await import('../../src/app/api/tickets/checkout/route');const ordersRoute=await import('../../src/app/api/tickets/orders/route');const webhookRoute=await import('../../src/app/api/paystack/webhook/route');
    const cookie=`${cookieName('session')}=${await seal(buyer,'session',3600)}`;
    const request=(body:unknown,origin='http://localhost:3000',auth=cookie)=>new Request('http://localhost:3000/api/tickets/checkout',{method:'POST',headers:{origin,cookie:auth,'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await checkoutRoute.POST(request(input,'http://localhost:3000',''))).status,401);
    assert.equal((await checkoutRoute.POST(request(input,'https://attacker.example'))).status,403);
    assert.equal((await checkoutRoute.POST(request({...input,amount:1}))).status,400);
    assert.equal((await ordersRoute.GET(new Request('http://localhost:3000/api/tickets/orders'))).status,401);
    assert.equal((await webhookRoute.POST(new Request('http://localhost:3000/api/paystack/webhook',{method:'POST',body:'{}',headers:{'x-paystack-signature':'forged'}}))).status,401);
    const body=JSON.stringify({event:'charge.success',data:{reference,amount:4000000}}),signature=createHmac('sha512',process.env.PAYSTACK_SECRET_KEY!).update(body).digest('hex');
    assert.equal((await webhookRoute.POST(new Request('http://localhost:3000/api/paystack/webhook',{method:'POST',body,headers:{'x-paystack-signature':signature}}))).status,200);
    assert.equal(await db.ticket.count(),2);
    const database=await import('../../src/server/db');await database.db().$disconnect();
   });
  });
  await t.test('organizer ticket dashboard scopes totals, protects identities and inventory settings',async t=>{
   const concert=await db.event.findUniqueOrThrow({where:{slug:process.env.CONCERT_EVENT_SLUG}});
   await t.test('only organizers see sales and exact filtered orders without private codes',async()=>{
    await assert.rejects(()=>ticketOverview(db,outsider,'test'),e=>e instanceof AppError&&e.code==='ADMIN_REQUIRED');
    const scanner={subject:'scanner-identity',email:'scanner@example.com'};await assert.rejects(()=>adminOrders(db,scanner,{mode:'test',status:'ALL'}),e=>e instanceof AppError&&e.code==='ADMIN_REQUIRED');
    const overview=await ticketOverview(db,owner,'test');assert.equal(overview.summary.grossMinor,4000000);assert.equal(overview.summary.paidOrders,1);assert.equal(overview.summary.activeTickets,2);assert.equal(overview.summary.admissions,2);assert.equal(overview.summary.reconciliation,2);
    const foreign=await db.event.findUniqueOrThrow({where:{slug:'foreign-event'}});
    await db.order.create({data:{eventId:foreign.id,idempotencyKey:randomUUID(),buyerName:'Foreign Buyer',buyerEmail:'buyer@example.com',status:'PAID',paidAt:new Date(),totalMinor:9999999,expiresAt:new Date(),payments:{create:{reference:`rotm-${randomUUID().replaceAll('-','')}`,amountMinor:9999999,currency:'NGN',domain:'test',status:'VERIFIED',verifiedAt:new Date(),providerTransactionId:'foreign-provider-id'}}}});
    assert.equal((await ticketOverview(db,owner,'test')).summary.grossMinor,4000000);
    const live=await ticketOverview(db,owner,'live');assert.equal(live.summary.paidOrders,0);assert.equal(live.summary.grossMinor,0);
    const list=await adminOrders(db,owner,{mode:'test',status:'ALL',q:'buyer@example.com'});assert.equal(list.orders.length,2);assert.ok(list.orders.every(o=>o.buyerEmail==='buyer@example.com'));
    assert.equal((await adminOrders(db,owner,{mode:'test',status:'ALL',q:list.orders[0].id})).orders.length,1);
    assert.equal((await adminOrders(db,owner,{mode:'test',status:'ALL',q:list.orders[0].payments[0].reference})).orders.length,1);
    const json=JSON.stringify(list);assert.ok(!json.includes('encryptedToken'));assert.ok(!json.includes('authorizationUrl'));assert.ok(!json.includes('tokenHash'));
    const reconciled=await adminOrders(db,owner,{mode:'test',status:'RECONCILIATION'});assert.equal(reconciled.orders.length,2);assert.ok(reconciled.orders.every(o=>o.needsReconciliation));
    assert.equal((await adminOrders(db,owner,{mode:'test',status:'ALL',q:'missing@example.com'})).orders.length,0);
    assert.equal(ticketFilters.safeParse({mode:'test',status:'ALL',q:'partial name'}).success,false);
   });
   await t.test('capacity rollback and simultaneous settings preserve one revision winner',async()=>{
    const overview=await ticketOverview(db,owner,'test'),revision=overview.event.settingsRevision;
    const input={revision,salesEnabled:false,regularCapacity:3,vipCapacity:20,regularEnabled:true,vipEnabled:true};
    await assert.rejects(()=>configureSales(db,outsider,input),e=>e instanceof AppError&&e.code==='ADMIN_REQUIRED');
    await assert.rejects(()=>configureSales(db,owner,{...input,vipCapacity:1}),e=>e instanceof AppError&&e.code==='CAPACITY_IN_USE');
    assert.equal((await db.ticketTier.findUniqueOrThrow({where:{eventId_code:{eventId:concert.id,code:'regular'}}})).capacity,2);
    const results=await Promise.allSettled([configureSales(db,owner,input),configureSales(db,owner,{...input,regularCapacity:4})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const loser=results.find(r=>r.status==='rejected');assert.ok(loser?.status==='rejected'&&loser.reason.code==='STALE_REVISION');
    assert.equal(await db.auditLog.count({where:{action:'TICKET_SETTINGS_UPDATED',entityId:concert.id}}),1);
    await assert.rejects(()=>reserveOrder(db,{subject:'new-ticket-buyer',email:'new@example.com'},{tierCode:'regular',quantity:1,buyerName:'New Buyer',idempotencyKey:randomUUID()},'test'),e=>e instanceof AppError&&e.code==='SALES_CLOSED');
    const next=await ticketOverview(db,owner,'test');assert.equal(next.summary.grossMinor,4000000);assert.equal(next.event.settingsRevision,revision+1);
    process.env.TICKET_SALES_ENABLED='false';try{await assert.rejects(()=>configureSales(db,owner,{...input,revision:next.event.settingsRevision,salesEnabled:true}),e=>e instanceof AppError&&e.code==='ENVIRONMENT_CLOSED');}finally{process.env.TICKET_SALES_ENABLED='true';}
    await configureSales(db,owner,{...input,revision:next.event.settingsRevision,salesEnabled:true});
   });
   await t.test('order pagination has no overlap and endpoints validate origin and filters',async()=>{
    for(let i=0;i<52;i++)await db.order.create({data:{eventId:concert.id,idempotencyKey:randomUUID(),buyerName:'Pagination Buyer',buyerEmail:'pagination@example.com',status:'CANCELLED',totalMinor:0,expiresAt:new Date(),payments:{create:{reference:`rotm-${randomUUID().replaceAll('-','')}`,amountMinor:0,currency:'NGN',domain:'test'}}}});
    const page1=await adminOrders(db,owner,{mode:'test',status:'ALL',q:'pagination@example.com'});assert.equal(page1.orders.length,50);assert.ok(page1.nextCursor);
    const page2=await adminOrders(db,owner,{mode:'test',status:'ALL',q:'pagination@example.com',before:page1.nextCursor!});assert.equal(page2.orders.length,2);assert.equal(page2.nextCursor,null);assert.equal(new Set([...page1.orders,...page2.orders].map(o=>o.id)).size,52);
    const ordersRoute=await import('../../src/app/api/admin/tickets/orders/route'),settingsRoute=await import('../../src/app/api/admin/tickets/settings/route');const cookie=`${cookieName('session')}=${await seal(owner,'session',3600)}`;
    assert.equal((await ordersRoute.GET(new Request('http://localhost:3000/api/admin/tickets/orders'))).status,401);
    assert.equal((await ordersRoute.GET(new Request('http://localhost:3000/api/admin/tickets/orders?q=partial',{headers:{cookie}}))).status,400);
    assert.equal((await settingsRoute.PATCH(new Request('http://localhost:3000/api/admin/tickets/settings',{method:'PATCH',headers:{cookie,origin:'https://attacker.example','content-type':'application/json'},body:'{}'}))).status,403);
    const database=await import('../../src/server/db');await database.db().$disconnect();
   });
  });
  await t.test('scheduled email route rejects unauthorized calls before database or provider access',async()=>{
   const {GET}=await import('../../src/app/api/jobs/ticket-emails/route');process.env.CRON_SECRET='c'.repeat(64);
   for(const path of ['ticket-expiry','merch-expiry']){const job=await import(`../../src/app/api/jobs/${path}/route`);assert.equal((await job.GET(new Request('https://example.com/api/jobs/'+path))).status,401);}
   const response=await GET(new Request('https://example.com/api/jobs/ticket-emails'));assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');delete process.env.CRON_SECRET;
  });
  await t.test('merch carts, delivery terms, stock, payments and fulfilment',async t=>{
   process.env.MERCH_SALES_ENABLED='true';await seedMerch(db);await seedMerch(db);
   const products=await db.merchProduct.findMany({include:{variants:true}});assert.equal(products.length,6);assert.equal(products.filter(p=>p.kind==='TEE').length,3);assert.ok(products.every(p=>p.priceMinor===(p.kind==='TEE'?5000000:3000000)));assert.ok(products.every(p=>!p.active));assert.equal((await merchCatalog(db)).products.length,6);
   await configureMerchStock(db,2,true);
   const tee=products.find(p=>p.slug==='tee-1')!,cap=products.find(p=>p.slug==='cap-1')!,teeS=tee.variants.find(v=>v.label==='S')!,teeM=tee.variants.find(v=>v.label==='M')!,teeL=tee.variants.find(v=>v.label==='L')!,teeXL=tee.variants.find(v=>v.label==='XL')!,capV=cap.variants[0];
   const buyer={subject:'merch-buyer',email:'merch@example.com'},other={subject:'merch-other',email:'other-merch@example.com'};
   const rate=await configureShipping(db,owner,{action:'create',state:'FCT',feeMinor:500000,note:'Synthetic delivery rate for integration testing',enabled:true});
   const items=[{variantId:teeS.id,quantity:1},{variantId:capV.id,quantity:1}],quote=await createMerchQuote(db,buyer,{fulfilment:'DELIVERY',shippingRateId:rate.id,items});
   const input=merchInput.parse({buyerName:'Merch Buyer',phone:'+2348000000000',fulfilment:'DELIVERY',address:{line1:'123 Test Road',city:'Abuja',state:'FCT',country:'Nigeria'},acceptDeliveryQuote:true,shippingRateId:rate.id,quoteToken:quote.quoteToken,idempotencyKey:randomUUID(),items});
   let initCalls=0,serial=9000000000;const values=new Map<string,Verification>();const gateway:Gateway={domain:'test',initialize:async()=>{initCalls++;await new Promise(r=>setTimeout(r,10));return 'https://checkout.paystack.com/merch-test';},verify:async ref=>values.get(ref)!};
   const success=(reference:string,amount:number,email=buyer.email):Verification=>({id:String(++serial),reference,amount,currency:'NGN',domain:'test',status:'success',paid_at:new Date().toISOString(),customer:{email}});
   let orderId='',reference='',providerId='';
   await t.test('checkout retries reserve cart once and delivery total includes the quoted fee',async()=>{
    const results=await Promise.allSettled([merchCheckout(db,buyer,input,gateway),merchCheckout(db,buyer,input,gateway)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(initCalls,1);
    const o=(await myMerchOrders(db,buyer))[0];orderId=o.id;reference=o.payments[0].reference;assert.equal(o.totalMinor,8500000);assert.equal(o.shippingFeeMinor,500000);assert.ok(o.deliveryTerms?.includes('included'));assert.equal((o.address as {country:string}).country,'Nigeria');assert.equal((await db.merchVariant.findUniqueOrThrow({where:{id:teeS.id}})).reserved,1);
    assert.equal((await merchCheckout(db,buyer,{...input,items:[...input.items].reverse()},gateway)).orderId,orderId);assert.equal(initCalls,1);
    await assert.rejects(()=>reserveMerch(db,buyer,{...input,buyerName:'Changed Buyer'},'test'),e=>e instanceof AppError&&e.code==='IDEMPOTENCY_CONFLICT');
    assert.deepEqual(await myMerchOrders(db,other),[]);await assert.rejects(()=>verifyMerch(db,reference,other,gateway),e=>e instanceof AppError&&e.code==='ORDER_NOT_FOUND');
   });
   await t.test('pending payments cannot fulfil; simultaneous verification sells once and creates no tickets',async()=>{
    await assert.rejects(()=>updateMerchFulfilment(db,owner,orderId,{revision:1,status:'DISPATCHED',note:'Courier'}),e=>e instanceof AppError&&e.code==='ORDER_NOT_PAID');
    values.set(reference,{...success(reference,8500000),status:'pending'});assert.equal((await verifyMerch(db,reference,buyer,gateway)).status,'RESERVED');
    const beforeTickets=await db.ticket.count();const data=success(reference,8500000);providerId=String(data.id);values.set(reference,data);await Promise.all([verifyMerch(db,reference,buyer,gateway),verifyMerch(db,reference,undefined,gateway)]);
    assert.equal((await db.merchVariant.findUniqueOrThrow({where:{id:teeS.id}})).sold,1);assert.equal((await db.merchVariant.findUniqueOrThrow({where:{id:teeS.id}})).reserved,0);assert.equal(await db.auditLog.count({where:{action:'MERCH_ORDER_PAID',entityId:orderId}}),1);assert.equal(await db.ticket.count(),beforeTickets);
   });
   await t.test('only organizer can dispatch with note; concurrent fulfilment has one winner',async()=>{
    await assert.rejects(()=>adminMerchOrders(db,buyer,'test'),e=>e instanceof AppError&&e.code==='ADMIN_REQUIRED');
    await assert.rejects(()=>updateMerchFulfilment(db,buyer,orderId,{revision:1,status:'DISPATCHED',note:'Courier'}),e=>e instanceof AppError&&e.code==='ADMIN_REQUIRED');
    await assert.rejects(()=>updateMerchFulfilment(db,owner,orderId,{revision:1,status:'READY',note:''}),e=>e instanceof AppError&&e.code==='INVALID_TRANSITION');
    await assert.rejects(()=>updateMerchFulfilment(db,owner,orderId,{revision:1,status:'DISPATCHED',note:''}),e=>e instanceof AppError&&e.code==='NOTE_REQUIRED');
    const results=await Promise.allSettled([updateMerchFulfilment(db,owner,orderId,{revision:1,status:'DISPATCHED',note:'Fee agreed; Test Courier 123'}),updateMerchFulfilment(db,owner,orderId,{revision:1,status:'DISPATCHED',note:'Other courier'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    await updateMerchFulfilment(db,owner,orderId,{revision:2,status:'COMPLETED',note:'Delivered'});assert.equal((await myMerchOrders(db,buyer))[0].fulfilmentStatus,'COMPLETED');
    const adminList=await adminMerchOrders(db,owner,'test');assert.ok(!JSON.stringify(adminList).includes('authorizationUrl'));assert.equal((await adminMerchOrders(db,owner,'live')).orders.length,0);
   });
   await t.test('different buyers racing last variant cannot oversell',async()=>{
    await db.merchVariant.update({where:{id:teeM.id},data:{capacity:1}});
    const pickup={buyerName:'Pickup Buyer',phone:'+2348000000000',fulfilment:'PICKUP' as const,items:[{variantId:teeM.id,quantity:1}]};
    const results=await Promise.allSettled([reserveMerch(db,buyer,{...pickup,idempotencyKey:randomUUID()},'test'),reserveMerch(db,other,{...pickup,idempotencyKey:randomUUID()},'test')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.merchVariant.findUniqueOrThrow({where:{id:teeM.id}})).reserved,1);
    const winner=results.find(r=>r.status==='fulfilled');assert.ok(winner?.status==='fulfilled');const o=winner.value;
    values.set(o.payments[0].reference,success(o.payments[0].reference,5000000,o.buyerEmail));await verifyMerch(db,o.payments[0].reference,undefined,gateway);
    await updateMerchFulfilment(db,owner,o.id,{revision:1,status:'READY',note:'Collection desk'});await updateMerchFulfilment(db,owner,o.id,{revision:2,status:'COMPLETED',note:'Collected'});
    const stored=await db.merchOrder.findUniqueOrThrow({where:{id:o.id}});assert.equal(stored.address,null);assert.equal(stored.deliveryTerms,null);assert.equal(stored.fulfilmentStatus,'COMPLETED');
   });
   await t.test('expiry releases stock once and late payment needs reconciliation',async()=>{
    const o=await reserveMerch(db,other,{buyerName:'Late Buyer',phone:'+2348000000000',fulfilment:'PICKUP',idempotencyKey:randomUUID(),items:[{variantId:teeL.id,quantity:1}]},'test');await db.merchOrder.update({where:{id:o.id},data:{expiresAt:new Date(Date.now()-60000)}});
    assert.equal(await expireMerch(db),1);assert.equal(await expireMerch(db),0);values.set(o.payments[0].reference,success(o.payments[0].reference,5000000,other.email));assert.equal((await verifyMerch(db,o.payments[0].reference,other,gateway)).needsReconciliation,true);assert.equal((await db.merchVariant.findUniqueOrThrow({where:{id:teeL.id}})).sold,0);
   });
   await t.test('payment amount mismatch and provider transaction reuse are rejected',async()=>{
    const o=await reserveMerch(db,{subject:'merch-mismatch',email:buyer.email},{buyerName:'Mismatch Buyer',phone:'+2348000000000',fulfilment:'PICKUP',idempotencyKey:randomUUID(),items:[{variantId:teeXL.id,quantity:1}]},'test');values.set(o.payments[0].reference,success(o.payments[0].reference,1));assert.equal((await verifyMerch(db,o.payments[0].reference,undefined,gateway)).needsReconciliation,true);assert.equal((await db.merchVariant.findUniqueOrThrow({where:{id:teeXL.id}})).sold,0);
    values.set(o.payments[0].reference,{...success(o.payments[0].reference,5000000),id:providerId});await assert.rejects(()=>verifyMerch(db,o.payments[0].reference,undefined,gateway),e=>e instanceof AppError&&e.code==='PAYMENT_ALREADY_USED');
    const ticketPayment=await db.paymentAttempt.findFirstOrThrow({where:{status:'VERIFIED',providerTransactionId:{not:null}}});values.set(o.payments[0].reference,{...success(o.payments[0].reference,5000000),id:ticketPayment.providerTransactionId!});await assert.rejects(()=>verifyMerch(db,o.payments[0].reference,undefined,gateway),e=>e instanceof AppError&&e.code==='PAYMENT_ALREADY_USED');
    const ticketOrder=await reserveOrder(db,owner,{buyerName:'Organizer Ticket Buyer',tierCode:'vip',quantity:1,idempotencyKey:randomUUID()},'test');const ticketRef=ticketOrder.payments[0].reference;values.set(ticketRef,{...success(ticketRef,10000000,owner.email),id:providerId});await assert.rejects(()=>verifyPayment(db,ticketRef,owner,gateway),e=>e instanceof AppError&&e.code==='PAYMENT_ALREADY_USED');

   });
   await t.test('multi-item reservation rolls back stock and uncertain initialization is not blindly retried',async()=>{
    const variants=products.find(p=>p.slug==='tee-2')!.variants.sort((a,b)=>a.id.localeCompare(b.id));
    await db.merchVariant.update({where:{id:variants[1].id},data:{capacity:0}});
    const identity={subject:'merch-rollback',email:'rollback@example.com'},base={buyerName:'Rollback Buyer',phone:'+2348000000000',fulfilment:'PICKUP' as const,idempotencyKey:randomUUID(),items:[{variantId:variants[0].id,quantity:1},{variantId:variants[1].id,quantity:1}]};
    await assert.rejects(()=>reserveMerch(db,identity,base,'test'),e=>e instanceof AppError&&e.code==='SOLD_OUT');assert.equal((await db.merchVariant.findUniqueOrThrow({where:{id:variants[0].id}})).reserved,0);assert.equal(await db.merchOrder.count({where:{buyerSubject:identity.subject}}),0);
    const one={...base,items:[base.items[0]]};let calls=0;const broken:Gateway={...gateway,initialize:async()=>{calls++;throw new Error('uncertain provider timeout');}};
    await assert.rejects(()=>merchCheckout(db,identity,one,broken),e=>e instanceof AppError&&e.code==='CHECKOUT_UNCERTAIN');await assert.rejects(()=>merchCheckout(db,identity,one,broken),e=>e instanceof AppError&&e.code==='CHECKOUT_STARTING');assert.equal(calls,1);
    process.env.MERCH_SALES_ENABLED='false';try{await assert.rejects(()=>reserveMerch(db,identity,{...one,idempotencyKey:randomUUID()},'test'),e=>e instanceof AppError&&e.code==='MERCH_CLOSED');}finally{process.env.MERCH_SALES_ENABLED='true';}
   });
   await t.test('stock setup rolls back unsafe capacities and preserves counters when closing and reopening',async()=>{
    const before=await db.merchVariant.findMany({orderBy:{id:'asc'}}),auditCount=await db.auditLog.count({where:{action:'MERCH_STOCK_CONFIGURED_BY_CLI'}});
    await assert.rejects(()=>configureMerchStock(db,0,false),/Capacity cannot be below reserved plus sold/);
    assert.deepEqual(await db.merchVariant.findMany({orderBy:{id:'asc'}}),before);
    assert.equal(await db.auditLog.count({where:{action:'MERCH_STOCK_CONFIGURED_BY_CLI'}}),auditCount);
    assert.ok((await db.merchProduct.findMany()).every(p=>p.active));
    await configureMerchStock(db,3,false);assert.ok((await db.merchProduct.findMany()).every(p=>!p.active));
    await configureMerchStock(db,3,true);assert.ok((await db.merchProduct.findMany()).every(p=>p.active));
    const after=await db.merchVariant.findMany({orderBy:{id:'asc'}});
    assert.ok(after.every(v=>v.capacity===3));assert.deepEqual(after.map(v=>[v.id,v.reserved,v.sold]),before.map(v=>[v.id,v.reserved,v.sold]));
    assert.equal(await db.auditLog.count({where:{action:'MERCH_STOCK_CONFIGURED_BY_CLI'}}),auditCount+2);
   });
   await t.test('inventory access, atomic stock guards, stale edits and audited product controls',async()=>{
    await assert.rejects(()=>merchInventory(db,buyer),e=>e instanceof AppError&&e.status===403);
    const inventory=await merchInventory(db,owner),p=inventory.products.find(p=>p.id===tee.id)!;
    assert.ok(p.variants.every(v=>v.available===v.capacity-v.reserved-v.sold));
    const base=inventoryInput.parse({productId:p.id,expectedActive:p.active,active:false,variants:p.variants.map(v=>({id:v.id,expectedCapacity:v.capacity,capacity:4}))});
    await assert.rejects(()=>updateInventory(db,buyer,base),e=>e instanceof AppError&&e.status===403);
    await assert.rejects(()=>updateInventory(db,owner,{...base,variants:base.variants.slice(1)}),e=>e instanceof AppError&&e.code==='INVALID_VARIANTS');
    const used=p.variants.find(v=>v.sold+v.reserved>0)!;
    await assert.rejects(()=>updateInventory(db,owner,{...base,variants:base.variants.map(v=>({...v,capacity:v.id===used.id?0:4}))}),e=>e instanceof AppError&&e.code==='STOCK_IN_USE');
    assert.deepEqual((await merchInventory(db,owner)).products.find(x=>x.id===p.id),p);
    const results=await Promise.allSettled([updateInventory(db,owner,base),updateInventory(db,owner,{...base,variants:base.variants.map(v=>({...v,capacity:5}))})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(await db.auditLog.count({where:{action:'MERCH_INVENTORY_UPDATED',entityId:p.id}}),1);
    const updated=(await merchInventory(db,owner)).products.find(x=>x.id===p.id)!;assert.equal(updated.active,false);
    assert.deepEqual(updated.variants.map(v=>[v.id,v.reserved,v.sold]),p.variants.map(v=>[v.id,v.reserved,v.sold]));
    const reopen={...base,expectedActive:false,active:true,variants:updated.variants.map(v=>({id:v.id,expectedCapacity:v.capacity,capacity:v.capacity}))};
    process.env.MERCH_SALES_ENABLED='false';try{await assert.rejects(()=>updateInventory(db,owner,reopen),e=>e instanceof AppError&&e.code==='MERCH_CLOSED');}finally{process.env.MERCH_SALES_ENABLED='true';}
    await updateInventory(db,owner,reopen);assert.equal((await merchInventory(db,owner)).products.find(x=>x.id===p.id)!.active,true);
    const route=await import('../../src/app/api/admin/merch/inventory/route');
    assert.equal((await route.GET(new Request('http://localhost:3000/api/admin/merch/inventory'))).status,401);
    const cookie=`${cookieName('session')}=${await seal(owner,'session',3600)}`;
    assert.equal((await route.PATCH(new Request('http://localhost:3000/api/admin/merch/inventory',{method:'PATCH',headers:{cookie,origin:'https://attacker.example'},body:JSON.stringify(reopen)}))).status,403);
    assert.equal((await route.PATCH(new Request('http://localhost:3000/api/admin/merch/inventory',{method:'PATCH',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({...reopen,sold:0})}))).status,400);
   });
   await t.test('merch routes enforce sessions, origin, strict cart and signed webhook replay',async()=>{
    const checkoutRoute=await import('../../src/app/api/merch/checkout/route'),ordersRoute=await import('../../src/app/api/merch/orders/route');const cookie=`${cookieName('session')}=${await seal(buyer,'session',3600)}`;
    assert.equal((await ordersRoute.GET(new Request('http://localhost:3000/api/merch/orders'))).status,401);
    assert.equal((await checkoutRoute.POST(new Request('http://localhost:3000/api/merch/checkout',{method:'POST',headers:{cookie,origin:'https://attacker.example','content-type':'application/json'},body:JSON.stringify(input)}))).status,403);
    assert.equal((await checkoutRoute.POST(new Request('http://localhost:3000/api/merch/checkout',{method:'POST',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({...input,totalMinor:1})}))).status,400);
    const webhook=await import('../../src/app/api/paystack/webhook/route');const body=JSON.stringify({event:'charge.success',data:{reference}}),signature=createHmac('sha512',process.env.PAYSTACK_SECRET_KEY!).update(body).digest('hex');assert.equal((await webhook.POST(new Request('http://localhost:3000/api/paystack/webhook',{method:'POST',headers:{'x-paystack-signature':signature},body}))).status,200);
    const database=await import('../../src/server/db');await database.db().$disconnect();
   });
  });
  await t.test('expiry jobs respect budgets, batch limits, event scope and replay safety',async()=>{
   const event=await db.event.findUniqueOrThrow({where:{slug:concertSlug()}}),past=new Date(Date.now()-60000);
   const ids=[];for(let i=0;i<3;i++)ids.push((await db.order.create({data:{eventId:event.id,idempotencyKey:randomUUID(),buyerName:'Expiry Test',buyerEmail:'expiry@example.com',status:'RESERVED',totalMinor:0,expiresAt:past}})).id);
   const foreign=await db.event.create({data:{slug:'foreign-expiry',name:'Foreign',dateLocal:'2026-12-20'}});
   const foreignOrder=await db.order.create({data:{eventId:foreign.id,idempotencyKey:randomUUID(),buyerName:'Other Event',buyerEmail:'other@example.com',status:'RESERVED',totalMinor:0,expiresAt:past}});
   assert.equal(await expireReservations(db,1,Date.now()-1),0);assert.equal(await expireReservations(db,1),1);assert.equal(await db.order.count({where:{id:{in:ids},status:'RESERVED'}}),2);
   assert.equal(await expireReservations(db,10),2);assert.equal(await expireReservations(db,10),0);assert.equal((await db.order.findUniqueOrThrow({where:{id:foreignOrder.id}})).status,'RESERVED');
   const merchIds=[];for(let i=0;i<3;i++)merchIds.push((await db.merchOrder.create({data:{eventSlug:concertSlug(),idempotencyKey:randomUUID(),requestHash:'test',buyerSubject:'expiry-test',buyerName:'Expiry Test',buyerEmail:'expiry@example.com',phone:'+2348000000000',fulfilment:'PICKUP',totalMinor:100,expiresAt:past}})).id);
   assert.equal(await expireMerch(db,1,Date.now()-1),0);assert.equal(await expireMerch(db,1),1);assert.equal(await db.merchOrder.count({where:{id:{in:merchIds},status:'RESERVED'}}),2);assert.equal(await expireMerch(db,10),2);assert.equal(await expireMerch(db,10),0);
  });
  await t.test('email batches send only the requested cap and leave remaining messages for the next run',async()=>{
   const buyer={subject:'batch-buyer',email:'batch@example.com'},ids:string[]=[];
   for(let i=0;i<3;i++){
    const order=await reserveOrder(db,buyer,{tierCode:'vip',quantity:1,buyerName:'Batch Buyer',idempotencyKey:randomUUID()},'test');ids.push(order.id);
    const reference=order.payments[0].reference;
    await verifyPayment(db,reference,buyer,{domain:'test',initialize:async()=>'',verify:async()=>({id:String(9900000000+i),reference,amount:order.totalMinor,currency:'NGN',domain:'test',status:'success',paid_at:new Date().toISOString(),customer:{email:buyer.email}})});
   }
   let calls=0;const gateway=async()=>{calls++;return 'mock-batch-'+calls;};
   assert.equal((await deliverTicketEmails(db,gateway,2)).sent,2);assert.equal(calls,2);
   assert.equal(await db.outboxMessage.count({where:{deduplicationKey:{in:ids.map(id=>'tickets:'+id)},deliveredAt:null}}),1);
   assert.deepEqual(await deliverTicketEmails(db,gateway,10,Date.now()-1),{sent:0,retrying:0,blocked:0});assert.equal(calls,2);
   assert.equal((await deliverTicketEmails(db,gateway,1)).sent,1);assert.equal(calls,3);assert.equal((await deliverTicketEmails(db,gateway,10)).sent,0);
  });
  await t.test('organizer payment resolution and full refunds',async t=>{
   process.env.REFUNDS_ENABLED='true';const buyer={subject:'refund-buyer',email:'refund@example.com'};
   const values=new Map<string,Verification>(),refunds=new Map<string,ProviderRefund>();let serial=9910000000,refundCalls=0,uncertain=false;
   const gateway:RefundGateway={domain:'test',verify:async ref=>values.get(ref)!,list:async id=>[...refunds.values()].filter(r=>r.transaction===id),fetch:async id=>refunds.get(id)!,create:async(transaction,amount)=>{refundCalls++;const r:ProviderRefund={id:String(++serial),transaction,amount,domain:'test',currency:'NGN',status:'pending'};refunds.set(r.id,r);if(uncertain)throw new Error('provider accepted but response lost');return r;}};
   const ticket=async(late=false)=>{
    const order=await reserveOrder(db,buyer,{tierCode:'vip',quantity:1,buyerName:'Refund Buyer',idempotencyKey:randomUUID()},'test');
    const reference=order.payments[0].reference;values.set(reference,{id:String(++serial),reference,amount:order.totalMinor,currency:'NGN',domain:'test',status:'success',paid_at:new Date().toISOString(),customer:{email:buyer.email}});
    if(late){await db.order.update({where:{id:order.id},data:{expiresAt:new Date(Date.now()-1000)}});await expireReservations(db);}
    await verifyPayment(db,reference,buyer,{...gateway,initialize:async()=>''});return db.order.findUniqueOrThrow({where:{id:order.id},include:{payments:true,lines:{include:{tickets:true}}}});
   };
   const input=(o:{id:string;operationsRevision:number;status:'RESERVED'|'PAID'|'EXPIRED'|'CANCELLED'|'REFUNDED'},action:'FULFIL'|'REFUND'|'SYNC_REFUND'|'PREVIEW_REFUND',kind:'TICKET'|'MERCH'='TICKET',amount=10000000)=>operationInput.parse({kind,orderId:o.id,revision:o.operationsRevision,expectedStatus:o.status,action,reason:'Customer support reviewed payment',confirmed:true,...(action==='REFUND'?{refundAmountMinor:amount}:{})});
   await t.test('only organizers can resolve; late payment issuance has one winner',async()=>{
    const o=await ticket(true);assert.equal(o.status,'EXPIRED');assert.equal(o.needsReconciliation,true);
    await assert.rejects(()=>operatePayment(db,outsider,input(o,'FULFIL'),gateway),e=>e instanceof AppError&&e.status===403);
    const results=await Promise.allSettled([operatePayment(db,owner,input(o,'FULFIL'),gateway),operatePayment(db,owner,input(o,'FULFIL'),gateway)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const paid=await db.order.findUniqueOrThrow({where:{id:o.id},include:{lines:{include:{tickets:true}}}});assert.equal(paid.status,'PAID');assert.equal(paid.needsReconciliation,false);assert.equal(paid.lines[0].tickets.length,1);
    assert.equal(await db.outboxMessage.count({where:{deduplicationKey:'tickets:'+o.id}}),1);assert.equal(await db.auditLog.count({where:{entityId:o.id,action:'PAYMENT_RECONCILIATION_FULFILLED'}}),1);
   });
   await t.test('stock, mismatched amounts and provider refunds block automatic fulfilment',async()=>{
    const o=await ticket(true),tierId=o.lines[0].tierId,tier=await db.ticketTier.findUniqueOrThrow({where:{id:tierId}});await db.ticketTier.update({where:{id:tierId},data:{capacity:tier.sold+tier.reserved}});
    await assert.rejects(()=>operatePayment(db,owner,input(o,'FULFIL'),gateway),e=>e instanceof AppError&&e.code==='INSUFFICIENT_STOCK');assert.equal((await db.order.findUniqueOrThrow({where:{id:o.id}})).status,'EXPIRED');
    await db.ticketTier.update({where:{id:tierId},data:{capacity:30}});
    const original=values.get(o.payments[0].reference)!;values.set(original.reference,{...original,amount:1});await assert.rejects(()=>operatePayment(db,owner,input(o,'FULFIL'),gateway),e=>e instanceof AppError&&e.code==='PAYMENT_NOT_MATCHED');values.set(original.reference,original);
    refunds.set('12345',{id:'12345',transaction:String(original.id),amount:original.amount,currency:'NGN',domain:'test',status:'pending'});await assert.rejects(()=>operatePayment(db,owner,input(o,'FULFIL'),gateway),e=>e instanceof AppError&&e.code==='REFUND_REVIEW_REQUIRED');refunds.delete('12345');
   });
   await t.test('full refund freezes codes, sends once, and restores sold inventory only on processed status',async()=>{
    const o=await ticket(),stock=await db.ticketTier.findUniqueOrThrow({where:{id:o.lines[0].tierId}}),request=input(o,'REFUND');
    const preview=await operatePayment(db,owner,input(o,'PREVIEW_REFUND'),gateway);assert.ok('amountMinor' in preview&&preview.amountMinor===o.totalMinor);
    await assert.rejects(()=>operatePayment(db,owner,{...request,refundAmountMinor:1},gateway),e=>e instanceof AppError&&e.code==='PAYMENT_CHANGED');
    const before=refundCalls,results=await Promise.allSettled([operatePayment(db,owner,request,gateway),operatePayment(db,owner,request,gateway)]);assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(refundCalls,before+1);
    const refund=await db.paymentRefund.findUniqueOrThrow({where:{orderId:o.id}});assert.equal(refund.status,'pending');assert.equal((await db.ticket.findUniqueOrThrow({where:{id:o.lines[0].tickets[0].id}})).status,'VOID');assert.equal((await db.ticketTier.findUniqueOrThrow({where:{id:stock.id}})).sold,stock.sold);
    const mine=(await myOrders(db,buyer)).find(x=>x.id===o.id)!;assert.equal(mine.lines[0].tickets[0].code,null);assert.equal(mine.refund?.status,'pending');assert.ok(!('reason' in mine.refund!));
    refunds.set(refund.providerRefundId!,{...refunds.get(refund.providerRefundId!)!,status:'processed'});const current=await db.order.findUniqueOrThrow({where:{id:o.id}});
    await Promise.all([operatePayment(db,owner,input(current,'SYNC_REFUND'),gateway),operatePayment(db,owner,input(current,'SYNC_REFUND'),gateway)]);
    assert.equal((await db.order.findUniqueOrThrow({where:{id:o.id}})).status,'REFUNDED');assert.equal((await db.ticketTier.findUniqueOrThrow({where:{id:stock.id}})).sold,stock.sold-1);
    await verifyPayment(db,o.payments[0].reference,buyer,{...gateway,initialize:async()=>''});assert.equal((await db.order.findUniqueOrThrow({where:{id:o.id}})).needsReconciliation,false);assert.equal(refundCalls,before+1);
   });
   await t.test('uncertain accepted refund recovers by lookup without another create',async()=>{
    const o=await ticket();uncertain=true;const before=refundCalls;try{const result=await operatePayment(db,owner,input(o,'REFUND'),gateway);assert.ok('refundStatus' in result&&result.refundStatus==='UNKNOWN');}finally{uncertain=false;}
    const r=await db.paymentRefund.findUniqueOrThrow({where:{orderId:o.id}});assert.equal(r.providerRefundId,null);assert.equal(r.status,'UNKNOWN');
    const current=await db.order.findUniqueOrThrow({where:{id:o.id}});const result=await operatePayment(db,owner,input(current,'SYNC_REFUND'),gateway);assert.ok('refundStatus' in result&&result.refundStatus==='pending');assert.equal(refundCalls,before+1);
    await operatePayment(db,owner,input(current,'REFUND'),gateway);assert.equal(refundCalls,before+1);
   });
   await t.test('used tickets cannot be refunded and no provider request is made',async()=>{
    const o=await ticket(),code=(await myOrders(db,buyer)).find(x=>x.id===o.id)!.lines[0].tickets[0].code!;process.env.ADMISSION_MODE='test';assert.equal((await checkTicket(db,owner,code,true)).status,'ADMITTED');const before=refundCalls;
    await assert.rejects(()=>operatePayment(db,owner,input(o,'REFUND'),gateway),e=>e instanceof AppError&&e.code==='ALREADY_ADMITTED');assert.equal(refundCalls,before);assert.equal(await db.paymentRefund.count({where:{orderId:o.id}}),0);
   });
   await t.test('merch refund holds fulfilment and processed replay restores stock once',async()=>{
    const variant=await db.merchVariant.findFirstOrThrow({where:{product:{slug:'cap-2'}}});
    const order=await reserveMerch(db,buyer,{buyerName:'Refund Buyer',phone:'+2348000000000',fulfilment:'PICKUP',idempotencyKey:randomUUID(),items:[{variantId:variant.id,quantity:1}]},'test');const reference=order.payments[0].reference;
    values.set(reference,{id:String(++serial),reference,amount:order.totalMinor,currency:'NGN',domain:'test',status:'success',paid_at:new Date().toISOString(),customer:{email:buyer.email}});await verifyMerch(db,reference,buyer,{...gateway,initialize:async()=>''});
    const o=await db.merchOrder.findUniqueOrThrow({where:{id:order.id}});await operatePayment(db,owner,input(o,'REFUND','MERCH',o.totalMinor),gateway);
    const hold=await db.merchOrder.findUniqueOrThrow({where:{id:o.id}});await assert.rejects(()=>updateMerchFulfilment(db,owner,o.id,{revision:hold.revision,status:'READY',note:''}),e=>e instanceof AppError&&e.code==='ORDER_NOT_PAID');
    const r=await db.paymentRefund.findUniqueOrThrow({where:{merchOrderId:o.id}});refunds.set(r.providerRefundId!,{...refunds.get(r.providerRefundId!)!,status:'processed'});await operatePayment(db,owner,input(hold,'SYNC_REFUND','MERCH'),gateway);await operatePayment(db,owner,input(hold,'SYNC_REFUND','MERCH'),gateway);
    assert.equal((await db.merchVariant.findUniqueOrThrow({where:{id:variant.id}})).sold,variant.sold);await verifyMerch(db,reference,buyer,{...gateway,initialize:async()=>''});assert.equal((await db.merchOrder.findUniqueOrThrow({where:{id:o.id}})).needsReconciliation,false);
   });
   await t.test('failed and mismatched refund responses stay held without restocking',async()=>{
    const o=await ticket(),stock=await db.ticketTier.findUniqueOrThrow({where:{id:o.lines[0].tierId}});await operatePayment(db,owner,input(o,'REFUND'),gateway);
    const r=await db.paymentRefund.findUniqueOrThrow({where:{orderId:o.id}}),original=refunds.get(r.providerRefundId!)!;refunds.set(original.id,{...original,status:'failed'});const held=await db.order.findUniqueOrThrow({where:{id:o.id}});await operatePayment(db,owner,input(held,'SYNC_REFUND'),gateway);
    assert.equal((await db.ticketTier.findUniqueOrThrow({where:{id:stock.id}})).sold,stock.sold);assert.equal((await verifyPayment(db,o.payments[0].reference,buyer,{...gateway,initialize:async()=>''})).needsReconciliation,true);
    refunds.set(original.id,{...original,status:'processed',amount:1});await assert.rejects(()=>operatePayment(db,owner,input(held,'SYNC_REFUND'),gateway),e=>e instanceof AppError&&e.code==='REFUND_NOT_MATCHED');assert.equal((await db.order.findUniqueOrThrow({where:{id:o.id}})).status,'PAID');assert.equal((await db.ticketTier.findUniqueOrThrow({where:{id:stock.id}})).sold,stock.sold);
    refunds.set(original.id,{...original,status:'processed'});await operatePayment(db,owner,input(held,'SYNC_REFUND'),gateway);
   });
   await t.test('late refund does not release already-expired inventory twice; refund switch fails closed',async()=>{
    const o=await ticket(true),stock=await db.ticketTier.findUniqueOrThrow({where:{id:o.lines[0].tierId}});process.env.REFUNDS_ENABLED='false';try{await assert.rejects(()=>operatePayment(db,owner,input(o,'REFUND'),gateway),e=>e instanceof AppError&&e.code==='REFUNDS_DISABLED');assert.equal(await db.paymentRefund.count({where:{orderId:o.id}}),0);}finally{process.env.REFUNDS_ENABLED='true';}
    await operatePayment(db,owner,input(o,'REFUND'),gateway);const r=await db.paymentRefund.findUniqueOrThrow({where:{orderId:o.id}});refunds.set(r.providerRefundId!,{...refunds.get(r.providerRefundId!)!,status:'processed'});const held=await db.order.findUniqueOrThrow({where:{id:o.id}});await operatePayment(db,owner,input(held,'SYNC_REFUND'),gateway);const after=await db.ticketTier.findUniqueOrThrow({where:{id:stock.id}});assert.equal(after.sold,stock.sold);assert.equal(after.reserved,stock.reserved);
   });
   await t.test('a successful late payment on a cancelled order can be refunded without restoring stock twice',async()=>{
    const o=await ticket(true),cancelled=await db.order.update({where:{id:o.id},data:{status:'CANCELLED'}}),stock=await db.ticketTier.findUniqueOrThrow({where:{id:o.lines[0].tierId}});
    await operatePayment(db,owner,input(cancelled,'REFUND'),gateway);const r=await db.paymentRefund.findUniqueOrThrow({where:{orderId:o.id}});assert.equal(r.stockBasis,'NONE');refunds.set(r.providerRefundId!,{...refunds.get(r.providerRefundId!)!,status:'processed'});const held=await db.order.findUniqueOrThrow({where:{id:o.id}});await operatePayment(db,owner,input(held,'SYNC_REFUND'),gateway);const after=await db.ticketTier.findUniqueOrThrow({where:{id:stock.id}});assert.equal(after.reserved,stock.reserved);assert.equal(after.sold,stock.sold);
   });
   await t.test('delivered merch cannot refund; late merch can be accepted once',async()=>{
    const v=await db.merchVariant.findFirstOrThrow({where:{product:{slug:'satchel-1'}}});const base={buyerName:'Refund Buyer',phone:'+2348000000000',fulfilment:'PICKUP' as const,idempotencyKey:randomUUID(),items:[{variantId:v.id,quantity:1}]};
    const reserved=await reserveMerch(db,buyer,base,'test'),ref=reserved.payments[0].reference;values.set(ref,{id:String(++serial),reference:ref,amount:reserved.totalMinor,currency:'NGN',domain:'test',status:'success',paid_at:new Date().toISOString(),customer:{email:buyer.email}});await db.merchOrder.update({where:{id:reserved.id},data:{expiresAt:new Date(Date.now()-1000)}});await expireMerch(db);await verifyMerch(db,ref,buyer,{...gateway,initialize:async()=>''});
    const late=await db.merchOrder.findUniqueOrThrow({where:{id:reserved.id}});await operatePayment(db,owner,input(late,'FULFIL','MERCH'),gateway);const paid=await db.merchOrder.findUniqueOrThrow({where:{id:reserved.id}});
    await updateMerchFulfilment(db,owner,paid.id,{revision:paid.revision,status:'READY',note:'Ready'});await updateMerchFulfilment(db,owner,paid.id,{revision:paid.revision+1,status:'COMPLETED',note:'Collected'});
    const complete=await db.merchOrder.findUniqueOrThrow({where:{id:paid.id}}),before=refundCalls;await assert.rejects(()=>operatePayment(db,owner,input(complete,'REFUND','MERCH',complete.totalMinor),gateway),e=>e instanceof AppError&&e.code==='ALREADY_FULFILLED');assert.equal(refundCalls,before);
   });
   await t.test('signed refund webhook fetches current provider status and terminal charge replay cannot reopen order',async()=>{
    const o=await ticket();await operatePayment(db,owner,input(o,'REFUND'),gateway);const r=await db.paymentRefund.findUniqueOrThrow({where:{orderId:o.id}});const provider={...refunds.get(r.providerRefundId!)!,status:'processed' as const};
    const originalFetch=globalThis.fetch;let fetched=0;globalThis.fetch=async(url)=>{assert.equal(String(url),'https://api.paystack.co/refund/'+r.providerRefundId);fetched++;return Response.json({status:true,data:provider});};
    try{const webhook=await import('../../src/app/api/paystack/webhook/route');const body=JSON.stringify({event:'refund.processed',data:{transaction_reference:o.payments[0].reference,status:'processed'}}),signature=createHmac('sha512',process.env.PAYSTACK_SECRET_KEY!).update(body).digest('hex');assert.equal((await webhook.POST(new Request('http://localhost:3000/api/paystack/webhook',{method:'POST',headers:{'x-paystack-signature':'bad'},body}))).status,401);assert.equal(fetched,0);
     for(let i=0;i<2;i++)assert.equal((await webhook.POST(new Request('http://localhost:3000/api/paystack/webhook',{method:'POST',headers:{'x-paystack-signature':signature},body}))).status,200);assert.equal(fetched,1);
     const charge=JSON.stringify({event:'charge.success',data:{reference:o.payments[0].reference}}),chargeSignature=createHmac('sha512',process.env.PAYSTACK_SECRET_KEY!).update(charge).digest('hex');assert.equal((await webhook.POST(new Request('http://localhost:3000/api/paystack/webhook',{method:'POST',headers:{'x-paystack-signature':chargeSignature},body:charge}))).status,200);assert.equal((await db.order.findUniqueOrThrow({where:{id:o.id}})).needsReconciliation,false);
    }finally{globalThis.fetch=originalFetch;}
   });
   await t.test('dashboard redaction, filters and API session/origin boundaries',async()=>{
    await assert.rejects(()=>paymentOperations(db,outsider,{mode:'test',view:'all'}),e=>e instanceof AppError&&e.status===403);
    const listing=await paymentOperations(db,owner,{mode:'test',view:'attention',q:buyer.email});assert.ok(listing.orders.length>0);assert.ok(!JSON.stringify(listing).includes('authorizationUrl'));assert.ok(listing.orders.every(o=>o.buyerEmail===buyer.email));assert.equal((await paymentOperations(db,owner,{mode:'live',view:'all',q:buyer.email})).orders.length,0);
    const api=await import('../../src/app/api/admin/payments/route');assert.equal((await api.GET(new Request('http://localhost:3000/api/admin/payments'))).status,401);const cookie=`${cookieName('session')}=${await seal(owner,'session',3600)}`;
    assert.equal((await api.POST(new Request('http://localhost:3000/api/admin/payments',{method:'POST',headers:{cookie,origin:'https://attacker.example','content-type':'application/json'},body:'{}'}))).status,403);
    assert.equal((await api.POST(new Request('http://localhost:3000/api/admin/payments',{method:'POST',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({confirmed:true})}))).status,400);
   });
  });
  await t.test('automated shipping prices, quotes and historical orders',async t=>{
   const buyer={subject:'shipping-'+randomUUID(),email:'shipping@example.com'},other={subject:'shipping-other',email:'other-shipping@example.com'};
   const product=await db.merchProduct.findUniqueOrThrow({where:{slug:'tee-3'},include:{variants:{orderBy:{id:'asc'}}}}),variant=product.variants[0];
   const rate=await db.shippingRate.findFirstOrThrow({where:{eventSlug:concertSlug(),stateKey:'fct'}});
   const items=[{variantId:variant.id,quantity:1}],base={buyerName:'Shipping Buyer',phone:'+2348000000000',fulfilment:'DELIVERY' as const,address:{line1:'123 Test Road',city:'Abuja',state:'FCT',country:'Nigeria' as const},shippingRateId:rate.id,acceptDeliveryQuote:true as const,items};
   const delivery=async()=>createMerchQuote(db,buyer,{items,fulfilment:'DELIVERY',shippingRateId:rate.id});
   const input=(token:string)=>({...base,quoteToken:token,idempotencyKey:randomUUID()});
   await t.test('rates are organizer-only; duplicate state keys and concurrent updates are protected',async()=>{
    await assert.rejects(()=>shippingRates(db,other),e=>e instanceof AppError&&e.status===403);
    await assert.rejects(()=>configureShipping(db,other,{action:'create',state:'Test state',feeMinor:1,note:'Synthetic test service',enabled:true}),e=>e instanceof AppError&&e.status===403);
    await assert.rejects(()=>configureShipping(db,owner,{action:'create',state:' fct ',feeMinor:1,note:'Synthetic test service',enabled:true}),e=>e instanceof AppError&&e.code==='SHIPPING_RATE_EXISTS');
    const update={action:'update' as const,id:rate.id,revision:rate.revision,feeMinor:600000,note:'Synthetic test service updated',enabled:true};const results=await Promise.allSettled([configureShipping(db,owner,update),configureShipping(db,owner,{...update,feeMinor:700000})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const existing=(await myMerchOrders(db,{subject:'merch-buyer',email:'merch@example.com'})).find(o=>o.shippingSnapshot!==null)!;assert.equal(existing.shippingFeeMinor,500000);assert.equal((existing.shippingSnapshot as {revision:number}).revision,1);
    const foreign=await db.shippingRate.create({data:{eventSlug:'other-event',state:'FCT',stateKey:'fct',feeMinor:100000,note:'Synthetic foreign state',enabled:true}});
    await assert.rejects(()=>configureShipping(db,owner,{...update,id:foreign.id,revision:1}),e=>e instanceof AppError&&e.code==='SHIPPING_RATE_NOT_FOUND');await assert.rejects(()=>createMerchQuote(db,buyer,{items,fulfilment:'DELIVERY',shippingRateId:foreign.id}),e=>e instanceof AppError&&e.code==='DELIVERY_UNAVAILABLE');
   });
   await t.test('quotes bind buyer, cart, mode, purpose, destination and expiry without reserving stock',async()=>{
    const quote=await delivery(),before=await db.merchVariant.findUniqueOrThrow({where:{id:variant.id}});assert.equal(quote.totalMinor,quote.subtotalMinor+quote.shippingFeeMinor);assert.ok(quote.shippingFeeMinor>0);assert.equal(quote.subtotalMinor,5000000);
    const decoded=await unseal(quote.quoteToken,'merch-quote'),expired=await seal({...decoded},'merch-quote',-1),wrongPurpose=await seal({...decoded},'session',600);
    for(const invalid of [expired,wrongPurpose,quote.quoteToken.slice(0,-20)+(quote.quoteToken.at(-20)==='a'?'b':'a')+quote.quoteToken.slice(-19)])await assert.rejects(()=>reserveMerch(db,buyer,input(invalid),'test'),e=>e instanceof AppError&&e.code==='QUOTE_INVALID');
    await assert.rejects(()=>reserveMerch(db,other,input(quote.quoteToken),'test'),e=>e instanceof AppError&&e.code==='QUOTE_INVALID');await assert.rejects(()=>reserveMerch(db,buyer,{...input(quote.quoteToken),items:[{variantId:variant.id,quantity:2}]},'test'),e=>e instanceof AppError&&e.code==='QUOTE_INVALID');await assert.rejects(()=>reserveMerch(db,buyer,input(quote.quoteToken),'live'),e=>e instanceof AppError&&e.code==='QUOTE_INVALID');await assert.rejects(()=>reserveMerch(db,buyer,{...input(quote.quoteToken),address:{...base.address,state:'Lagos'}},'test'),e=>e instanceof AppError&&e.code==='QUOTE_INVALID');
    assert.equal((await db.merchVariant.findUniqueOrThrow({where:{id:variant.id}})).reserved,before.reserved);assert.equal(await db.merchOrder.count({where:{buyerSubject:buyer.subject}}),0);
   });
   await t.test('stale prices and rates roll back stock instead of changing an agreed total',async()=>{
    const quote=await delivery(),before=await db.merchVariant.findUniqueOrThrow({where:{id:variant.id}});await db.merchProduct.update({where:{id:product.id},data:{priceMinor:5000100}});
    await assert.rejects(()=>reserveMerch(db,buyer,input(quote.quoteToken),'test'),e=>e instanceof AppError&&e.code==='QUOTE_CHANGED');assert.equal((await db.merchVariant.findUniqueOrThrow({where:{id:variant.id}})).reserved,before.reserved);await db.merchProduct.update({where:{id:product.id},data:{priceMinor:5000000}});
    const current=await db.shippingRate.findUniqueOrThrow({where:{id:rate.id}});await configureShipping(db,owner,{action:'update',id:rate.id,revision:current.revision,feeMinor:800000,note:current.note,enabled:true});await assert.rejects(()=>reserveMerch(db,buyer,input(quote.quoteToken),'test'),e=>e instanceof AppError&&e.code==='QUOTE_CHANGED');assert.equal(await db.merchOrder.count({where:{buyerSubject:buyer.subject}}),0);
   });
   await t.test('checkout and payment validation include shipping; full refunds include it once',async()=>{
    const quote=await delivery(),payload=input(quote.quoteToken);let initialized=0;const data:Verification={id:'9950000001',reference:'',amount:quote.totalMinor,currency:'NGN',domain:'test',status:'success',paid_at:new Date().toISOString(),customer:{email:buyer.email}};
    const gateway:Gateway={domain:'test',initialize:async args=>{initialized++;assert.equal(args.amount,quote.totalMinor);data.reference=args.reference;return 'https://checkout.paystack.com/shipping-test';},verify:async()=>data};
    const checkout=await merchCheckout(db,buyer,payload,gateway);assert.equal(checkout.totalMinor,5800000);const current=await db.merchOrder.findUniqueOrThrow({where:{id:checkout.orderId},include:{payments:true}});assert.equal(current.shippingFeeMinor,800000);assert.equal(current.payments[0].amountMinor,5800000);
    const rateBeforeClose=await db.shippingRate.findUniqueOrThrow({where:{id:rate.id}});await configureShipping(db,owner,{action:'update',id:rate.id,revision:rateBeforeClose.revision,feeMinor:900000,note:rateBeforeClose.note,enabled:false});
    assert.equal((await merchCheckout(db,buyer,payload,gateway)).orderId,current.id);assert.equal(initialized,1);await assert.rejects(()=>reserveMerch(db,buyer,{...payload,idempotencyKey:randomUUID()},'test'),e=>e instanceof AppError&&e.code==='DELIVERY_UNAVAILABLE');
    await verifyMerch(db,data.reference,buyer,gateway);const paid=await db.merchOrder.findUniqueOrThrow({where:{id:current.id}}),sold=await db.merchVariant.findUniqueOrThrow({where:{id:variant.id}});let refundAmount=0;
    const refunds:RefundGateway={domain:'test',verify:async()=>data,list:async()=>[],fetch:async()=>{throw new Error('unexpected fetch');},create:async(transaction,amount)=>{refundAmount=amount;return {id:'9950000100',transaction,amount,domain:'test',currency:'NGN',status:'processed'};}};
    await operatePayment(db,owner,{kind:'MERCH',orderId:paid.id,revision:paid.operationsRevision,expectedStatus:'PAID',action:'REFUND',refundAmountMinor:5800000,reason:'Synthetic shipping refund',confirmed:true},refunds);assert.equal(refundAmount,5800000);assert.equal((await db.merchVariant.findUniqueOrThrow({where:{id:variant.id}})).sold,sold.sold-1);
    const after=await db.shippingRate.findUniqueOrThrow({where:{id:rate.id}});await configureShipping(db,owner,{action:'update',id:rate.id,revision:after.revision,feeMinor:500000,note:after.note,enabled:true});
   });
   await t.test('subtotal-only payment is held and cannot fulfil a shipping order',async()=>{
    const identity={subject:'underpaid-shipping',email:buyer.email},q=await createMerchQuote(db,identity,{items,fulfilment:'DELIVERY',shippingRateId:rate.id}),o=await reserveMerch(db,identity,{...input(q.quoteToken),buyerName:'Underpaid Shipping'},'test');
    const ref=o.payments[0].reference,gateway:Gateway={domain:'test',initialize:async()=>'',verify:async()=>({id:'9950000002',reference:ref,amount:q.subtotalMinor,currency:'NGN',domain:'test',status:'success',paid_at:new Date().toISOString(),customer:{email:buyer.email}})};
    const result=await verifyMerch(db,ref,identity,gateway);assert.equal(result.needsReconciliation,true);assert.equal((await db.merchOrder.findUniqueOrThrow({where:{id:o.id}})).status,'RESERVED');
   });
   await t.test('pickup is free, an explicitly free rate is supported, and historical delivery remains separate',async()=>{
    const pickup=await createMerchQuote(db,buyer,{items,fulfilment:'PICKUP'});assert.equal(pickup.shippingFeeMinor,0);assert.equal(pickup.totalMinor,pickup.subtotalMinor);
    const free=await configureShipping(db,owner,{action:'create',state:'Synthetic free region',feeMinor:0,note:'Synthetic explicit free delivery service',enabled:true});const freeQuote=await createMerchQuote(db,buyer,{items,fulfilment:'DELIVERY',shippingRateId:free.id});assert.equal(freeQuote.shippingFeeMinor,0);
    const identity={subject:'legacy-delivery',email:'legacy@example.com'},v=product.variants[1];await db.merchVariant.update({where:{id:v.id},data:{reserved:{increment:1}}});
    const legacy=await db.merchOrder.create({data:{eventSlug:concertSlug(),idempotencyKey:randomUUID(),requestHash:'legacy',buyerSubject:identity.subject,buyerName:'Legacy Buyer',buyerEmail:identity.email,phone:'+2348000000000',fulfilment:'DELIVERY',address:base.address,deliveryTerms:'Delivery is quoted and charged separately after purchase.',totalMinor:5000000,expiresAt:new Date(Date.now()+60000),lines:{create:{variantId:v.id,productName:product.name,variantLabel:v.label,quantity:1,unitPriceMinor:5000000}},payments:{create:{reference:'merch-'+randomUUID().replaceAll('-',''),amountMinor:5000000,currency:'NGN',domain:'test'}}},include:{payments:true}});
    await verifyMerch(db,legacy.payments[0].reference,identity,{domain:'test',initialize:async()=>'',verify:async ref=>({id:'9950000003',reference:ref,amount:5000000,currency:'NGN',domain:'test',status:'success',paid_at:new Date().toISOString(),customer:{email:identity.email}})});
    const stored=(await myMerchOrders(db,identity))[0];assert.equal(stored.shippingFeeMinor,0);assert.equal(stored.shippingSnapshot,null);assert.ok(stored.deliveryTerms?.includes('separately'));assert.equal(stored.totalMinor,5000000);
   });
   await t.test('quote and rate endpoints enforce sessions, origin and strict amount-free bodies',async()=>{
    const rates=await import('../../src/app/api/admin/merch/shipping/route'),quotes=await import('../../src/app/api/merch/quote/route');assert.equal((await rates.GET(new Request('http://localhost:3000/api/admin/merch/shipping'))).status,401);
    const cookie=`${cookieName('session')}=${await seal(buyer,'session',3600)}`,body={items,fulfilment:'PICKUP'};
    assert.equal((await quotes.POST(new Request('http://localhost:3000/api/merch/quote',{method:'POST',headers:{cookie,origin:'https://attacker.example','content-type':'application/json'},body:JSON.stringify(body)}))).status,403);
    assert.equal((await quotes.POST(new Request('http://localhost:3000/api/merch/quote',{method:'POST',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({...body,shippingFeeMinor:0})}))).status,400);
   });
  });
  await t.test('table bookings, parking lifecycle and organizer management',async t=>{
   process.env.CONCERT_EVENT_SLUG='tables-integration';process.env.TICKET_SALES_ENABLED='true';process.env.ADMISSION_MODE='test';process.env.REFUNDS_ENABLED='true';
   const event=await db.event.create({data:{slug:concertSlug(),name:'Table test',dateLocal:'2026-12-20',salesEnabled:true}});
   for(const p of tablePackages)await db.ticketTier.create({data:{eventId:event.id,...p,capacity:0}});
   await db.tableInventory.create({data:{eventId:event.id}});
   const config={revision:1,parkingCapacity:20,packages:tablePackages.map(p=>({code:p.code,capacity:10,active:true,parkingPerTable:2}))};
   const buyer={subject:'table-buyer',email:'table@example.com'};
   const payload=()=>({tierCode:'engines' as const,quantity:1,buyerName:'Table Buyer',idempotencyKey:randomUUID(),expectedParkingPerTable:2,acceptTableTerms:true as const});
   let transaction=70000;const transactionIds=new Map<string,number>();
   function gateway(order:Awaited<ReturnType<typeof reserveOrder>>):Gateway {if(!transactionIds.has(order.id))transactionIds.set(order.id,++transaction);return {domain:'test',initialize:async args=>{assert.equal(args.amount,300000000);return 'https://checkout.paystack.com/table-test';},verify:async()=>({id:transactionIds.get(order.id)!,status:'success',reference:order.payments[0].reference,amount:order.totalMinor,currency:'NGN',domain:'test',customer:{email:order.buyerEmail},paid_at:new Date().toISOString()})};}
   await t.test('table sales are closed until parking configured; admin permissions and revisions apply',async()=>{
    assert.equal((await ticketCatalog(db)).tables.find(p=>p.code==='engines')!.name,'Engines');
    await assert.rejects(()=>reserveOrder(db,buyer,payload(),'test'),e=>e instanceof AppError&&e.code==='TIER_CLOSED');
    await assert.rejects(()=>configureTables(db,outsider,config),e=>e instanceof AppError&&e.status===403);
    await configureTables(db,owner,config);
    await assert.rejects(()=>configureTables(db,owner,config),e=>e instanceof AppError&&e.code==='STALE_REVISION');
    assert.ok((await ticketCatalog(db)).tables.every(p=>p.available));
   });
   let first:Awaited<ReturnType<typeof reserveOrder>>;
   await t.test('one table holds stock and captured parking, retries once and rejects stale allocation',async()=>{
    const input=payload();first=await reserveOrder(db,buyer,input,'test');assert.equal(first.totalMinor,300000000);assert.equal(first.lines[0].parkingQuantity,2);
    assert.equal((await reserveOrder(db,buyer,input,'test')).id,first.id);assert.equal((await db.tableInventory.findUniqueOrThrow({where:{eventId:event.id}})).parkingReserved,2);
    await assert.rejects(()=>reserveOrder(db,buyer,{...payload(),expectedParkingPerTable:3},'test'),e=>e instanceof AppError&&e.code==='TABLE_ALLOCATION_CHANGED');
    assert.equal(await db.parkingPass.count({where:{line:{orderId:first.id}}}),0);
    const current=await db.tableInventory.findUniqueOrThrow({where:{eventId:event.id}});await configureTables(db,owner,{...config,revision:current.revision,packages:config.packages.map(p=>({...p,parkingPerTable:3}))});
    assert.equal((await reserveOrder(db,buyer,input,'test')).lines[0].parkingQuantity,2);
   });
   await t.test('verified payment issues private parking passes once, with no individual admission tickets',async()=>{
    const g=gateway(first!);await verifyPayment(db,first!.payments[0].reference,buyer,g);await verifyPayment(db,first!.payments[0].reference,buyer,g);
    const stored=(await myOrders(db,buyer))[0];assert.equal(stored.status,'PAID');assert.equal(stored.lines[0].tickets.length,0);assert.equal(stored.lines[0].parkingPasses.length,2);assert.ok(stored.lines[0].parkingPasses[0].code!.startsWith('park_'));
    assert.equal((await db.tableInventory.findUniqueOrThrow({where:{eventId:event.id}})).parkingReserved,0);assert.equal((await db.tableInventory.findUniqueOrThrow({where:{eventId:event.id}})).parkingSold,2);
    assert.deepEqual(await myOrders(db,outsider),[]);assert.equal(await db.outboxMessage.count({where:{deduplicationKey:`tickets:${first!.id}`}}),0);
   });
   await t.test('assignment is buyer-visible, organizer-only, revision guarded and token-free',async()=>{
    const a={action:'assign' as const,orderId:first!.id,revision:1,tableLabel:'e1',note:'Synthetic confirmed seating note'};
    await assert.rejects(()=>assignTable(db,outsider,a),e=>e instanceof AppError&&e.status===403);await assignTable(db,owner,a);
    await assert.rejects(()=>assignTable(db,owner,a),e=>e instanceof AppError&&e.code==='STALE_REVISION');
    const stored=(await myOrders(db,buyer))[0];assert.equal(stored.tableLabel,'E1');assert.equal(stored.bookingNote,a.note);
    const listing=await tableOverview(db,owner,{mode:'test'});assert.equal(listing.orders.length,1);assert.ok(!JSON.stringify(listing).includes('encryptedToken'));assert.ok(!JSON.stringify(listing).includes('park_'));assert.equal((await tableOverview(db,owner,{mode:'live'})).orders.length,0);
   });
   await t.test('parking rejects nonstaff and wrong payment mode and admits exactly once without concert admission',async()=>{
    const code=(await myOrders(db,buyer))[0].lines[0].parkingPasses[0].code!;
    await assert.rejects(()=>checkParking(db,outsider,code),e=>e instanceof AppError&&e.status===403);
    process.env.ADMISSION_MODE='live';assert.equal((await checkParking(db,owner,code)).status,'WRONG_MODE');process.env.ADMISSION_MODE='test';
    assert.equal((await checkParking(db,owner,code)).status,'READY');
    const results=await Promise.all([checkParking(db,owner,code,true),checkParking(db,owner,code,true)]);assert.equal(results.filter(r=>r.status==='ADMITTED').length,1);assert.equal(results.filter(r=>r.status==='USED').length,1);assert.equal(await db.admission.count({where:{ticket:{line:{orderId:first!.id}}}}),0);
    const o=await db.order.findUniqueOrThrow({where:{id:first!.id}});const g=gateway(first!);const refunds:RefundGateway={domain:'test',verify:g.verify,list:async()=>[],fetch:async()=>{throw new Error('unused');},create:async()=>{throw new Error('must not send');}};
    await assert.rejects(()=>operatePayment(db,owner,{kind:'TICKET',orderId:o.id,revision:o.operationsRevision,expectedStatus:'PAID',action:'REFUND',refundAmountMinor:o.totalMinor,reason:'Synthetic used parking refund',confirmed:true},refunds),e=>e instanceof AppError&&e.code==='ALREADY_ADMITTED');
   });
   await t.test('expiry releases parking once and late reconciliation reacquires captured capacity',async()=>{
    const expired=await reserveOrder(db,{subject:'table-expiry',email:buyer.email},{...payload(),expectedParkingPerTable:3},'test');await db.order.update({where:{id:expired.id},data:{expiresAt:new Date(Date.now()-1000)}});
    await expireReservations(db);await expireReservations(db);assert.equal((await db.tableInventory.findUniqueOrThrow({where:{eventId:event.id}})).parkingReserved,0);
    const g=gateway(expired);await verifyPayment(db,expired.payments[0].reference,undefined,g);const o=await db.order.findUniqueOrThrow({where:{id:expired.id}});
    const refunds:RefundGateway={domain:'test',verify:g.verify,list:async()=>[],fetch:async()=>{throw new Error('unused');},create:async()=>{throw new Error('unused');}};
    await operatePayment(db,owner,{kind:'TICKET',orderId:o.id,revision:o.operationsRevision,expectedStatus:'EXPIRED',action:'FULFIL',reason:'Synthetic late table payment',confirmed:true},refunds);
    assert.equal(await db.parkingPass.count({where:{line:{orderId:o.id}}}),3);assert.equal((await db.tableInventory.findUniqueOrThrow({where:{eventId:event.id}})).parkingSold,5);
   });
   await t.test('full refund voids parking immediately and restocks once after provider confirms',async()=>{
    const identity={subject:'table-refund',email:buyer.email};const o=await reserveOrder(db,identity,{...payload(),expectedParkingPerTable:3},'test');const payment=gateway(o);let data:Verification;const stable:Gateway={...payment,verify:async()=>data??(data=await payment.verify(o.payments[0].reference))};await verifyPayment(db,o.payments[0].reference,identity,stable);
    const code=(await myOrders(db,identity))[0].lines[0].parkingPasses[0].code!,paid=await db.order.findUniqueOrThrow({where:{id:o.id}});let creates=0;let provider:ProviderRefund;
    const refunds:RefundGateway={domain:'test',verify:stable.verify,list:async()=>provider?[provider]:[],fetch:async()=>provider,create:async(id,amount)=>{creates++;return provider={id:'901',transaction:id,amount,currency:'NGN',domain:'test',status:'pending'};}};
    await operatePayment(db,owner,{kind:'TICKET',orderId:o.id,revision:paid.operationsRevision,expectedStatus:'PAID',action:'REFUND',refundAmountMinor:o.totalMinor,reason:'Synthetic unused table refund',confirmed:true},refunds);
    assert.equal((await checkParking(db,owner,code)).status,'VOID');assert.equal((await myOrders(db,identity))[0].lines[0].parkingPasses[0].code,null);
    provider={...provider!,status:'processed'};const held=await db.order.findUniqueOrThrow({where:{id:o.id}});const input={kind:'TICKET' as const,orderId:o.id,revision:held.operationsRevision,expectedStatus:'PAID' as const,action:'SYNC_REFUND' as const,reason:'Synthetic refund sync',confirmed:true as const};await operatePayment(db,owner,input,refunds);await operatePayment(db,owner,input,refunds);assert.equal(creates,1);assert.equal((await db.tableInventory.findUniqueOrThrow({where:{eventId:event.id}})).parkingSold,5);
   });
   await t.test('parking capacity cannot undershoot allocations or oversell between categories',async()=>{
    const current=await db.tableInventory.findUniqueOrThrow({where:{eventId:event.id}});
    await assert.rejects(()=>configureTables(db,owner,{...config,revision:current.revision,parkingCapacity:4}),e=>e instanceof AppError&&e.code==='PARKING_CAPACITY_IN_USE');
    await configureTables(db,owner,{...config,revision:current.revision,parkingCapacity:7});
    const results=await Promise.allSettled([reserveOrder(db,{subject:'table-last-1',email:buyer.email},payload(),'test'),reserveOrder(db,{subject:'table-last-2',email:buyer.email},{...payload(),tierCode:'autobots'},'test')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   });
   await t.test('table arrival is one-time and prevents automated refunds; assignment labels are unique',async()=>{
    const second=(await db.order.findMany({where:{eventId:event.id,status:'PAID',id:{not:first!.id}}}))[0];
    await assert.rejects(()=>assignTable(db,owner,{action:'assign',orderId:second.id,revision:1,tableLabel:'e1',note:''}),e=>e instanceof AppError&&e.code==='TABLE_ALREADY_ASSIGNED');
    await assignTable(db,owner,{action:'arrive',orderId:second.id,revision:1,confirmed:true});
    await assert.rejects(()=>assignTable(db,owner,{action:'arrive',orderId:second.id,revision:2,confirmed:true}),e=>e instanceof AppError&&e.code==='ALREADY_ARRIVED');
    const full=await db.order.findUniqueOrThrow({where:{id:second.id},include:{lines:{include:{tier:true}},payments:true}}),g=gateway(full);
    const refunds:RefundGateway={domain:'test',verify:g.verify,list:async()=>[],fetch:async()=>{throw new Error('unused');},create:async()=>{throw new Error('must not send');}};
    await assert.rejects(()=>operatePayment(db,owner,{kind:'TICKET',orderId:second.id,revision:second.operationsRevision,expectedStatus:'PAID',action:'REFUND',refundAmountMinor:second.totalMinor,reason:'Synthetic used table refund',confirmed:true},refunds),e=>e instanceof AppError&&e.code==='ALREADY_ADMITTED');
   });
   await t.test('table and parking APIs reject missing session, foreign origins and forged settings',async()=>{
    const api=await import('../../src/app/api/admin/tables/route'),settings=await import('../../src/app/api/admin/tables/settings/route'),scan=await import('../../src/app/api/parking/admit/route');
    assert.equal((await api.GET(new Request('http://localhost:3000/api/admin/tables'))).status,401);
    const cookie=`${cookieName('session')}=${await seal(owner,'session',3600)}`;
    assert.equal((await settings.PATCH(new Request('http://localhost:3000/api/admin/tables/settings',{method:'PATCH',headers:{cookie,origin:'https://attacker.example','content-type':'application/json'},body:JSON.stringify(config)}))).status,403);
    assert.equal((await scan.POST(new Request('http://localhost:3000/api/parking/admit',{method:'POST',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({token:'a'.repeat(43)})}))).status,400);
   });
  });
  await t.test('persistent account quota blocks the 61st request',async()=>{for(let i=0;i<60;i++) await rateLimit(db,'quota-test');await assert.rejects(()=>rateLimit(db,'quota-test'),e=>e instanceof AppError&&e.status===429);});
 }finally{
  await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();
 }
});
