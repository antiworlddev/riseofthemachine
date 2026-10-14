import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {uuid} from '@/server/validation';
import {AppError} from '@/server/errors';
import {eligibilityHistory} from '@/server/eligibility';
import {rateLimit} from '@/server/rate-limit';
import {route,json} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request,context:{params:Promise<{id:string}>}){return route(async()=>{const identity=await requireIdentity(request),id=uuid.safeParse((await context.params).id);if(!id.success)throw new AppError(400,'INVALID_INPUT','Invalid roster ID.');const client=db();await rateLimit(client,identity.subject);return json({history:await eligibilityHistory(client,identity,id.data,true)});});}
