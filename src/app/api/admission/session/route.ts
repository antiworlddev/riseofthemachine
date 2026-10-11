import {db} from '@/server/db';
import {scannerSession} from '@/server/admission';
import {requireIdentity} from '@/server/session';
import {route,json} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>json(await scannerSession(db(),await requireIdentity(request))));}
