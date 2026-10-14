import {db} from '@/server/db';
import {exportMerchOrders,merchOrderFilters} from '@/server/merch-order-tools';
import {requireIdentity} from '@/server/session';
import {route,json} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request){return route(async()=>{const parsed=merchOrderFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success||new URL(request.url).searchParams.has('before'))return json({error:{code:'INVALID_FILTER',message:'Invalid export filters.'}},400);const csv=await exportMerchOrders(db(),await requireIdentity(request),parsed.data);return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="merch-${parsed.data.mode}-${new Date().toISOString().slice(0,10)}.csv"`,'cache-control':'no-store','x-content-type-options':'nosniff'}});});}
