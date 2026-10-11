import { requireIdentity } from '@/server/session';
import { route,json } from '@/server/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET(request: Request) { return route(async()=>json(await requireIdentity(request))); }
