import {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {concertSlug} from '../src/server/ticketing';
import {paystackConfig} from '../src/server/paystack';
import {requireTicketKey} from '../src/server/ticket-tokens';
const capacity=z.coerce.number().int().min(0).max(1000000);
const regular=capacity.parse(process.argv[2]),vip=capacity.parse(process.argv[3]),open=process.argv[4]==='--open';
if(open){paystackConfig();requireTicketKey();if(process.env.TICKET_SALES_ENABLED!=='true')throw new Error('Set TICKET_SALES_ENABLED=true before opening sales.');}
const db=new PrismaClient({transactionOptions:{maxWait:10000,timeout:15000}});
try{
 await db.$transaction(async tx=>{
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Event" WHERE slug=${concertSlug()} FOR UPDATE`;
  const event=rows[0];if(!event)throw new Error('Run npm run db:seed first.');
  for(const input of [{code:'regular',name:'Regular',priceMinor:2000000,capacity:regular},{code:'vip',name:'VIP',priceMinor:10000000,capacity:vip}]){
   await tx.$queryRaw`SELECT id FROM "TicketTier" WHERE "eventId"=${event.id}::uuid AND code=${input.code} FOR UPDATE`;
   const tier=await tx.ticketTier.findUnique({where:{eventId_code:{eventId:event.id,code:input.code}}});
   if(tier&&input.capacity<tier.reserved+tier.sold)throw new Error('Capacity cannot be below reserved plus sold.');
   await tx.ticketTier.upsert({where:{eventId_code:{eventId:event.id,code:input.code}},create:{eventId:event.id,...input,active:input.capacity>0},update:{capacity:input.capacity,priceMinor:input.priceMinor,name:input.name,active:input.capacity>0}});
  }
  await tx.event.update({where:{id:event.id},data:{salesEnabled:open,settingsRevision:{increment:1}}});
  await tx.auditLog.create({data:{action:'TICKET_SALES_CONFIGURED_BY_CLI',entityType:'Event',entityId:event.id,metadata:{regularCapacity:regular,vipCapacity:vip,open}}});
 });
 console.log(open?'Ticket inventory configured and sales opened.':'Ticket inventory configured; sales closed.');
}finally{await db.$disconnect();}
