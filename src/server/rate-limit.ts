import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AppError } from './errors';
export async function rateLimit(db: PrismaClient,subject: string,limit=60) {
 const key=createHash('sha256').update(`kala:${subject}`).digest('hex');
 const rows=await db.$queryRaw<{count:number}[]>`
 INSERT INTO "ApiRateBucket" (key,count,"expiresAt") VALUES (${key},1,now()+interval '1 minute')
 ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "ApiRateBucket"."expiresAt"<=now() THEN 1 ELSE "ApiRateBucket".count+1 END,
 "expiresAt"=CASE WHEN "ApiRateBucket"."expiresAt"<=now() THEN now()+interval '1 minute' ELSE "ApiRateBucket"."expiresAt" END RETURNING count`;
 if(rows[0].count>limit) throw new AppError(429,'RATE_LIMITED','Too many requests. Please wait one minute.');
}
