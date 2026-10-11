import {createHash,timingSafeEqual} from 'node:crypto';
import {AppError} from './errors';
import {json,route} from './http';
// Authorize before constructing the database client or invoking the worker.
export function runCron(request:Request,action:()=>Promise<unknown>){return route(async()=>{
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32||/\s/.test(secret))throw new AppError(503,'CRON_NOT_CONFIGURED','Scheduled jobs are not configured.');
 const supplied=request.headers.get('authorization')??'';
 const hash=(value:string)=>createHash('sha256').update(value).digest();
 if(!timingSafeEqual(hash(supplied),hash(`Bearer ${secret}`)))throw new AppError(401,'UNAUTHORIZED','Scheduled job authorization is required.');
 return json(await action());
});}
