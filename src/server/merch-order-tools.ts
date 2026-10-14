import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {requireAdmin} from './admin';
import {AppError} from './errors';
import {concertSlug} from './ticketing';
import type {Identity} from './session';
export const merchOrderFilters=z.object({mode:z.enum(['test','live']).default('test'),status:z.enum(['ALL','PAID','RESERVED','EXPIRED','CANCELLED','REFUNDED','RECONCILIATION']).default('ALL'),fulfilment:z.enum(['ALL','PICKUP','DELIVERY']).default('ALL'),fulfilmentStatus:z.enum(['ALL','PENDING','READY','DISPATCHED','COMPLETED']).default('ALL'),q:z.string().trim().min(1).max(254).optional(),from:z.iso.datetime({offset:true}).optional(),to:z.iso.datetime({offset:true}).optional(),before:z.uuid().optional()}).strict().refine(f=>!f.from||!f.to||new Date(f.from)<=new Date(f.to),'End date must follow start date.');
export type MerchFilters=z.infer<typeof merchOrderFilters>;
export function merchOrderWhere(f:MerchFilters):Prisma.MerchOrderWhereInput{
 const where:Prisma.MerchOrderWhereInput={eventSlug:concertSlug(),payments:{some:{domain:f.mode}},...(f.status==='RECONCILIATION'?{needsReconciliation:true}:f.status!=='ALL'?{status:f.status}:{}),...(f.fulfilment!=='ALL'?{fulfilment:f.fulfilment}:{}),...(f.fulfilmentStatus!=='ALL'?{fulfilmentStatus:f.fulfilmentStatus}:{}),...((f.from||f.to)?{createdAt:{...(f.from?{gte:new Date(f.from)}:{}),...(f.to?{lte:new Date(f.to)}:{})}}:{})};
 if(f.q){const q=f.q.toLowerCase();where.OR=[{buyerEmail:{equals:q,mode:'insensitive'}},{buyerName:{contains:f.q,mode:'insensitive'}},{phone:{equals:f.q}},{payments:{some:{domain:f.mode,reference:q}}},...(z.uuid().safeParse(q).success?[{id:q}]:[])];}
 return where;
}
export const adminMerchSelect={shippingFeeMinor:true,shippingSnapshot:true,refund:{select:{status:true,amountMinor:true,currency:true}},id:true,buyerName:true,buyerEmail:true,phone:true,fulfilment:true,address:true,deliveryTerms:true,status:true,totalMinor:true,createdAt:true,expiresAt:true,needsReconciliation:true,fulfilmentStatus:true,trackingNote:true,revision:true,lines:{select:{productName:true,variantLabel:true,quantity:true,unitPriceMinor:true}},payments:{select:{reference:true,domain:true,status:true}}} satisfies Prisma.MerchOrderSelect;
export async function merchOrderOverview(db:PrismaClient,identity:Identity,filters:MerchFilters){
 await requireAdmin(db,identity);const where=merchOrderWhere(filters);
 return db.$transaction(async tx=>{
  let boundary:Prisma.MerchOrderWhereInput={};if(filters.before){const cursor=await tx.merchOrder.findUnique({where:{id:filters.before},select:{id:true,createdAt:true}});if(!cursor)throw new AppError(400,'INVALID_CURSOR','Reload orders.');boundary={OR:[{createdAt:{lt:cursor.createdAt}},{createdAt:cursor.createdAt,id:{lt:cursor.id}}]};}
  const found=await tx.merchOrder.findMany({where:{AND:[where,boundary]},orderBy:[{createdAt:'desc'},{id:'desc'}],take:51,select:adminMerchSelect});
  const total=await tx.merchOrder.count({where}),paid=await tx.merchOrder.aggregate({where:{AND:[where,{status:'PAID',needsReconciliation:false,payments:{some:{domain:filters.mode,status:'VERIFIED'}}}]},_count:true,_sum:{totalMinor:true}}),review=await tx.merchOrder.count({where:{AND:[where,{needsReconciliation:true}]}});
  return {orders:found.slice(0,50),nextCursor:found.length>50?found[49].id:null,summary:{matchedOrders:total,paidOrders:paid._count,paidTotalMinor:paid._sum.totalMinor??0,reconciliationOrders:review}};
 },{isolationLevel:'RepeatableRead',maxWait:10000,timeout:15000});
}
export function csvCell(raw:unknown){let v=raw==null?'':String(raw);if(/^[\s]*[=+@-]/.test(v)||/^[\t\r\n]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';}
export async function exportMerchOrders(db:PrismaClient,identity:Identity,filters:MerchFilters){
 await requireAdmin(db,identity);const orders=await db.merchOrder.findMany({where:merchOrderWhere(filters),orderBy:[{createdAt:'desc'},{id:'desc'}],take:501,select:adminMerchSelect});
 if(orders.length>500)throw new AppError(409,'EXPORT_TOO_LARGE','Export supports 500 orders. Narrow the date range or filters and try again.');
 const headers=['Mode','Order ID','Created UTC','Buyer','Email','Phone','Payment status','Payment review','Refund status','Fulfilment','Fulfilment status','Address','Delivery terms','Tracking note','Product','Variant','Quantity','Unit price NGN','Order total NGN','Shipping paid NGN'];
 const rows=orders.flatMap(o=>o.lines.map(l=>{const a=o.address&&typeof o.address==='object'&&!Array.isArray(o.address)?o.address:null;return [filters.mode,o.id,o.createdAt.toISOString(),o.buyerName,o.buyerEmail,o.phone,o.status,o.needsReconciliation?'YES':'NO',o.refund?.status??'',o.fulfilment,o.fulfilmentStatus,a?['line1','city','state','country'].map(k=>a[k]).filter(Boolean).join(', '):'',o.deliveryTerms,o.trackingNote,l.productName,l.variantLabel,l.quantity,(l.unitPriceMinor/100).toFixed(2),(o.totalMinor/100).toFixed(2),(o.shippingFeeMinor/100).toFixed(2)];}));
 return '\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
