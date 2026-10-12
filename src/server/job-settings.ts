import {z} from 'zod';
import {AppError} from './errors';
export function emailBatchSize(){
 const parsed=z.coerce.number().int().min(1).max(25).safeParse(process.env.TICKET_EMAIL_BATCH_SIZE??'10');
 if(!parsed.success)throw new AppError(503,'JOBS_NOT_CONFIGURED','TICKET_EMAIL_BATCH_SIZE must be an integer from 1 to 25.');
 return parsed.data;
}
