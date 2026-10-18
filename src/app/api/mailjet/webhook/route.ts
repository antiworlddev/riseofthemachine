import {db} from '@/server/db';
import {json,route,parseBody} from '@/server/http';
import {authorizeMailjetWebhook,mailjetEventsInput,applyMailjetEvents} from '@/server/mailjet';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function POST(request:Request){return route(async()=>{authorizeMailjetWebhook(request);return json(await applyMailjetEvents(db(),await parseBody(request,mailjetEventsInput)));});}
