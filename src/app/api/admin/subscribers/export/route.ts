import {db} from '@/server/db';
import {requireIdentity} from '@/server/session';
import {route,parseBody,sameOrigin} from '@/server/http';
import {exportSubscribers,subscriberFilters} from '@/server/subscribers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function POST(request:Request){return route(async()=>{sameOrigin(request);const {list}=await parseBody(request,subscriberFilters.omit({before:true}));const csv=await exportSubscribers(db(),await requireIdentity(request),list);return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="rotm-${list}.csv"`,'cache-control':'no-store'}});});}
