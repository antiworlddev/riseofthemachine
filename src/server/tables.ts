import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {concertSlug} from './ticketing';
import {tablePackages} from './table-stock';
import {AppError} from './errors';
import type {Identity} from './session';
import {requireAdmin} from './admin';
import {admissionMode} from './admission';
import {paystackConfig} from './paystack';
import {requireTicketKey} from './ticket-tokens';
export const tableSettingsInput=z.object({revision:z.number().int().positive(),parkingCapacity:z.number().int().min(0).max(1000000),packages:z.array(z.object({code:z.enum(['engines','autobots','machineries']),capacity:z.number().int().min(0).max(100000),active:z.boolean(),parkingPerTable:z.number().int().min(1).max(100).nullable()}).strict()).length(3)}).strict().refine(v=>new Set(v.packages.map(p=>p.code)).size===3,'Supply each table category once.');
export const bookingInput=z.discriminatedUnion('action',[z.object({action:z.literal('assign'),orderId:z.uuid(),revision:z.number().int().positive(),tableLabel:z.string().trim().max(80),note:z.string().trim().max(500)}).strict(),z.object({action:z.literal('arrive'),orderId:z.uuid(),revision:z.number().int().positive(),confirmed:z.literal(true)}).strict()]);
export const tableFilters=z.object({mode:z.enum(['test','live']).default('test'),before:z.uuid().optional()}).strict();
export async function tableOverview(db:PrismaClient,identity:Identity,input:z.infer<typeof tableFilters>){
 await requireAdmin(db,identity);
 const event=await db.event.findUnique({where:{slug:concertSlug()},select:{id:true,salesEnabled:true,tableInventory:true,tiers:{where:{code:{in:tablePackages.map(p=>p.code)}},orderBy:{priceMinor:'asc'}}}});
 if(!event?.tableInventory||event.tiers.length!==3)throw new AppError(503,'TABLES_NOT_CONFIGURED','Run npm run db:seed to create table categories.');
 const orders=await db.order.findMany({where:{eventId:event.id,payments:{some:{domain:input.mode}},lines:{some:{tier:{code:{in:tablePackages.map(p=>p.code)}}}},...(input.before?{id:{lt:input.before}}:{})},orderBy:{id:'desc'},take:51,select:{id:true,buyerName:true,buyerEmail:true,status:true,totalMinor:true,needsReconciliation:true,tableLabel:true,bookingNote:true,bookingRevision:true,tableArrivedAt:true,createdAt:true,paidAt:true,refund:{select:{status:true}},lines:{select:{quantity:true,parkingQuantity:true,tier:{select:{name:true,code:true}},parkingPasses:{select:{id:true,ordinal:true,status:true,admission:{select:{scannedAt:true}}}}}},payments:{select:{reference:true,status:true,domain:true}}}});
 return {event,checkInMode:admissionMode(),orders:orders.slice(0,50),nextCursor:orders.length>50?orders[49].id:null};
}
export async function configureTables(db:PrismaClient,identity:Identity,input:z.infer<typeof tableSettingsInput>){
 return db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;
  if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access required.');
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Event" WHERE slug=${concertSlug()} FOR UPDATE`;
  if(!rows.length)throw new AppError(503,'TABLES_NOT_CONFIGURED','Run npm run db:seed.');
  const eventId=rows[0].id;
  for(const p of [...input.packages].sort((a,b)=>a.code.localeCompare(b.code))){
   await tx.$queryRaw`SELECT id FROM "TicketTier" WHERE "eventId"=${eventId}::uuid AND code=${p.code} FOR UPDATE`;
   const tier=await tx.ticketTier.findUnique({where:{eventId_code:{eventId,code:p.code}}});
   if(!tier)throw new AppError(503,'TABLES_NOT_CONFIGURED','Run npm run db:seed.');
   if(p.capacity<tier.reserved+tier.sold)throw new AppError(409,'CAPACITY_IN_USE',`${tier.name} capacity is in use.`);
   if(p.active&&(!p.parkingPerTable||p.capacity<1||input.parkingCapacity<p.parkingPerTable))throw new AppError(400,'PARKING_NOT_CONFIGURED','Configure table capacity and included VIP parking before enabling a category.');
   if(p.active){if(process.env.TICKET_SALES_ENABLED!=='true')throw new AppError(403,'SALES_CLOSED','Enable TICKET_SALES_ENABLED before activating table categories.');paystackConfig();requireTicketKey();}
   await tx.ticketTier.update({where:{id:tier.id},data:{name:tablePackages.find(v=>v.code===p.code)!.name,capacity:p.capacity,active:p.active,parkingPerTable:p.parkingPerTable}});
  }
  await tx.$queryRaw`SELECT "eventId" FROM "TableInventory" WHERE "eventId"=${eventId}::uuid FOR UPDATE`;
  const inventory=await tx.tableInventory.findUnique({where:{eventId}});
  if(!inventory)throw new AppError(503,'TABLES_NOT_CONFIGURED','Run npm run db:seed.');
  if(inventory.revision!==input.revision)throw new AppError(409,'STALE_REVISION','Table settings changed. Reload.');
  if(input.parkingCapacity<inventory.parkingReserved+inventory.parkingSold)throw new AppError(409,'PARKING_CAPACITY_IN_USE','Parking capacity cannot fall below reserved and sold passes.');
  const updated=await tx.tableInventory.update({where:{eventId},data:{parkingCapacity:input.parkingCapacity,revision:{increment:1}}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'TABLE_SETTINGS_UPDATED',entityType:'Event',entityId:eventId,metadata:{...input,newRevision:updated.revision}}});return updated;
 },{maxWait:10000,timeout:15000});
}
export async function assignTable(db:PrismaClient,identity:Identity,input:z.infer<typeof bookingInput>){
 try{return await db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;
  if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access required.');
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${input.orderId}::uuid FOR UPDATE`;
  const order=await tx.order.findUnique({where:{id:input.orderId},include:{event:true,lines:{include:{tier:true}},payments:true,refund:true}});
  if(!order||order.event.slug!==concertSlug()||order.lines.length!==1||!tablePackages.some(p=>p.code===order.lines[0].tier.code))throw new AppError(404,'BOOKING_NOT_FOUND','Table booking not found.');
  if(order.bookingRevision!==input.revision)throw new AppError(409,'STALE_REVISION','Booking changed. Reload.');
  if(order.status!=='PAID'||order.needsReconciliation||order.refund||!order.payments.some(p=>p.status==='VERIFIED'))throw new AppError(409,'BOOKING_NOT_CONFIRMED','Only verified paid bookings can be assigned.');
  if(input.action==='arrive'){
   if(!order.payments.some(p=>p.status==='VERIFIED'&&p.domain===admissionMode()))throw new AppError(409,'WRONG_MODE','Booking payment does not match the configured check-in mode.');
   if(order.tableArrivedAt)throw new AppError(409,'ALREADY_ARRIVED','This table booking has already checked in.');
   const updated=await tx.order.update({where:{id:order.id},data:{tableArrivedAt:new Date(),bookingRevision:{increment:1}},select:{bookingRevision:true}});
   await tx.auditLog.create({data:{actorId:staff[0].id,action:'TABLE_BOOKING_ARRIVED',entityType:'Order',entityId:order.id,metadata:{mode:admissionMode()}}});return updated;
  }
  const updated=await tx.order.update({where:{id:order.id},data:{tableLabel:input.tableLabel.toUpperCase()||null,bookingNote:input.note||null,bookingRevision:{increment:1}},select:{bookingRevision:true}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'TABLE_BOOKING_ASSIGNED',entityType:'Order',entityId:order.id,metadata:{beforeLabel:order.tableLabel,tableLabel:input.tableLabel.toUpperCase(),note:input.note}}});return updated;
 },{maxWait:10000,timeout:15000});}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')throw new AppError(409,'TABLE_ALREADY_ASSIGNED','That table label is assigned to another paid booking.');throw e;}
}
