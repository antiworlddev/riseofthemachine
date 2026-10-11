import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {requireAdmin} from '@/server/admin';
import {rateLimit} from '@/server/rate-limit';
import {route,json} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
import {ticketOverview} from '@/server/ticket-admin';
import {z} from 'zod';
import {AppError} from '@/server/errors';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);const mode=z.enum(['test','live']).safeParse(new URL(request.url).searchParams.get('mode')??'test');if(!mode.success)throw new AppError(400,'INVALID_INPUT','Choose test or live mode.');return json(await ticketOverview(client,identity,mode.data));});}
