import {db} from '@/server/db';
import {runCron} from '@/server/cron';
import {emailBatchSize} from '@/server/job-settings';
import {scheduledEmailJobs} from '@/server/scheduled-email-jobs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
// Bound work and stop starting new messages after the cooperative time budget.
// No browser session or query-string secret grants access to this endpoint.
export function GET(request:Request){return runCron(request,()=>scheduledEmailJobs(db(),emailBatchSize()));}
