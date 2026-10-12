import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {scannerSession} from '@/server/admission';
import {parkingInput,checkParking} from '@/server/parking';
import {route,json,sameOrigin,parseBody} from '@/server/http';
import {rateLimit} from '@/server/rate-limit';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function POST(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await scannerSession(client,identity);await rateLimit(client,`scan:${identity.subject}`,240);const input=await parseBody(request,parkingInput);return json(await checkParking(client,identity,input.token,true));});}
