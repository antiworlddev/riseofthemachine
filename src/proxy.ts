import {NextResponse,type NextRequest} from 'next/server';
import {heldPath} from './server/site-mode';
export function proxy(request:NextRequest){
 if(!heldPath(request.nextUrl.pathname))return NextResponse.next();
 if(request.nextUrl.pathname.startsWith('/api/'))return NextResponse.json({error:{code:'PRELAUNCH',message:'We are getting ready. Join the waitlist for launch updates.'}},{status:403,headers:{'cache-control':'no-store'}});
 const response=NextResponse.redirect(new URL('/',request.url));response.headers.set('cache-control','no-store');return response;
}
export const config={matcher:['/tickets/:path*','/merch/:path*','/kala-games/:path*','/api/tickets/:path*','/api/merch/:path*','/api/kala/:path*']};
