import {db} from '@/server/db';
import {runCron} from '@/server/cron';
import {deliverTicketEmails} from '@/server/ticket-emails';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
// One email per invocation fits external schedulers' short HTTP timeouts.
// No browser session or query-string secret grants access to this endpoint.
export function GET(request:Request){return runCron(request,()=>deliverTicketEmails(db(),undefined,1));}
