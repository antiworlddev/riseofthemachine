import {db} from '@/server/db';
import {ticketCatalog} from '@/server/ticketing';
import {route,json} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(){return route(async()=>json(await ticketCatalog(db())));}
