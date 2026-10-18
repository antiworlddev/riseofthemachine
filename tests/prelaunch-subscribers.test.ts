import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signupInput,subscriberOrigin,subscriberWhere,unsubscribeToken,verifyUnsubscribeToken} from '../src/server/subscribers';
import {heldPath,requirePublicLaunch} from '../src/server/site-mode';
import {reserveOrder} from '../src/server/ticketing';
import {reserveMerch} from '../src/server/merch';
import {createMerchQuote} from '../src/server/shipping';
import {requireRegistrationOpen} from '../src/server/config';
import type {PrismaClient} from '@prisma/client';
const identity={subject:'test',email:'test@example.com'},client={} as PrismaClient;
test('prelaunch fails closed; commerce and registration services cannot be bypassed by calling them directly',async()=>{
 const previous=process.env.SITE_MODE;delete process.env.SITE_MODE;
 try{
 assert.throws(()=>requirePublicLaunch(),{code:'PRELAUNCH'});
 assert.throws(()=>requireRegistrationOpen(),{code:'PRELAUNCH'});
 await assert.rejects(()=>reserveOrder(client,identity,{} as never,'test'),{code:'PRELAUNCH'});
 await assert.rejects(()=>reserveMerch(client,identity,{} as never,'test'),{code:'PRELAUNCH'});
 await assert.rejects(()=>createMerchQuote(client,identity,{} as never,'test'),{code:'PRELAUNCH'});
 for(const p of ['/tickets','/merch','/kala-games','/kala-games/fixtures','/api/tickets/checkout','/api/merch/quote','/api/kala/teams','/api/kala/rosters/a/submit'])assert.equal(heldPath(p),true,p);
 for(const p of ['/','/admin','/api/admin/tickets/settings','/api/auth/callback','/api/paystack/webhook','/api/jobs/ticket-emails','/tickets/orders','/tickets/confirmation','/api/tickets/verify','/api/merch/orders','/api/kala/representative'])assert.equal(heldPath(p),false,p);
 process.env.SITE_MODE='live';requirePublicLaunch();assert.equal(heldPath('/api/tickets/checkout'),false);
 }finally{if(previous===undefined)delete process.env.SITE_MODE;else process.env.SITE_MODE=previous;}
});
test('signup validates explicit newsletter consent, normalizes email and rejects forged status',()=>{
 const base={firstName:'  Fan  ',email:' FAN@EXAMPLE.COM ',source:'waitlist',newsletter:false};
 assert.deepEqual(signupInput.parse(base),{firstName:'Fan',email:'fan@example.com',source:'waitlist',newsletter:false,website:''});
 assert.equal(signupInput.safeParse({...base,source:'newsletter'}).success,false);
 assert.equal(signupInput.safeParse({...base,source:'newsletter',newsletter:true}).success,true);
 for(const bad of [{...base,firstName:'\n'},{...base,email:'bad'},{...base,newsletter:'true'},{...base,subscribed:true}])assert.equal(signupInput.safeParse(bad).success,false);
 assert.deepEqual(subscriberWhere('newsletter'),{newsletterAt:{not:null},unsubscribedAt:null,mailjetSuppressedAt:null});
 assert.deepEqual(subscriberWhere('waitlist'),{waitlistAt:{not:null},waitlistUnsubscribedAt:null,mailjetSuppressedAt:null});
});
test('signup origin works without auth provider configuration and rejects foreign or missing origins',()=>{
 const prev=process.env.APP_ORIGIN;process.env.APP_ORIGIN='https://riseofthemachine.live';
 try{const req=(origin?:string)=>new Request('https://riseofthemachine.live/api/subscribers',{headers:origin?{origin}:{}});subscriberOrigin(req(process.env.APP_ORIGIN));assert.throws(()=>subscriberOrigin(req()));assert.throws(()=>subscriberOrigin(req('https://foreign.example')));}finally{if(prev===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=prev;}
});
test('unsubscribe links are authenticated, purpose-bound, stable and require a configured key',()=>{
 const previous=process.env.SUBSCRIBER_TOKEN_KEY;process.env.SUBSCRIBER_TOKEN_KEY='d'.repeat(64);
 try{const id='e324e177-7568-48a9-a024-bdeee8002cab',token=unsubscribeToken(id);assert.equal(verifyUnsubscribeToken(token),id);assert.throws(()=>verifyUnsubscribeToken(token.slice(0,-1)+(token.endsWith('a')?'b':'a')));assert.throws(()=>verifyUnsubscribeToken(token.replace(id,'e324e177-7568-48a9-a024-bdeee8002cac')));delete process.env.SUBSCRIBER_TOKEN_KEY;assert.throws(()=>unsubscribeToken(id));}finally{if(previous===undefined)delete process.env.SUBSCRIBER_TOKEN_KEY;else process.env.SUBSCRIBER_TOKEN_KEY=previous;}
});
