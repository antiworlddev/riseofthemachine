import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {requireAdmin} from './admin';
import {AppError} from './errors';
import type {Identity} from './session';
const image=z.string().trim().max(2000).refine(value=>{if(!value)return true;if(/^\/(images|assets|merch)\/[A-Za-z0-9_./-]+$/.test(value)&&!value.includes('..'))return true;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Use an HTTPS image URL or a local /images/, /assets/ or /merch/ asset path.');
const label=z.string().trim().min(1).max(80).refine(s=>!s.startsWith('__edit_'),'Choose a different variant label.');
const details={name:z.string().trim().min(2).max(150),description:z.string().trim().min(1).max(2000),kind:z.enum(['TEE','CAP','SATCHEL','OTHER']),priceMinor:z.number().int().min(100).max(100000000),imageUrl:image};
export const catalogInput=z.object({productId:z.uuid().nullable(),revision:z.number().int().positive().nullable(),...details,variants:z.array(z.object({id:z.uuid().nullable(),label,enabled:z.boolean()}).strict()).min(1).max(100),reason:z.string().trim().min(5).max(500),confirmed:z.literal(true)}).strict().refine(x=>(x.productId===null)===(x.revision===null),'Include the existing product revision.').refine(x=>new Set(x.variants.map(v=>v.label.toLowerCase())).size===x.variants.length,'Variant labels must be distinct.').refine(x=>new Set(x.variants.filter(v=>v.id).map(v=>v.id!.toLowerCase())).size===x.variants.filter(v=>v.id).length,'Duplicate variant IDs.');
const selection={id:true,slug:true,revision:true,name:true,description:true,kind:true,priceMinor:true,imageUrl:true,active:true,variants:{orderBy:{label:'asc' as const},select:{id:true,label:true,enabled:true,capacity:true,reserved:true,sold:true}}} as const;
export async function adminCatalog(db:PrismaClient,identity:Identity){await requireAdmin(db,identity);return {products:await db.merchProduct.findMany({select:selection,orderBy:{slug:'asc'}})};}
export async function saveCatalog(db:PrismaClient,identity:Identity,raw:z.infer<typeof catalogInput>){
 const parsed=catalogInput.safeParse(raw);if(!parsed.success)throw new AppError(400,'INVALID_CATALOG',parsed.error.issues[0]?.message??'Check product details.');const input=parsed.data;
 return db.$transaction(async tx=>{
  const actors=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;
  if(!actors.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access required.');
  if(input.productId)await tx.$queryRaw`SELECT id FROM "MerchProduct" WHERE id=${input.productId}::uuid FOR UPDATE`;
  const before=input.productId?await tx.merchProduct.findUnique({where:{id:input.productId},include:{variants:true}}):null;
  if(input.productId&&!before)throw new AppError(404,'PRODUCT_NOT_FOUND','Product not found.');
  if(before&&before.revision!==input.revision)throw new AppError(409,'STALE_CATALOG','Product or stock changed. Reload before saving.');
  if(before){
   await tx.$queryRaw`SELECT id FROM "MerchVariant" WHERE "productId"=${before.id}::uuid ORDER BY id FOR UPDATE`;
   if(before.variants.some(v=>!input.variants.some(i=>i.id===v.id))||input.variants.some(v=>v.id&&!before.variants.some(i=>i.id===v.id)))throw new AppError(400,'INVALID_VARIANTS','Retain every existing variant. Disable variants instead of deleting them.');
   // Two-pass temporary labels permit swapping names under the unique product/label constraint.
   await tx.$executeRaw`UPDATE "MerchVariant" SET label='__edit_' || id::text WHERE "productId"=${before.id}::uuid`;
  }else if(input.variants.some(v=>v.id))throw new AppError(400,'INVALID_VARIANTS','New product variants must not contain existing IDs.');
  const data={name:input.name,description:input.description,kind:input.kind,priceMinor:input.priceMinor,imageUrl:input.imageUrl||null};
  const product=before?await tx.merchProduct.update({where:{id:before.id},data:{...data,revision:{increment:1}}}):await tx.merchProduct.create({data:{...data,slug:`product-${crypto.randomUUID()}`,active:false}});
  const existing=input.variants.filter(v=>v.id);if(existing.length){const values=existing.map(v=>Prisma.sql`(${v.id}::uuid,${v.label}::text,${v.enabled}::boolean)`);await tx.$executeRaw`UPDATE "MerchVariant" v SET label=x.label, enabled=x.enabled FROM (VALUES ${Prisma.join(values)}) AS x(id,label,enabled) WHERE v.id=x.id`;}
  const added=input.variants.filter(v=>!v.id);if(added.length)await tx.merchVariant.createMany({data:added.map(v=>({productId:product.id,label:v.label,enabled:v.enabled}))});
  const saved=await tx.merchProduct.findUniqueOrThrow({where:{id:product.id},select:selection});
  await tx.auditLog.create({data:{actorId:actors[0].id,action:before?'MERCH_CATALOG_UPDATED':'MERCH_PRODUCT_CREATED',entityType:'MerchProduct',entityId:product.id,metadata:{reason:input.reason,fromName:before?.name??null,toName:product.name,fromPriceMinor:before?.priceMinor??null,toPriceMinor:product.priceMinor,newRevision:product.revision,beforeVariants:before?.variants.map(v=>({id:v.id,label:v.label,enabled:v.enabled}))??[],variants:saved.variants.map(v=>({id:v.id,label:v.label,enabled:v.enabled}))}}});
  return saved;
 },{maxWait:10000,timeout:15000});
}
