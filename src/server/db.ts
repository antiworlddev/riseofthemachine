import 'server-only';
import { PrismaClient } from '@prisma/client';
import { AppError } from './errors';
const globalDb = globalThis as unknown as { rotmPrisma?: PrismaClient };
export function db() {
  if (!process.env.DATABASE_URL) throw new AppError(503, 'DATABASE_NOT_CONFIGURED', 'Registration is not available yet.');
  return globalDb.rotmPrisma ??= new PrismaClient({
    log: [],
    transactionOptions: { maxWait: 10000, timeout: 15000 },
  });
}
