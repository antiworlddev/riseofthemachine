import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailOperationInput,emailFilters} from '../src/server/email-operations';
test('email resends require explicit duplicate acknowledgement while retry reasons/confirmations are strict',()=>{
 const base={messageId:'00000000-0000-4000-8000-000000000001',revision:1,action:'RETRY',reason:'Fix verified sender domain',confirmed:true};
 assert.equal(emailOperationInput.safeParse(base).success,true);assert.equal(emailOperationInput.safeParse({...base,action:'RESEND'}).success,false);assert.equal(emailOperationInput.safeParse({...base,action:'RESEND',acknowledgeDuplicate:true}).success,true);assert.equal(emailOperationInput.safeParse({...base,confirmed:false}).success,false);assert.equal(emailOperationInput.safeParse({...base,reason:' '}).success,false);assert.equal(emailOperationInput.safeParse({...base,to:'forged@example.com'}).success,false);
});
test('email queue filters restrict delivery mode, status and cursor syntax',()=>{
 assert.equal(emailFilters.safeParse({mode:'all'}).success,false);assert.equal(emailFilters.safeParse({status:'FAILED_UNTRUSTED'}).success,false);assert.equal(emailFilters.safeParse({before:'private-code'}).success,false);assert.equal(emailFilters.safeParse({status:'NEEDS_ATTENTION',mode:'live'}).success,true);
});
