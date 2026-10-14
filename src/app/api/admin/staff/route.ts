import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {staffOverview,staffFilters} from '@/server/staff-management';
import {json,route} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const parsed=staffFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return json({error:{code:'INVALID_FILTER',message:parsed.error.issues[0]?.message}},400);return json(await staffOverview(db(),await requireIdentity(request),parsed.data));});}
