import {z} from 'zod';
import {db} from '@/server/db';
import {route,json,parseBody} from '@/server/http';
import {unsubscribe,subscriberOrigin} from '@/server/subscribers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function POST(request:Request){return route(async()=>{subscriberOrigin(request);const {token,scope}=await parseBody(request,z.object({token:z.string().max(150),scope:z.enum(['all','newsletter']).default('all')}).strict());await unsubscribe(db(),token,scope);return json({ok:true});});}
