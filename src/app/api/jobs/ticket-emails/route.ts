import {db} from '@/server/db';
import {runCron} from '@/server/cron';
import {emailBatchSize} from '@/server/job-settings';
import {deliverEmails} from '@/server/notifications';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
// Bound work and stop starting new messages after the cooperative time budget.
// No browser session or query-string secret grants access to this endpoint.
export function GET(request:Request){return runCron(request,()=>deliverEmails(db(),undefined,emailBatchSize(),Date.now()+35000));}
