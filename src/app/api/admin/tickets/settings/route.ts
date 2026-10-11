import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {requireAdmin} from '@/server/admin';
import {rateLimit} from '@/server/rate-limit';
import {route,json} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
import {configureSales,salesInput} from '@/server/ticket-admin';
import {sameOrigin,parseBody} from '@/server/http';
export function PATCH(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);return json(await configureSales(client,identity,await parseBody(request,salesInput)));});}
