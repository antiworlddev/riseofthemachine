import { db } from '@/server/db';
import { requireAdmin,reviewInput,reviewRoster } from '@/server/admin';
import { requireIdentity } from '@/server/session';
import { route,json,sameOrigin,parseBody } from '@/server/http';
import { rateLimit } from '@/server/rate-limit';
import { uuid } from '@/server/validation';
import { AppError } from '@/server/errors';
export const runtime='nodejs';
export function POST(request:Request,context:{params:Promise<{id:string}>}){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request);const client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);const id=uuid.safeParse((await context.params).id);if(!id.success)throw new AppError(400,'INVALID_INPUT','Invalid roster ID.');const input=await parseBody(request,reviewInput);return json({roster:await reviewRoster(client,identity,id.data,input)});});}
