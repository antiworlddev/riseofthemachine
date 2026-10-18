import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {json,route,parseBody,sameOrigin} from '@/server/http';
import {subscriberOverview,subscriberFilters,retrySubscriberSync,retrySubscriberInput} from '@/server/subscribers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const filters=subscriberFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!filters.success)return json({error:{code:'INVALID_FILTER',message:'Choose a valid subscriber list.'}},400);return json(await subscriberOverview(db(),await requireIdentity(request),filters.data));});}

export function POST(request:Request){return route(async()=>{sameOrigin(request);const input=await parseBody(request,retrySubscriberInput);await retrySubscriberSync(db(),await requireIdentity(request),input.id);return json({ok:true});});}
