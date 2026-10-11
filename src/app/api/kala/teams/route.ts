import { db } from '@/server/db';
import { createTeam,myTeams } from '@/server/registration';
import { requireIdentity } from '@/server/session';
import { rateLimit } from '@/server/rate-limit';
import { teamInput } from '@/server/validation';
import { json,route,sameOrigin,parseBody } from '@/server/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET(request: Request) {return route(async()=>{const identity=await requireIdentity(request);const client=db();await rateLimit(client,identity.subject);return json({teams:await myTeams(client,identity)});});}
export function POST(request: Request) {return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request);const client=db();await rateLimit(client,identity.subject);const input=await parseBody(request,teamInput);return json({team:await createTeam(client,identity,input)},201);});}
