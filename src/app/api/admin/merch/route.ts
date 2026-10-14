import {db} from '@/server/db';
import {merchOrderOverview,merchOrderFilters} from '@/server/merch-order-tools';
import {requireIdentity} from '@/server/session';
import {route,json} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const parsed=merchOrderFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return json({error:{code:'INVALID_FILTER',message:parsed.error.issues[0]?.message}},400);return json(await merchOrderOverview(db(),await requireIdentity(request),parsed.data));});}
