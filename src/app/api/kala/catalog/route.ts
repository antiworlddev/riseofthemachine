import { db } from '@/server/db';
import { catalog } from '@/server/registration';
import { registrationOpen } from '@/server/config';
import { json,route } from '@/server/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET() {return route(async()=>{const event=await catalog(db());return json({registrationOpen:registrationOpen()&&event.registrationEnabled,event});});}
