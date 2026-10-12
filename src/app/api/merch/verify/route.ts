import {db} from '@/server/db';
import {merchCatalog,merchCheckout,merchInput,verifyMerch,merchReference,myMerchOrders} from '@/server/merch';
import {requireIdentity} from '@/server/session';
import {rateLimit} from '@/server/rate-limit';
import {route,json,sameOrigin,parseBody} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function POST(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await rateLimit(client,identity.subject);const input=await parseBody(request,merchReference);return json(await verifyMerch(client,input.reference,identity));});}
