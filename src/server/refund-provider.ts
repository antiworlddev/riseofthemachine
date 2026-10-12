import {z} from 'zod';
import {paystackConfig,paystackGateway,type Verification} from './paystack';
import {AppError} from './errors';
const id=z.union([z.number().int().positive().safe(),z.string().regex(/^\d+$/)]).transform(String);
export const refundSchema=z.object({id,transaction:z.union([id,z.object({id})]).transform(v=>typeof v==='string'?v:v.id),domain:z.enum(['test','live']),amount:z.number().int().positive(),currency:z.string(),status:z.enum(['pending','processing','needs-attention','failed','processed'])});
export type ProviderRefund=z.infer<typeof refundSchema>;
export type RefundGateway={domain:'test'|'live';verify:(reference:string)=>Promise<Verification>;create:(transactionId:string,amountMinor:number,note:string)=>Promise<ProviderRefund>;fetch:(id:string)=>Promise<ProviderRefund>;list:(transactionId:string)=>Promise<ProviderRefund[]>};
export function refundGateway():RefundGateway{
 const {domain,secret}=paystackConfig();
 async function request(path:string,body?:unknown){try{const r=await fetch('https://api.paystack.co'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store'});const json=await r.json();if(!r.ok||json.status!==true)throw new Error();return json.data;}catch{throw new AppError(503,'REFUND_PROVIDER_UNAVAILABLE','Refund status is uncertain. Check provider status before taking further action.');}}
 return {domain,verify:paystackGateway().verify,create:async(transaction,amount,merchant_note)=>refundSchema.parse(await request('/refund',{transaction,amount,currency:'NGN',merchant_note})),fetch:async id=>refundSchema.parse(await request('/refund/'+encodeURIComponent(id))),list:async transaction=>z.array(refundSchema).max(100).parse(await request('/refund?transaction='+encodeURIComponent(transaction)+'&perPage=100'))};
}
