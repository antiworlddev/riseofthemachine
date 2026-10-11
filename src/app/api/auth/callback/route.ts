import { completeSignIn } from '@/server/auth';
import { route } from '@/server/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET(request: Request) { return route(()=>completeSignIn(request)); }
