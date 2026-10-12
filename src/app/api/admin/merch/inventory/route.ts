import {db} from '@/server/db';
import {merchInventory,updateInventory,inventoryInput} from '@/server/merch-inventory';
import {requireIdentity} from '@/server/session';
import {rateLimit} from '@/server/rate-limit';
import {route,json,sameOrigin,parseBody} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request),client=db();await rateLimit(client,identity.subject);return json(await merchInventory(client,identity));});}
export function PATCH(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await rateLimit(client,identity.subject);return json(await updateInventory(client,identity,await parseBody(request,inventoryInput)));});}
