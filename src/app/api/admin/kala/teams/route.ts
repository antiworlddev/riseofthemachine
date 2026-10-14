import {AppError} from '@/server/errors';
import {z} from 'zod';
import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {requireAdmin} from '@/server/admin';
import {organizerTeams} from '@/server/kala-teams';
import {rateLimit} from '@/server/rate-limit';
import {json,route,sameOrigin,parseBody} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request),client=db();await requireAdmin(client,identity);await rateLimit(client,identity.subject);const cursor=z.uuid().optional().safeParse(new URL(request.url).searchParams.get('after')??undefined);if(!cursor.success)throw new AppError(400,'INVALID_INPUT','Invalid team page cursor.');return json(await organizerTeams(client,identity,cursor.data));});}
