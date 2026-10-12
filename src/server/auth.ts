import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { authConfig } from './config';
import { AppError } from './errors';
import { cookieName, cookieValue, seal, setCookie, unseal } from './session';
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const random = () => randomBytes(32).toString('base64url');
function equal(a: string,b: string) { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
export async function beginSignIn(returnTo='/kala-games') {
 if(!['/','/kala-games','/tickets','/tickets/orders','/admin/kala-games','/admin/kala-games/settings','/staff/check-in','/admin/tickets','/merch','/merch/orders','/admin/merch','/admin/merch/inventory'].includes(returnTo))returnTo='/kala-games';
 const cfg = authConfig();
 const state=random(), nonce=random(), verifier=random();
 const flow = await seal({ state, nonce, verifier, returnTo },'flow',600);
 const url=new URL(cfg.AUTH_AUTHORIZATION_URL);
 const params = { client_id:cfg.AUTH_CLIENT_ID, redirect_uri:`${cfg.APP_ORIGIN}/api/auth/callback`, response_type:'code', scope:'openid email profile', state, nonce, code_challenge:createHash('sha256').update(verifier).digest('base64url'), code_challenge_method:'S256' };
 for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
 return new Response(null,{status:302,headers:{location:url.href,'set-cookie':setCookie('flow',flow,600),'cache-control':'no-store'}});
}
export async function completeSignIn(request: Request) {
 const cfg=authConfig(),url=new URL(request.url);
 const token=cookieValue(request,cookieName('flow'));
 if (!token) throw new AppError(400,'INVALID_SIGN_IN','Sign-in expired. Please start again.');
 let flow;
 try { flow=z.object({state:z.string(),nonce:z.string(),verifier:z.string(),returnTo:z.string().optional()}).parse(await unseal(token,'flow')); }
 catch { throw new AppError(400,'INVALID_SIGN_IN','Sign-in expired. Please start again.'); }
 const code=url.searchParams.get('code'), state=url.searchParams.get('state');
 if (!code || !state || !equal(state,flow.state) || code.length>4096) throw new AppError(400,'INVALID_SIGN_IN','Could not verify this sign-in.');
 const body=new URLSearchParams({grant_type:'authorization_code',client_id:cfg.AUTH_CLIENT_ID,code,redirect_uri:`${cfg.APP_ORIGIN}/api/auth/callback`,code_verifier:flow.verifier});
 if(cfg.AUTH_CLIENT_SECRET) body.set('client_secret',cfg.AUTH_CLIENT_SECRET);
 const response=await fetch(cfg.AUTH_TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store'});
 if(!response.ok) throw new AppError(401,'INVALID_SIGN_IN','Sign-in could not be completed.');
 const result=z.object({id_token:z.string().max(20000)}).safeParse(await response.json());
 if(!result.success) throw new AppError(401,'INVALID_SIGN_IN','Sign-in could not be completed.');
 const jwks=keys.get(cfg.AUTH_JWKS_URL) ?? createRemoteJWKSet(new URL(cfg.AUTH_JWKS_URL),{timeoutDuration:5000});
 keys.set(cfg.AUTH_JWKS_URL,jwks);
 try {
  const {payload}=await jwtVerify(result.data.id_token,jwks,{issuer:cfg.AUTH_ISSUER,audience:cfg.AUTH_CLIENT_ID,algorithms:['RS256','ES256'],requiredClaims:['exp','iat','sub','nonce']});
  if(payload.nonce!==flow.nonce || payload.email_verified!==true || typeof payload.sub!=='string' || (Array.isArray(payload.aud) && payload.aud.length>1 && payload.azp!==cfg.AUTH_CLIENT_ID)) throw new Error('Invalid identity');
  const email=z.email().max(254).parse(payload.email).trim().toLowerCase();
  const subject=createHash('sha256').update(JSON.stringify([cfg.AUTH_ISSUER,payload.sub])).digest('hex');
  const lifetime=Math.min(3600,(payload.exp??0)-Math.floor(Date.now()/1000));
  if(lifetime<=0) throw new Error('Expired identity');
  const session=await seal({subject,email},'session',lifetime);
  const headers=new Headers({location:`${cfg.APP_ORIGIN}${['/','/kala-games','/tickets','/tickets/orders','/admin/kala-games','/admin/kala-games/settings','/staff/check-in','/admin/tickets','/merch','/merch/orders','/admin/merch','/admin/merch/inventory'].includes(flow.returnTo??'')?flow.returnTo:'/kala-games'}`,'cache-control':'no-store'});
  headers.append('set-cookie',setCookie('session',session,lifetime));
  headers.append('set-cookie',setCookie('flow','',0));
  return new Response(null,{status:303,headers});
 } catch { throw new AppError(401,'UNVERIFIED_IDENTITY','Use an account with a verified email address to register your team.'); }
}
