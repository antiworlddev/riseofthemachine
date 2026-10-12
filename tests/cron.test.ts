import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runCron} from '../src/server/cron';
test('cron gate fails closed before executing jobs, accepts only bearer secret and returns no-store counts',async()=>{
 const original=process.env.CRON_SECRET;let calls=0;
 const action=async()=>{calls++;return {sent:1,retrying:0,blocked:0};};
 const request=(headers?:HeadersInit)=>new Request('https://example.com/api/jobs/ticket-emails?secret='+ 'a'.repeat(64),{headers});
 try{
  delete process.env.CRON_SECRET;assert.equal((await runCron(request(),action)).status,503);
  process.env.CRON_SECRET='short';assert.equal((await runCron(request(),action)).status,503);
  process.env.CRON_SECRET='a'.repeat(64);
  const rejected:(HeadersInit|undefined)[]=[undefined,{authorization:'Bearer wrong'},{authorization:'a'.repeat(64)},{cookie:'admin=true'}];
  for(const headers of rejected)assert.equal((await runCron(request(headers),action)).status,401);
  assert.equal(calls,0);
  const response=await runCron(request({authorization:'Bearer '+process.env.CRON_SECRET}),action);
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{sent:1,retrying:0,blocked:0});assert.equal(calls,1);
 }finally{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;}
});

import {cronConfig} from '../scripts/setup-cron';
import {emailBatchSize} from '../src/server/job-settings';
test('cron setup preserves custom config and switches only managed schedules',()=>{
 const original={buildCommand:'custom build',headers:[{source:'/x'}],crons:[{path:'/custom-job',schedule:'0 5 * * *'},{path:'/api/jobs/ticket-emails',schedule:'0 1 * * *'}]};
 const daily=cronConfig(original,'daily');assert.equal(daily.buildCommand,original.buildCommand);assert.deepEqual(daily.headers,original.headers);assert.equal(daily.crons.length,4);assert.equal(daily.crons[0].path,'/custom-job');assert.ok(daily.crons.slice(1).every(c=>/^\d+ \d+ \* \* \*$/.test(c.schedule)));
 assert.deepEqual(cronConfig(daily,'daily'),daily);assert.ok(cronConfig(daily,'pro').crons.slice(1).every(c=>c.schedule==='* * * * *'));assert.equal(original.crons.length,2);
});
test('scheduled email batches are capped and invalid settings fail closed',()=>{
 const old=process.env.TICKET_EMAIL_BATCH_SIZE;
 try{delete process.env.TICKET_EMAIL_BATCH_SIZE;assert.equal(emailBatchSize(),10);process.env.TICKET_EMAIL_BATCH_SIZE='25';assert.equal(emailBatchSize(),25);for(const value of ['0','26','1.5','wrong']){process.env.TICKET_EMAIL_BATCH_SIZE=value;assert.throws(emailBatchSize);}}
 finally{if(old===undefined)delete process.env.TICKET_EMAIL_BATCH_SIZE;else process.env.TICKET_EMAIL_BATCH_SIZE=old;}
});
