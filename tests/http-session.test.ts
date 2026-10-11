import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authConfig } from '../src/server/config';
import { AppError } from '../src/server/errors';
import { parseBody,sameOrigin,route } from '../src/server/http';
import { requireIdentity,seal,unseal,setCookie } from '../src/server/session';
import { rosterInput,teamInput } from '../src/server/validation';
const env={APP_ORIGIN:'http://localhost:3000',AUTH_ISSUER:'https://identity.example.com',AUTH_AUTHORIZATION_URL:'https://identity.example.com/authorize',AUTH_TOKEN_URL:'https://identity.example.com/token',AUTH_JWKS_URL:'https://identity.example.com/jwks',AUTH_CLIENT_ID:'rotm-test',SESSION_KEY:'c'.repeat(64)};
Object.assign(process.env,env);
const member={participantKey:'player-one',fullName:'Player One',jerseyNumber:7,captain:false};
const request=(body:unknown,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/kala/teams',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
test('strict input rejects forged owner, status and fee fields',()=>{
 const team={teamOptionId:'00000000-0000-4000-8000-000000000001',sportCodes:['football'],representative:{name:'Team Rep',phone:'+234 800 000 0000'}};
 assert.equal(teamInput.safeParse(team).success,true);
 for(const field of ['representativeId','status','fee']) assert.equal(teamInput.safeParse({...team,[field]:'forged'}).success,false);
});
test('roster rejects duplicate players, jerseys and captains',()=>{
 assert.equal(rosterInput.safeParse({revision:1,members:[member,{...member}]}).success,false);
 assert.equal(rosterInput.safeParse({revision:1,members:[member,{...member,participantKey:'player-two'}]}).success,false);
 assert.equal(rosterInput.safeParse({revision:1,members:[{...member,captain:true},{...member,participantKey:'player-two',jerseyNumber:8,captain:true}]}).success,false);
 assert.equal(rosterInput.safeParse({revision:1,members:[member,{...member,participantKey:'player-two',jerseyNumber:null}]}).success,true);
});
test('mutation rejects cross-origin and absent origin',()=>{
 sameOrigin(request({}));
 assert.throws(()=>sameOrigin(request({},'https://attacker.example')));
 assert.throws(()=>sameOrigin(new Request('http://localhost:3000/api',{method:'POST'})));
});
test('JSON parsing limits streaming bodies and rejects malformed JSON',async()=>{
 const body={revision:1,members:[member]};
 assert.deepEqual(await parseBody(request(body),rosterInput),body);
 await assert.rejects(()=>parseBody(request({revision:1,members:[],extra:true}),rosterInput));
 await assert.rejects(()=>parseBody(request({blob:'x'.repeat(65537)}),rosterInput),e=>e instanceof AppError && e.status===413);
 await assert.rejects(()=>parseBody(new Request('http://localhost:3000/api',{method:'POST',headers:{'content-type':'application/json'},body:'{' }),rosterInput));
});
test('encrypted sessions require authenticity, expiry, purpose and origin audience',async()=>{
 const identity={subject:'verified-provider-subject',email:'rep@example.com'};
 const token=await seal(identity,'session',3600);
 assert.deepEqual(await requireIdentity(new Request(env.APP_ORIGIN,{headers:{cookie:setCookie('session',token,3600).split(';')[0]}})),identity);
 await assert.rejects(()=>unseal(token,'flow'));
 const parts=token.split('.');parts[3]=`${parts[3][0]==='a'?'b':'a'}${parts[3].slice(1)}`;
 await assert.rejects(()=>unseal(parts.join('.'),'session'));
 await assert.rejects(()=>unseal(awaitExpired,'session'));
 process.env.APP_ORIGIN='http://localhost:4000';
 try {await assert.rejects(()=>unseal(token,'session'));}finally{process.env.APP_ORIGIN=env.APP_ORIGIN;}
});
const awaitExpired=await seal({subject:'test',email:'rep@example.com'},'session',-1);
test('missing session never provides an identity',async()=>{
 await assert.rejects(()=>requireIdentity(new Request(env.APP_ORIGIN)),e=>e instanceof AppError&&e.status===401);
});
test('configuration fails closed and does not expose secrets',async()=>{
 const key=process.env.SESSION_KEY;delete process.env.SESSION_KEY;
 try {const response=await route(async()=>{authConfig();return Response.json({ok:true});});assert.equal(response.status,503);assert.equal((await response.json()).error.code,'AUTH_NOT_CONFIGURED');}finally{process.env.SESSION_KEY=key;}
});
