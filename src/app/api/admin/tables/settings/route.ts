import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {requireAdmin} from '@/server/admin';
import {rateLimit} from '@/server/rate-limit';
import {route,json,sameOrigin,parseBody} from '@/server/http';
import {configureTables,tableSettingsInput} from '@/server/tables';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function PATCH(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);return json(await configureTables(client,identity,await parseBody(request,tableSettingsInput)));});}
