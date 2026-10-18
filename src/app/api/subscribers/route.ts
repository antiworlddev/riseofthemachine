import {createHash} from 'node:crypto';
import {db} from '@/server/db';
import {route,json,parseBody} from '@/server/http';
import {rateLimit} from '@/server/rate-limit';
import {signupInput,subscribe,subscriberOrigin} from '@/server/subscribers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function POST(request:Request){return route(async()=>{
 subscriberOrigin(request);const input=await parseBody(request,signupInput),client=db();
 // Only trust Vercel's overwritten client-IP header on Vercel. Other hosts share a bucket.
 const ip=process.env.VERCEL==='1'?request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim()||'unknown':'local';
 await rateLimit(client,`signup-ip:${ip}`,20);
 await rateLimit(client,`signup-email:${createHash('sha256').update(input.email).digest('hex')}`,3);
 await subscribe(client,input);
 return json({ok:true,message:input.source==='waitlist'?'You’re on the waitlist. We’ll email you when there’s news.':'You’re subscribed. Look out for mails from ODUMODUBLVCK.'});
});}
