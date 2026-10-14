import {db} from '@/server/db';
import {publishedTournaments} from '@/server/tournaments';
import {route,json} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(){return route(async()=>json({tournaments:await publishedTournaments(db())}));}
