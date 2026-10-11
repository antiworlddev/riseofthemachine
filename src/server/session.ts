import { EncryptJWT, jwtDecrypt } from 'jose';
import { z } from 'zod';
import { authConfig } from './config';
import { AppError } from './errors';
export type Identity = { subject: string; email: string };
const identity = z.object({ subject: z.string().min(1).max(500), email: z.email().max(254) });
export async function seal(payload: Record<string, unknown>, purpose: 'session' | 'flow', lifetime: number) {
  const cfg = authConfig();
  return new EncryptJWT({ ...payload, purpose }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt().setIssuer('rise-of-the-machine').setAudience(cfg.APP_ORIGIN)
    .setExpirationTime(Math.floor(Date.now()/1000) + lifetime).encrypt(Buffer.from(cfg.SESSION_KEY, 'hex'));
}
export async function unseal(token: string, purpose: 'session' | 'flow') {
  const cfg = authConfig();
  const { payload } = await jwtDecrypt(token, Buffer.from(cfg.SESSION_KEY, 'hex'), {
    issuer: 'rise-of-the-machine', audience: cfg.APP_ORIGIN,
    keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'],
    requiredClaims: ['exp','iat'],
  });
  if (payload.purpose !== purpose) throw new Error('Invalid token purpose');
  return payload;
}
export const cookieName = (purpose: 'session' | 'flow') => `${process.env.NODE_ENV === 'production' ? '__Host-' : ''}rotm-${purpose}`;
export function cookieValue(request: Request, name: string) {
  return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1);
}
export function setCookie(purpose: 'session' | 'flow', token: string, seconds: number) {
  return `${cookieName(purpose)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export async function requireIdentity(request: Request): Promise<Identity> {
  // Configuration errors stay 503; invalid or missing session is 401.
  authConfig();
  const token = cookieValue(request, cookieName('session'));
  if (!token) throw new AppError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
  try { return identity.parse(await unseal(token, 'session')); }
  catch { throw new AppError(401, 'SIGN_IN_REQUIRED', 'Your session has expired. Please sign in again.'); }
}
