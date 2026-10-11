import { setCookie } from '@/server/session';
import { route,sameOrigin,json } from '@/server/http';
export const runtime='nodejs';
export function POST(request: Request) { return route(async()=>{sameOrigin(request);const response=json({ok:true});response.headers.append('set-cookie',setCookie('session','',0));response.headers.append('set-cookie',setCookie('flow','',0));return response;}); }
