import {z} from 'zod';
import {db} from '@/server/db';
import {adminMerchOrders} from '@/server/merch';
import {requireIdentity} from '@/server/session';
import {rateLimit} from '@/server/rate-limit';
import {route,json} from '@/server/http';
import {AppError} from '@/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request),client=db();await rateLimit(client,identity.subject);const parsed=z.object({mode:z.enum(['test','live']).default('test'),before:z.uuid().optional()}).strict().safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)throw new AppError(400,'INVALID_INPUT','Invalid filters.');return json(await adminMerchOrders(client,identity,parsed.data.mode,parsed.data.before));});}
