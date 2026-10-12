import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {AppError} from './errors';
import {requireAdmin} from './admin';
import {seal,unseal,type Identity} from './session';
import {concertSlug} from './ticketing';
import {paystackConfig} from './paystack';
import {merchItems,cartHash,pricesHash} from './merch-cart';
export const deliveryTerms='The delivery fee is included in your checkout total. Courier/tracking details will be shared when your order is dispatched.';
const quoteBase={items:merchItems};
export const quoteInput=z.discriminatedUnion('fulfilment',[z.object({...quoteBase,fulfilment:z.literal('PICKUP')}).strict(),z.object({...quoteBase,fulfilment:z.literal('DELIVERY'),shippingRateId:z.uuid().transform(v=>v.toLowerCase())}).strict()]);
const claims=z.object({subject:z.string(),eventSlug:z.string(),domain:z.enum(['test','live']),cartHash:z.string(),pricesHash:z.string(),fulfilment:z.enum(['PICKUP','DELIVERY']),shippingRateId:z.uuid().nullable(),shippingRevision:z.number().int().nullable(),state:z.string().nullable(),shippingFeeMinor:z.number().int().nonnegative(),subtotalMinor:z.number().int().positive(),totalMinor:z.number().int().positive(),note:z.string().nullable()});
export async function readMerchQuote(token:string,identity:Identity,items:{variantId:string;quantity:number}[],fulfilment:'PICKUP'|'DELIVERY',domain:'test'|'live'){
 try{const quote=claims.parse(await unseal(token,'merch-quote'));if(quote.subject!==identity.subject||quote.eventSlug!==concertSlug()||quote.domain!==domain||quote.fulfilment!==fulfilment||quote.cartHash!==cartHash(items))throw new Error();return quote;}catch{throw new AppError(409,'QUOTE_INVALID','Your price quote changed or expired. Refresh the quote before checkout.');}
}
export async function createMerchQuote(db:PrismaClient,identity:Identity,input:z.infer<typeof quoteInput>,domain:'test'|'live'=paystackConfig().domain){
 if(process.env.MERCH_SALES_ENABLED!=='true')throw new AppError(403,'MERCH_CLOSED','Merch sales are currently closed.');
 const details=await db.$transaction(async tx=>{
  let rate=null;
  if(input.fulfilment==='DELIVERY'){
   await tx.$queryRaw`SELECT id FROM "ShippingRate" WHERE id=${input.shippingRateId}::uuid FOR SHARE`;
   rate=await tx.shippingRate.findUnique({where:{id:input.shippingRateId}});
   if(!rate?.enabled||rate.eventSlug!==concertSlug())throw new AppError(409,'DELIVERY_UNAVAILABLE','Delivery is unavailable for the selected state. Choose pickup or another available destination.');
  }
  const ids=await tx.merchVariant.findMany({where:{id:{in:input.items.map(i=>i.variantId)}},select:{productId:true}});
  for(const id of [...new Set(ids.map(v=>v.productId))].sort())await tx.$queryRaw`SELECT id FROM "MerchProduct" WHERE id=${id}::uuid FOR SHARE`;
  const variants=await tx.merchVariant.findMany({where:{id:{in:input.items.map(i=>i.variantId)}},include:{product:true}});
  const lines=input.items.map(i=>{const v=variants.find(v=>v.id===i.variantId);if(!v?.product.active||v.capacity-v.reserved-v.sold<i.quantity)throw new AppError(409,'SOLD_OUT','A cart item is unavailable. Update your bag before requesting a quote.');return {variantId:v.id,quantity:i.quantity,unitPriceMinor:v.product.priceMinor,productName:v.product.name,variantLabel:v.label};});
  const subtotalMinor=lines.reduce((n,l)=>n+l.quantity*l.unitPriceMinor,0),shippingFeeMinor=rate?.feeMinor??0,totalMinor=subtotalMinor+shippingFeeMinor;
  if(!Number.isSafeInteger(totalMinor)||totalMinor<=0||totalMinor>2147483647)throw new AppError(400,'INVALID_TOTAL','Order total is invalid.');
  return {lines,subtotalMinor,shippingFeeMinor,totalMinor,rate};
 },{maxWait:10000,timeout:15000});
 const {rate,lines,...totals}=details;
 const expiresAt=new Date((Math.floor(Date.now()/1000)+600)*1000);
 const quoteToken=await seal({...totals,subject:identity.subject,eventSlug:concertSlug(),domain,cartHash:cartHash(input.items),pricesHash:pricesHash(lines),fulfilment:input.fulfilment,shippingRateId:rate?.id??null,shippingRevision:rate?.revision??null,state:rate?.state??null,note:rate?.note??null},'merch-quote',600);
 return {...totals,lines,quoteToken,expiresAt,state:rate?.state??null,note:rate?.note??null};
}
export const shippingInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),state:z.string().trim().min(2).max(80),feeMinor:z.number().int().min(0).max(100000000),note:z.string().trim().min(5).max(300),enabled:z.boolean()}).strict(),
 z.object({action:z.literal('update'),id:z.uuid(),revision:z.number().int().positive(),feeMinor:z.number().int().min(0).max(100000000),note:z.string().trim().min(5).max(300),enabled:z.boolean()}).strict()
]);
export async function shippingRates(db:PrismaClient,identity:Identity){await requireAdmin(db,identity);return {rates:await db.shippingRate.findMany({where:{eventSlug:concertSlug()},orderBy:{state:'asc'}})};}
export async function configureShipping(db:PrismaClient,identity:Identity,input:z.infer<typeof shippingInput>){
 try{return await db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access required.');
  let rate,previous=null;
  if(input.action==='create'){rate=await tx.shippingRate.create({data:{eventSlug:concertSlug(),state:input.state.trim(),stateKey:input.state.trim().toLowerCase().replace(/\s+/g,' '),feeMinor:input.feeMinor,note:input.note,enabled:input.enabled}});}
  else{
   await tx.$queryRaw`SELECT id FROM "ShippingRate" WHERE id=${input.id}::uuid FOR UPDATE`;previous=await tx.shippingRate.findUnique({where:{id:input.id}});
   if(!previous||previous.eventSlug!==concertSlug())throw new AppError(404,'SHIPPING_RATE_NOT_FOUND','Shipping rate not found.');
   if(previous.revision!==input.revision)throw new AppError(409,'STALE_REVISION','Delivery rate changed. Reload before saving.');
   rate=await tx.shippingRate.update({where:{id:input.id},data:{feeMinor:input.feeMinor,note:input.note,enabled:input.enabled,revision:{increment:1}}});
  }
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'SHIPPING_RATE_CONFIGURED',entityType:'ShippingRate',entityId:rate.id,metadata:{state:rate.state,from:previous?{feeMinor:previous.feeMinor,enabled:previous.enabled,revision:previous.revision}:null,to:{feeMinor:rate.feeMinor,enabled:rate.enabled,revision:rate.revision}}}});return rate;
 },{maxWait:10000,timeout:15000});}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')throw new AppError(409,'SHIPPING_RATE_EXISTS','A rate already exists for that state. Update the existing rate.');throw e;}
}
