import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from './errors';
import { authConfig } from './config';
export function json(data: unknown,status=200) {return Response.json(data,{status,headers:{'cache-control':'no-store'}});}
export function sameOrigin(request: Request) {
 if(request.headers.get('origin')!==authConfig().APP_ORIGIN) throw new AppError(403,'INVALID_ORIGIN','This request must come from the registration website.');
}
export async function parseBody<T>(request: Request,schema: z.ZodType<T>): Promise<T> {
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json') throw new AppError(415,'JSON_REQUIRED','Use a JSON request body.');
 const reader=request.body?.getReader();
 if(!reader) throw new AppError(400,'INVALID_INPUT','Request body is required.');
 const chunks: Uint8Array[]=[];let bytes=0;
 try { while(true) {const {value,done}=await reader.read();if(done) break;bytes+=value.byteLength;if(bytes>65536){await reader.cancel();throw new AppError(413,'BODY_TOO_LARGE','This roster is too large.');}chunks.push(value);} }
 finally {reader.releaseLock();}
 let data;
 try {data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch {throw new AppError(400,'INVALID_INPUT','Invalid JSON request.');}
 const result=schema.safeParse(data);
 if(!result.success) throw new AppError(400,'INVALID_INPUT',result.error.issues[0]?.message ?? 'Check the registration details.');
 return result.data;
}
export async function route(action: ()=>Promise<Response>) {
 try {return await action();}
 catch(error) {
  if(error instanceof AppError) return json({error:{code:error.code,message:error.message}},error.status);
  if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002') return json({error:{code:'ALREADY_EXISTS',message:'This registration or player already exists.'}},409);
  const requestId=randomUUID();
  // Deliberately omit raw errors, query parameters, tokens and personal data.
  const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Prisma.PrismaClientInitializationError ? error.errorCode : undefined;
  console.error(JSON.stringify({event:'request_failed',requestId,errorType:error instanceof Error ? error.name : 'UnknownError',prismaCode}));
  return json({error:{code:'SERVICE_UNAVAILABLE',message:'Please try again shortly.',requestId}},503);
 }
}
