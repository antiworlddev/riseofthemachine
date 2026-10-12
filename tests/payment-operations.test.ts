import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {operationInput} from '../src/server/payment-operations';
import {refundSchema,refundGateway} from '../src/server/refund-provider';
test('payment support requires confirmation, reason, revision and a previewed refund amount',()=>{
 const base={kind:'TICKET',orderId:randomUUID(),revision:1,expectedStatus:'PAID',action:'REFUND',reason:'Customer requested refund',confirmed:true,refundAmountMinor:2000000};
 assert.equal(operationInput.safeParse(base).success,true);
 for(const value of [{...base,confirmed:false},{...base,reason:''},{...base,revision:0},{...base,refundAmountMinor:undefined},{...base,refundAmountMinor:-1},{...base,status:'REFUNDED'}])assert.equal(operationInput.safeParse(value).success,false);
});
test('refund provider normalization verifies shapes and uses exact transaction-filtered requests',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.PAYSTACK_SECRET_KEY,oldMode=process.env.PAYSTACK_MODE,calls:{url:string;method:string;body:unknown}[]=[];
 process.env.PAYSTACK_MODE='test';process.env.PAYSTACK_SECRET_KEY='sk_test_'+'x'.repeat(32);
 const raw={id:42,transaction:{id:99},amount:2000000,domain:'test',currency:'NGN',status:'pending'};
 globalThis.fetch=async(input,init)=>{const url=String(input);calls.push({url,method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):null});return Response.json({status:true,data:url.includes('?')?[{...raw,transaction:99}]:raw});};
 try{const gateway=refundGateway();assert.equal((await gateway.list('99'))[0].transaction,'99');assert.equal((await gateway.create('99',2000000,'Order review')).id,'42');assert.equal((await gateway.fetch('42')).status,'pending');assert.equal(calls[0].url,'https://api.paystack.co/refund?transaction=99&perPage=100');assert.deepEqual(calls[1].body,{transaction:'99',amount:2000000,currency:'NGN',merchant_note:'Order review'});assert.equal(calls[2].url,'https://api.paystack.co/refund/42');assert.equal(refundSchema.safeParse({...raw,amount:-1}).success,false);assert.equal(refundSchema.safeParse({...raw,status:'unknown'}).success,false);}
 finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.PAYSTACK_SECRET_KEY;else process.env.PAYSTACK_SECRET_KEY=oldKey;if(oldMode===undefined)delete process.env.PAYSTACK_MODE;else process.env.PAYSTACK_MODE=oldMode;}
});
