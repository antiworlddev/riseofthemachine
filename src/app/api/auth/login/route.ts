import { beginSignIn } from '@/server/auth';
import { route } from '@/server/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET(request:Request) { return route(()=>beginSignIn(new URL(request.url).searchParams.get('returnTo')??'/kala-games')); }
