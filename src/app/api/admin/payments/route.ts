import {db} from '@/server/db';
import {paymentOperations,operatePayment,operationInput,operationFilters} from '@/server/payment-operations';
import {requireIdentity} from '@/server/session';
import {requireAdmin} from '@/server/admin';
import {rateLimit} from '@/server/rate-limit';
import {route,json,sameOrigin,parseBody} from '@/server/http';
import {AppError} from '@/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request),client=db();await rateLimit(client,identity.subject);const filters=operationFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!filters.success)throw new AppError(400,'INVALID_INPUT','Invalid payment filters.');return json(await paymentOperations(client,identity,filters.data));});}
export function POST(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);return json(await operatePayment(client,identity,await parseBody(request,operationInput)));});}
