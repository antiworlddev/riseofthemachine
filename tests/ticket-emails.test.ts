import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resendGateway,type EmailPayload} from '../src/server/ticket-emails';
test('Resend adapter passes stable idempotency and attachments without exposing provider errors',async()=>{
 const previous=globalThis.fetch;process.env.RESEND_API_KEY='re_mock_only';
 const payload:EmailPayload={from:'tickets@example.com',to:['buyer@example.com'],subject:'Tickets',html:'<p>Ticket</p>',text:'Ticket',attachments:[{filename:'ticket-1.png',content:'mock'}]};
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal((options!.headers as Record<string,string>)['Idempotency-Key'],'ticket-email:mock');assert.deepEqual(JSON.parse(options!.body as string),payload);return Response.json({id:'mock-id'});};
  assert.equal(await resendGateway(payload,'ticket-email:mock'),'mock-id');
  globalThis.fetch=async()=>new Response('private provider response',{status:429});await assert.rejects(()=>resendGateway(payload,'ticket-email:mock'),e=>e instanceof Error&&e.message==='PROVIDER_HTTP_429');
  globalThis.fetch=async()=>Response.json({unexpected:'private'});await assert.rejects(()=>resendGateway(payload,'ticket-email:mock'),e=>e instanceof Error&&e.message==='INVALID_PROVIDER_RESPONSE');
 }finally{globalThis.fetch=previous;}
});
