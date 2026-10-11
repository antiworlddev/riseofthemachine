import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {requireAdmin} from '@/server/admin';
import {rateLimit} from '@/server/rate-limit';
import {route,json} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
import {adminOrders,ticketFilters} from '@/server/ticket-admin';
import {AppError} from '@/server/errors';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);const params=new URL(request.url).searchParams,result=ticketFilters.safeParse(Object.fromEntries(params));if(!result.success)throw new AppError(400,'INVALID_INPUT','Choose valid filters and an exact email, order ID or payment reference.');return json(await adminOrders(client,identity,result.data));});}
