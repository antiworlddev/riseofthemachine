import {db} from '@/server/db';
import {merchCatalog,merchCheckout,merchInput,verifyMerch,merchReference,myMerchOrders} from '@/server/merch';
import {requireIdentity} from '@/server/session';
import {rateLimit} from '@/server/rate-limit';
import {route,json,sameOrigin,parseBody} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(){return route(async()=>json(await merchCatalog(db())));}
