import { db } from '@/server/db';
import { listRosters,requireAdmin } from '@/server/admin';
import { requireIdentity } from '@/server/session';
import { route,json } from '@/server/http';
import { rateLimit } from '@/server/rate-limit';
import { AppError } from '@/server/errors';
import { uuid } from '@/server/validation';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request);const client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);const params=new URL(request.url).searchParams;const status=params.get('status')??'SUBMITTED';if(!['SUBMITTED','APPROVED','REJECTED'].includes(status))throw new AppError(400,'INVALID_INPUT','Invalid review status.');const cursor=params.get('cursor')??undefined;if(cursor&&!uuid.safeParse(cursor).success)throw new AppError(400,'INVALID_INPUT','Invalid page cursor.');return json(await listRosters(client,identity,status as 'SUBMITTED'|'APPROVED'|'REJECTED',cursor));});}
