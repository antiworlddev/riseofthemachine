import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {requireAdmin} from '@/server/admin';
import {changeStaffAccess,staffChangeInput} from '@/server/staff-management';
import {rateLimit} from '@/server/rate-limit';
import {json,route,sameOrigin,parseBody} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function POST(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);const input=await parseBody(request,staffChangeInput);return json(await changeStaffAccess(client,identity,input));});}
