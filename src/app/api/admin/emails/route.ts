import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {requireAdmin} from '@/server/admin';
import {emailOverview,operateEmail,emailFilters,emailOperationInput} from '@/server/email-operations';
import {rateLimit} from '@/server/rate-limit';
import {json,route,sameOrigin,parseBody} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const parsed=emailFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return json({error:{code:'INVALID_FILTER',message:'Invalid email filters.'}},400);return json(await emailOverview(db(),await requireIdentity(request),parsed.data));});}
export function POST(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);return json(await operateEmail(client,identity,await parseBody(request,emailOperationInput)));});}
