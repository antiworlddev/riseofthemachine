import { db } from '@/server/db';
import { requireAdmin } from '@/server/admin';
import { getSettings,settingsInput,updateSettings } from '@/server/settings';
import { requireIdentity } from '@/server/session';
import { route,json,sameOrigin,parseBody } from '@/server/http';
import { rateLimit } from '@/server/rate-limit';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request);const client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);return json(await getSettings(client,identity));});}
export function PATCH(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request);const client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);return json(await updateSettings(client,identity,await parseBody(request,settingsInput)));});}
