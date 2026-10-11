import {emailStatuses} from './ticket-emails';
import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {requireAdmin} from './admin';
import type {Identity} from './session';
import {concertSlug} from './ticketing';
import {AppError} from './errors';
import {paystackConfig} from './paystack';
import {requireTicketKey} from './ticket-tokens';
export const ticketFilters=z.object({mode:z.enum(['test','live']).default('test'),status:z.enum(['ALL','PAID','RESERVED','EXPIRED','CANCELLED','REFUNDED','RECONCILIATION']).default('ALL'),before:z.uuid().optional(),q:z.union([z.email(),z.uuid(),z.string().regex(/^rotm-[a-f0-9]{32}$/)]).optional()}).strict();
export const salesInput=z.object({revision:z.number().int().positive(),salesEnabled:z.boolean(),regularCapacity:z.number().int().min(0).max(1000000),vipCapacity:z.number().int().min(0).max(1000000),regularEnabled:z.boolean(),vipEnabled:z.boolean()}).strict();
export async function ticketOverview(db:PrismaClient,identity:Identity,mode:'test'|'live'){
 await requireAdmin(db,identity);
 const event=await db.event.findUnique({where:{slug:concertSlug()},select:{id:true,name:true,salesEnabled:true,settingsRevision:true,tiers:{where:{code:{in:['regular','vip']}},orderBy:{priceMinor:'asc'},select:{id:true,code:true,name:true,priceMinor:true,capacity:true,reserved:true,sold:true,active:true}}}});
 if(!event)throw new AppError(503,'EVENT_NOT_CONFIGURED','Concert is not configured.');
 const scoped:Prisma.OrderWhereInput={eventId:event.id,payments:{some:{domain:mode}}};
 const paid:Prisma.OrderWhereInput={eventId:event.id,status:'PAID',needsReconciliation:false,payments:{some:{domain:mode,status:'VERIFIED'}}};
 const [sales,reservations,reconciliation,tickets,admissions]=await Promise.all([
  db.order.aggregate({where:paid,_sum:{totalMinor:true},_count:true}),
  db.order.count({where:{...scoped,status:'RESERVED',expiresAt:{gt:new Date()}}}),
  db.order.count({where:{...scoped,needsReconciliation:true}}),
  db.ticket.count({where:{line:{order:paid},status:'ACTIVE'}}),
  db.admission.count({where:{ticket:{line:{order:{eventId:event.id,payments:{some:{domain:mode,status:'VERIFIED'}}}}}}}),
 ]);
 let configured=true,configuredMode:string|null=null;try{configuredMode=paystackConfig().domain;requireTicketKey();}catch{configured=false;}
 return {event,mode,environmentEnabled:process.env.TICKET_SALES_ENABLED==='true',paymentsConfigured:configured,configuredMode,summary:{paidOrders:sales._count,grossMinor:sales._sum.totalMinor??0,pendingReservations:reservations,reconciliation,activeTickets:tickets,admissions},updatedAt:new Date()};
}
export async function adminOrders(db:PrismaClient,identity:Identity,filters:z.infer<typeof ticketFilters>){
 await requireAdmin(db,identity);
 const where:Prisma.OrderWhereInput={event:{slug:concertSlug()},payments:{some:{domain:filters.mode}},...(filters.before?{id:{lt:filters.before}}:{}),...(filters.status==='RECONCILIATION'?{needsReconciliation:true}:filters.status!=='ALL'?{status:filters.status}:{})};
 if(filters.q)where.OR=[...(z.uuid().safeParse(filters.q).success?[{id:filters.q}]:[]),{buyerEmail:filters.q.toLowerCase()},{payments:{some:{reference:filters.q}}}];
 // Never include raw/encrypted ticket codes or checkout authorization URLs in organizer data.
 const found=await db.order.findMany({where,orderBy:{id:'desc'},take:51,select:{id:true,buyerName:true,buyerEmail:true,status:true,totalMinor:true,currency:true,needsReconciliation:true,createdAt:true,expiresAt:true,paidAt:true,lines:{select:{quantity:true,tier:{select:{name:true}},tickets:{select:{id:true,ordinal:true,status:true,admission:{select:{scannedAt:true}}},orderBy:{ordinal:'asc'}}}},payments:{select:{reference:true,status:true,domain:true,providerTransactionId:true,verifiedAt:true}}}});
 const selected=found.slice(0,50),emails=await emailStatuses(db,selected.map(o=>o.id));const orders=selected.map(o=>({...o,emailDelivery:emails.get(o.id)??null}));return {orders,nextCursor:found.length>50?orders.at(-1)!.id:null};
}
export async function configureSales(db:PrismaClient,identity:Identity,input:z.infer<typeof salesInput>){
 return db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;
  if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access is required.');
  const events=await tx.$queryRaw<{id:string;settingsRevision:number}[]>`SELECT id,"settingsRevision" FROM "Event" WHERE slug=${concertSlug()} FOR UPDATE`;
  const event=events[0];if(!event)throw new AppError(503,'EVENT_NOT_CONFIGURED','Concert is not configured.');
  if(event.settingsRevision!==input.revision)throw new AppError(409,'STALE_REVISION','Ticket settings changed. Reload before saving.');
  if(input.salesEnabled){if(process.env.TICKET_SALES_ENABLED!=='true')throw new AppError(403,'ENVIRONMENT_CLOSED','Set TICKET_SALES_ENABLED=true before opening sales.');paystackConfig();requireTicketKey();if(!(input.regularEnabled&&input.regularCapacity>0)&&!(input.vipEnabled&&input.vipCapacity>0))throw new AppError(400,'NO_TIERS_ENABLED','Enable at least one tier with capacity before opening sales.');}
  for(const config of [{code:'regular',capacity:input.regularCapacity,enabled:input.regularEnabled},{code:'vip',capacity:input.vipCapacity,enabled:input.vipEnabled}]){
   await tx.$queryRaw`SELECT id FROM "TicketTier" WHERE "eventId"=${event.id}::uuid AND code=${config.code} FOR UPDATE`;
   const tier=await tx.ticketTier.findUnique({where:{eventId_code:{eventId:event.id,code:config.code}}});
   if(!tier)throw new AppError(400,'TIERS_NOT_CONFIGURED','Run npm run db:seed before configuring ticket sales.');
   if(config.capacity<tier.reserved+tier.sold)throw new AppError(409,'CAPACITY_IN_USE',`${tier.name} capacity cannot be below its reserved plus sold tickets.`);
   await tx.ticketTier.update({where:{id:tier.id},data:{capacity:config.capacity,active:config.enabled&&config.capacity>0}});
  }
  const result=await tx.event.update({where:{id:event.id},data:{salesEnabled:input.salesEnabled,settingsRevision:{increment:1}},select:{settingsRevision:true}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'TICKET_SETTINGS_UPDATED',entityType:'Event',entityId:event.id,metadata:{...input,newRevision:result.settingsRevision}}});return result;
 },{maxWait:10000,timeout:15000});
}
