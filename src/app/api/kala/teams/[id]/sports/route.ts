import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {addTeamSports,addSportsInput} from '@/server/kala-teams';
import {AppError} from '@/server/errors';
import {uuid} from '@/server/validation';
import {rateLimit} from '@/server/rate-limit';
import {json,route,sameOrigin,parseBody} from '@/server/http';
export const runtime='nodejs';
export function POST(request:Request,context:{params:Promise<{id:string}>}){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db(),id=uuid.safeParse((await context.params).id);if(!id.success)throw new AppError(400,'INVALID_INPUT','Invalid team ID.');await rateLimit(client,identity.subject);return json({team:await addTeamSports(client,identity,id.data,await parseBody(request,addSportsInput))},201);});}
