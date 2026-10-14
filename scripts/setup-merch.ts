import {Prisma, PrismaClient} from '@prisma/client';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {paystackConfig} from '../src/server/paystack';

export async function configureMerchStock(db: PrismaClient, requestedCapacity: number, open: boolean) {
 const capacity=z.number().int().min(0).max(1000000).parse(requestedCapacity);
 if(open){paystackConfig();if(process.env.MERCH_SALES_ENABLED!=='true')throw new Error('Set MERCH_SALES_ENABLED=true before opening merch.');}
 await db.$transaction(async tx=>{
  // Match checkout lock order: all products first, then all variants, sorted by ID.
  const products=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "MerchProduct" ORDER BY id FOR UPDATE`;
  if(!products.length)throw new Error('Run npm run db:seed first.');
  const productIds=products.map(p=>p.id);
  const variants=await tx.$queryRaw<{id:string;reserved:number;sold:number}[]>`
   SELECT id, reserved, sold FROM "MerchVariant"
   WHERE "productId" IN (${Prisma.join(productIds.map(id=>Prisma.sql`${id}::uuid`))})
   ORDER BY id FOR UPDATE`;
  if(variants.some(v=>capacity<v.reserved+v.sold))throw new Error('Capacity cannot be below reserved plus sold.');
  await tx.merchVariant.updateMany({where:{id:{in:variants.map(v=>v.id)}},data:{capacity}});
  await tx.merchProduct.updateMany({where:{id:{in:productIds}},data:{active:open&&capacity>0,revision:{increment:1}}});
  await tx.auditLog.create({data:{action:'MERCH_STOCK_CONFIGURED_BY_CLI',entityType:'MerchProduct',entityId:'catalog',metadata:{capacityPerVariant:capacity,open}}});
 },{maxWait:15000,timeout:60000});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const capacity=z.coerce.number().int().min(0).max(1000000).parse(process.argv[2]),open=process.argv[3]==='--open';
 const db=new PrismaClient();
 try{
  await configureMerchStock(db,capacity,open);
  console.log(`Merch ${open?'opened':'closed'}; total capacity per variant: ${capacity}.`);
 }finally{await db.$disconnect();}
}
