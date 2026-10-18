import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Subscriber,PrismaClient} from '@prisma/client';
import {mailjetConfig,syncMailjetContact,syncMailjet,mailjetRequest,authorizeMailjetWebhook,MailjetError,type MailjetRequest} from '../src/server/mailjet';
const env={MAILJET_API_KEY:'unit-key',MAILJET_SECRET_KEY:'unit-secret',MAILJET_WAITLIST_LIST_ID:'123',MAILJET_NEWSLETTER_LIST_ID:'456',APP_ORIGIN:'https://riseofthemachine.live',SUBSCRIBER_TOKEN_KEY:'a'.repeat(64)};Object.assign(process.env,env);
const fan={id:'f39bf6fb-ab77-461f-aa9e-6b276a303bb2',email:'fan@example.com',firstName:'Fan',waitlistAt:new Date(),newsletterAt:null,waitlistUnsubscribedAt:null,unsubscribedAt:null,mailjetSuppressedAt:null} as Subscriber;
test('Mailjet uses distinct lists, explicit newsletter consent and first-name properties; never forces provider opt-ins',async()=>{
 const calls:{path:string;method:string;body:Record<string,unknown>|undefined}[]=[];
 const request:MailjetRequest=async(path,method,body)=>{calls.push({path,method,body:body as Record<string,unknown>|undefined});return method==='POST'?[body as Record<string,unknown>]:[{IsUnsubscribed:false,ListID:123,ContactID:789}];};
 assert.deepEqual(await syncMailjetContact(fan,Date.now()+10000,request),{waitlistOptOut:false,newsletterOptOut:false});assert.equal(calls.length,2);assert.equal(calls[0].body?.Action,'addnoforce');assert.ok(calls[0].path.includes('/123/'));assert.equal((calls[0].body?.Properties as Record<string,string>).rotm_first_name,'Fan');assert.ok((calls[0].body?.Properties as Record<string,string>).rotm_unsubscribe_url.startsWith(env.APP_ORIGIN));assert.equal(calls.some(c=>c.path.includes('/456/')),false);
 const unsubCalls:Record<string,unknown>[]=[];await syncMailjetContact({...fan,newsletterAt:new Date(),unsubscribedAt:new Date(),waitlistAt:null},Date.now()+10000,async(_p,m,b)=>{if(m==='POST'){unsubCalls.push(b as Record<string,unknown>);return [b as Record<string,unknown>];}return [{IsUnsubscribed:true,ListID:456,ContactID:789}];});assert.equal(unsubCalls[0].Action,'unsub');
 const suppressed:Record<string,unknown>[]=[];await syncMailjetContact({...fan,mailjetSuppressedAt:new Date()},Date.now()+10000,async(_p,m,b)=>{if(m==='POST'){suppressed.push(b as Record<string,unknown>);return [b as Record<string,unknown>];}return [{IsUnsubscribed:true,ListID:123,ContactID:789}];});assert.equal(suppressed[0].Action,'unsub');
 await assert.rejects(()=>syncMailjetContact(fan,Date.now()+10000,async()=>[{JobID:123}]),e=>e instanceof MailjetError&&e.code==='MAILJET_INVALID_RESPONSE');
});
test('Mailjet API authenticates server-side, rejects redirects/provider failures and never exposes raw provider errors',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async(input,init)=>{calls++;assert.ok(String(input).startsWith('https://api.mailjet.com/v3/REST/'));assert.equal((init?.headers as Record<string,string>).authorization,'Basic '+Buffer.from('unit-key:unit-secret').toString('base64'));assert.equal(init?.redirect,'error');return Response.json({Data:[{Name:'ok'}]});};assert.equal((await mailjetRequest('contactmetadata','GET'))[0].Name,'ok');
 globalThis.fetch=async()=>new Response('secret provider body',{status:403});await assert.rejects(()=>mailjetRequest('contactmetadata','GET'),e=>e instanceof MailjetError&&e.message==='MAILJET_HTTP_403');
 globalThis.fetch=async()=>Response.json({Data:[{}]});await assert.rejects(()=>mailjetRequest('x','GET',undefined,Date.now()-1),e=>e instanceof MailjetError&&e.code==='MAILJET_DEADLINE');assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('Mailjet jobs are disabled by default and webhook authorization fails before any body/database work',async()=>{
 delete process.env.MAILJET_ENABLED;assert.deepEqual(await syncMailjet({} as PrismaClient),{synced:0,retrying:0});
 process.env.MAILJET_WEBHOOK_SECRET='e'.repeat(64);const req=(auth?:string)=>new Request('https://riseofthemachine.live/api/mailjet/webhook',{headers:auth?{authorization:auth}:{}});
 assert.throws(()=>authorizeMailjetWebhook(req()));assert.throws(()=>authorizeMailjetWebhook(req('Bearer '+process.env.MAILJET_WEBHOOK_SECRET)));authorizeMailjetWebhook(req('Basic '+Buffer.from('mailjet:'+process.env.MAILJET_WEBHOOK_SECRET).toString('base64')));
 process.env.MAILJET_NEWSLETTER_LIST_ID='123';assert.throws(()=>mailjetConfig());process.env.MAILJET_NEWSLETTER_LIST_ID='456';
});
