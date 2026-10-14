import {z} from 'zod';
import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {requireAdmin} from '@/server/admin';
import {AppError} from '@/server/errors';
import {tournamentOverview,operateTournament,tournamentInput} from '@/server/tournaments';
import {rateLimit} from '@/server/rate-limit';
import {route,json,sameOrigin,parseBody} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);const id=z.uuid().transform(v=>v.toLowerCase()).optional().safeParse(new URL(request.url).searchParams.get('competitionId')??undefined);if(!id.success)throw new AppError(400,'INVALID_INPUT','Invalid sport.');return json(await tournamentOverview(client,identity,id.data));});}
export function POST(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);return json(await operateTournament(client,identity,await parseBody(request,tournamentInput)));});}
