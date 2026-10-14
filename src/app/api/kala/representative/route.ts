import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {representativeInput,representativeProfile,saveRepresentativeProfile} from '@/server/kala-teams';
import {rateLimit} from '@/server/rate-limit';
import {json,route,sameOrigin,parseBody} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request);return json({profile:await representativeProfile(db(),identity)});});}
export function POST(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await rateLimit(client,identity.subject);return json({profile:await saveRepresentativeProfile(client,identity,await parseBody(request,representativeInput))});});}
