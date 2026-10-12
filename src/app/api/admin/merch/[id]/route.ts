import {z} from 'zod';
import {db} from '@/server/db';
import {updateMerchFulfilment,fulfilmentInput} from '@/server/merch';
import {requireIdentity} from '@/server/session';
import {rateLimit} from '@/server/rate-limit';
import {route,json,sameOrigin,parseBody} from '@/server/http';
import {AppError} from '@/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function PATCH(request:Request,context:{params:Promise<{id:string}>}){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await rateLimit(client,identity.subject);const id=z.uuid().safeParse((await context.params).id);if(!id.success)throw new AppError(400,'INVALID_INPUT','Invalid order ID.');return json(await updateMerchFulfilment(client,identity,id.data,await parseBody(request,fulfilmentInput)));});}
