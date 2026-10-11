import { db } from '@/server/db';
import { saveRoster } from '@/server/registration';
import { requireIdentity } from '@/server/session';
import { rateLimit } from '@/server/rate-limit';
import { rosterInput,uuid } from '@/server/validation';
import { AppError } from '@/server/errors';
import { json,route,sameOrigin,parseBody } from '@/server/http';
export const runtime='nodejs';
export function PUT(request: Request,context: {params:Promise<{id:string}>}) {return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request);const id=uuid.safeParse((await context.params).id);if(!id.success) throw new AppError(400,'INVALID_INPUT','Invalid roster ID.');const client=db();await rateLimit(client,identity.subject);const input=await parseBody(request,rosterInput);return json({roster:await saveRoster(client,identity,id.data,input)});});}
