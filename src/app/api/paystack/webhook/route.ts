import {verifyMerch,merchReference} from '@/server/merch';
import {z} from 'zod';
import {db} from '@/server/db';
import {verifyPayment,referenceInput} from '@/server/ticketing';
import {validWebhook} from '@/server/paystack';
import {route,json} from '@/server/http';
import {AppError} from '@/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function POST(request:Request){return route(async()=>{
 const reader=request.body?.getReader();if(!reader)throw new AppError(400,'INVALID_WEBHOOK','Missing webhook body.');
 const chunks:Uint8Array[]=[];let size=0;try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>65536){await reader.cancel();throw new AppError(413,'BODY_TOO_LARGE','Webhook is too large.');}chunks.push(item.value);}}finally{reader.releaseLock();}
 const body=Buffer.concat(chunks);if(!validWebhook(body,request.headers.get('x-paystack-signature')))throw new AppError(401,'INVALID_SIGNATURE','Invalid webhook signature.');
 let value;try{value=JSON.parse(body.toString('utf8'));}catch{throw new AppError(400,'INVALID_WEBHOOK','Invalid webhook body.');}
 const event=z.object({event:z.string(),data:z.unknown()}).safeParse(value);if(!event.success)throw new AppError(400,'INVALID_WEBHOOK','Invalid webhook event.');
 if(event.data.event==='charge.success'){const input=referenceInput.safeParse({reference:z.object({reference:z.string()}).safeParse(event.data.data).data?.reference});const merchandise=merchReference.safeParse({reference:z.object({reference:z.string()}).safeParse(event.data.data).data?.reference});if(input.success||merchandise.success){try{if(merchandise.success)await verifyMerch(db(),merchandise.data.reference);else if(input.success)await verifyPayment(db(),input.data.reference);}catch(e){if(!(e instanceof AppError&&e.code==='ORDER_NOT_FOUND'))throw e;}}}
 return json({received:true});
});}
