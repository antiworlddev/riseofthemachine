import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {requireAdmin} from './admin';
import {AppError} from './errors';
import type {Identity} from './session';
import {paystackConfig} from './paystack';
const capacity=z.number().int().min(0).max(1000000);
export const inventoryInput=z.object({productId:z.uuid(),expectedActive:z.boolean(),active:z.boolean(),variants:z.array(z.object({id:z.uuid(),expectedCapacity:capacity,capacity}).strict()).min(1).max(100)}).strict().refine(v=>new Set(v.variants.map(x=>x.id)).size===v.variants.length,'Duplicate variant.');
export async function merchInventory(db:PrismaClient,identity:Identity){
 await requireAdmin(db,identity);
 const products=await db.merchProduct.findMany({orderBy:{slug:'asc'},select:{id:true,name:true,priceMinor:true,active:true,variants:{orderBy:{label:'asc'},select:{id:true,label:true,enabled:true,capacity:true,reserved:true,sold:true}}}});
 return {products:products.map(p=>({...p,variants:p.variants.map(v=>({...v,available:v.capacity-v.reserved-v.sold}))})),salesEnabled:process.env.MERCH_SALES_ENABLED==='true'};
}
export async function updateInventory(db:PrismaClient,identity:Identity,input:z.infer<typeof inventoryInput>){
 return db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;
  if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access required.');
  const products=await tx.$queryRaw<{id:string;active:boolean}[]>`SELECT id,active FROM "MerchProduct" WHERE id=${input.productId}::uuid FOR UPDATE`;
  const product=products[0];if(!product)throw new AppError(404,'PRODUCT_NOT_FOUND','Product not found.');
  const variants=await tx.$queryRaw<{id:string;capacity:number;reserved:number;sold:number}[]>`SELECT id,capacity,reserved,sold FROM "MerchVariant" WHERE "productId"=${product.id}::uuid ORDER BY id FOR UPDATE`;
  if(variants.length!==input.variants.length||variants.some(v=>!input.variants.some(i=>i.id===v.id)))throw new AppError(400,'INVALID_VARIANTS','Include each variant belonging to this product.');
  if(product.active!==input.expectedActive||variants.some(v=>input.variants.find(i=>i.id===v.id)!.expectedCapacity!==v.capacity))throw new AppError(409,'STALE_INVENTORY','Stock settings changed. Reload before saving.');
  if(variants.some(v=>input.variants.find(i=>i.id===v.id)!.capacity<v.reserved+v.sold))throw new AppError(409,'STOCK_IN_USE','Total capacity cannot be below reserved plus sold. Reload for current counts.');
  if(input.active){paystackConfig();if(process.env.MERCH_SALES_ENABLED!=='true')throw new AppError(409,'MERCH_CLOSED','Enable MERCH_SALES_ENABLED before opening product sales.');}
  const rows=input.variants.map(v=>Prisma.sql`(${v.id}::uuid,${v.capacity}::integer)`);
  await tx.$executeRaw`UPDATE "MerchVariant" v SET capacity=x.capacity FROM (VALUES ${Prisma.join(rows)}) AS x(id,capacity) WHERE v.id=x.id`;
  await tx.merchProduct.update({where:{id:product.id},data:{active:input.active,revision:{increment:1}}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'MERCH_INVENTORY_UPDATED',entityType:'MerchProduct',entityId:product.id,metadata:{fromActive:product.active,toActive:input.active,variants:input.variants.map(v=>({id:v.id,from:v.expectedCapacity,to:v.capacity}))}}});
  return {saved:true};
 },{maxWait:10000,timeout:15000});
}
