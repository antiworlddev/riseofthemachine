import {db} from '@/server/db';
import {runCron} from '@/server/cron';
import {expireReservations} from '@/server/ticketing';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export function GET(request:Request){return runCron(request,async()=>({expired:await expireReservations(db(),25,Date.now()+35000)}));}
