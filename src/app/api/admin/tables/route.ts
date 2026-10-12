import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {requireAdmin} from '@/server/admin';
import {rateLimit} from '@/server/rate-limit';
import {route,json,sameOrigin,parseBody} from '@/server/http';
import {tableOverview,tableFilters} from '@/server/tables';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);return json(await tableOverview(client,identity,tableFilters.parse(Object.fromEntries(new URL(request.url).searchParams))));});}
