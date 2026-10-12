import {db} from '@/server/db';
import {shippingRates,configureShipping,shippingInput} from '@/server/shipping';
import {requireIdentity} from '@/server/session';
import {rateLimit} from '@/server/rate-limit';
import {route,json,sameOrigin,parseBody} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const identity=await requireIdentity(request),client=db();await rateLimit(client,identity.subject);return json(await shippingRates(client,identity));});}
export function PATCH(request:Request){return route(async()=>{sameOrigin(request);const identity=await requireIdentity(request),client=db();await rateLimit(client,identity.subject);return json(await configureShipping(client,identity,await parseBody(request,shippingInput)));});}
