import { createHmac,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from './errors';
export function paystackConfig(){
 const domain=process.env.PAYSTACK_MODE??'test',secret=process.env.PAYSTACK_SECRET_KEY??'';
 if(!['test','live'].includes(domain)||!secret.startsWith(`sk_${domain}_`)||secret.length<20)throw new AppError(503,'PAYMENTS_NOT_CONFIGURED','Ticket checkout is not available yet.');
 if(domain==='live'&&process.env.PAYSTACK_LIVE_ENABLED!=='true')throw new AppError(503,'PAYMENTS_NOT_CONFIGURED','Live checkout is not enabled.');
 return {domain:domain as 'test'|'live',secret};
}
export const verificationSchema=z.object({id:z.union([z.number().int().positive().safe(),z.string().regex(/^\d+$/)]),domain:z.enum(['test','live']),status:z.string(),reference:z.string(),amount:z.number().int().nonnegative(),currency:z.string(),paid_at:z.string().nullable(),customer:z.object({email:z.email()})});
export type Verification=z.infer<typeof verificationSchema>;
export type Gateway={domain:'test'|'live';initialize:(input:{email:string;amount:number;currency:string;reference:string;callback_url:string})=>Promise<string>;verify:(reference:string)=>Promise<Verification>};
export function paystackGateway():Gateway{
 const {domain,secret}=paystackConfig();
 async function request(path:string,body?:unknown){
  try{const response=await fetch(`https://api.paystack.co${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store'});
   const result=await response.json();if(!response.ok||result.status!==true)throw new Error('Provider rejected request');return result.data;
  }catch{throw new AppError(503,'PAYMENT_PROVIDER_UNAVAILABLE','Payment confirmation is unavailable. Please check your order again shortly.');}
 }
 return {domain,initialize:async input=>{const data=z.object({reference:z.string(),authorization_url:z.url()}).parse(await request('/transaction/initialize',input));const url=new URL(data.authorization_url);if(data.reference!==input.reference||url.protocol!=='https:'||url.hostname!=='checkout.paystack.com'||url.username||url.password)throw new AppError(503,'INVALID_PROVIDER_RESPONSE','Checkout could not be started.');return url.href;},verify:async reference=>verificationSchema.parse(await request(`/transaction/verify/${encodeURIComponent(reference)}`))};
}
export function validWebhook(body:Buffer,signature:string|null){const {secret}=paystackConfig();if(!signature||!/^\w{128}$/.test(signature)||!/^[a-f0-9]+$/i.test(signature))return false;const expected=createHmac('sha512',secret).update(body).digest();const supplied=Buffer.from(signature,'hex');return supplied.length===expected.length&&timingSafeEqual(supplied,expected);}
