import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditDetails,auditFilters,staffChangeInput} from '../src/server/staff-management';
test('audit projection keeps score/access/stock changes and omits nested secrets and unknown provider payloads',()=>{
 const safe=auditDetails({reason:'Confirmed result',fixtureId:'match',before:{homeScore:1,awayScore:0,token:'secret'},after:{homeScore:2,awayScore:0,encryptedToken:'secret'},variants:[{id:'variant',from:5,to:10,secret:'secret'}],providerPayload:{token:'secret'},token:'secret'});
 assert.deepEqual(safe,{reason:'Confirmed result',fixtureId:'match',before:{homeScore:1,awayScore:0},after:{homeScore:2,awayScore:0},variants:[{id:'variant',from:5,to:10}]});
 assert.deepEqual(auditDetails(['secret']),{});assert.deepEqual(auditDetails(null),{});
});
test('audit date bounds require explicit timezone and reject reversed ranges; staff mutations require known roles and confirmation',()=>{
 assert.equal(auditFilters.safeParse({from:'2026-10-13T10:00:00'}).success,false);
 assert.equal(auditFilters.safeParse({from:'2026-10-13T10:00:00+01:00',to:'2026-10-13T10:00:00Z'}).success,true);
 assert.equal(auditFilters.safeParse({actorId:'not-an-id'}).success,false);
 const base={representativeId:'00000000-0000-4000-8000-000000000001',email:'staff@example.com',revision:1,enabled:true,role:'ADMIN',confirmed:true,reason:'Grant organizer access'};
 assert.equal(staffChangeInput.safeParse({...base,role:'SUPER_ADMIN'}).success,false);assert.equal(staffChangeInput.safeParse({...base,confirmed:false}).success,false);assert.equal(staffChangeInput.safeParse({...base,revision:-1}).success,false);
});
