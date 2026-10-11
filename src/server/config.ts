import { z } from 'zod';
import { AppError } from './errors';
const httpsUrl = z.url().refine(v => new URL(v).protocol === 'https:', 'HTTPS required');
const authSchema = z.object({
  APP_ORIGIN: z.url(),
  AUTH_ISSUER: httpsUrl,
  AUTH_AUTHORIZATION_URL: httpsUrl,
  AUTH_TOKEN_URL: httpsUrl,
  AUTH_JWKS_URL: httpsUrl,
  AUTH_CLIENT_ID: z.string().min(1),
  AUTH_CLIENT_SECRET: z.string().min(1).optional(),
  SESSION_KEY: z.string().regex(/^[0-9a-f]{64}$/, '32-byte hex key required'),
});
export function authConfig() {
  const parsed = authSchema.safeParse(process.env);
  if (!parsed.success) throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Sign-in is not available yet.');
  const cfg = parsed.data;
  const origin = new URL(cfg.APP_ORIGIN);
  if (origin.origin !== cfg.APP_ORIGIN || (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Sign-in is not available yet.');
  }
  return cfg;
}
export function registrationOpen() { return process.env.KALA_REGISTRATION_ENABLED === 'true'; }
export function requireRegistrationOpen() {
  if (!registrationOpen()) throw new AppError(403, 'REGISTRATION_CLOSED', 'KALA GAMES registration is currently closed.');
}
export function kalaSlug() { return process.env.KALA_EVENT_SLUG || 'kala-games-2026'; }
