import {db} from '@/server/db';
import {adminCatalog,saveCatalog,catalogInput} from '@/server/merch-catalog-admin';
import {requireIdentity} from '@/server/session';
import {requireAdmin} from '@/server/admin';
import {rateLimit} from '@/server/rate-limit';
import {route,json,sameOrigin,parseBody} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>json(await adminCatalog(db(),await requireIdentity(request))));}
export function POST(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);return json(await saveCatalog(client,identity,await parseBody(request,catalogInput)));});}
