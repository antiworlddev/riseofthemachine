import { db } from '@/server/db';
import { requireAdmin } from '@/server/admin';
import { requireIdentity } from '@/server/session';
import { route,json } from '@/server/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request);await requireAdmin(db(),identity);return json({email:identity.email,role:'ADMIN'});});}
