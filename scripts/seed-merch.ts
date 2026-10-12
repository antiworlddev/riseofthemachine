import type {PrismaClient} from '@prisma/client';
export async function seedMerch(db:PrismaClient){
 const products=[...['Machine Tee 01','Machine Tee 02','Machine Tee 03'].map((name,i)=>({slug:`tee-${i+1}`,name,kind:'TEE',priceMinor:5000000})),...['Machine Cap 01','Machine Cap 02'].map((name,i)=>({slug:`cap-${i+1}`,name,kind:'CAP',priceMinor:3000000})),{slug:'satchel-1',name:'Machine Satchel',kind:'SATCHEL',priceMinor:3000000}];
 for(const p of products){const product=await db.merchProduct.upsert({where:{slug:p.slug},update:{},create:{...p,description:'Placeholder design for the RISE OF THE MACHINE merch collection.'}});for(const label of p.kind==='TEE'?['S','M','L','XL']:['One size'])await db.merchVariant.upsert({where:{productId_label:{productId:product.id,label}},update:{},create:{productId:product.id,label}});}
}
