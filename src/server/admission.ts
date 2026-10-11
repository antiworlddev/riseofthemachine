import {type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import type {Identity} from './session';
import {AppError} from './errors';
import {concertSlug} from './ticketing';
import {hashTicket} from './ticket-tokens';
export const scanInput=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/,'Enter a valid ticket code.')}).strict();
export function admissionMode(){const mode=process.env.ADMISSION_MODE??'live';if(mode!=='test'&&mode!=='live')throw new AppError(503,'SCANNER_NOT_CONFIGURED','Check-in is not configured.');return mode;}
export async function scannerSession(db:PrismaClient,identity:Identity){const staff=await db.staffUser.findUnique({where:{authSubject:identity.subject}});if(!staff?.enabled||!['ADMIN','SCANNER'].includes(staff.role))throw new AppError(403,'SCANNER_REQUIRED','An enabled check-in staff account is required.');return {email:identity.email,mode:admissionMode()};}
export async function checkTicket(db:PrismaClient,identity:Identity,token:string,admit=false){
 const hash=hashTicket(token),mode=admissionMode();
 return db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role IN ('ADMIN','SCANNER') FOR SHARE`;
  if(!staff.length)throw new AppError(403,'SCANNER_REQUIRED','An enabled check-in staff account is required.');
  const rows=await tx.$queryRaw<{id:string;orderId:string}[]>`SELECT t.id,o.id AS "orderId" FROM "Ticket" t JOIN "OrderLine" l ON l.id=t."orderLineId" JOIN "Order" o ON o.id=l."orderId" JOIN "Event" e ON e.id=o."eventId" WHERE t."tokenHash"=${hash} AND e.slug=${concertSlug()}`;
  if(rows[0]){await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${rows[0].orderId}::uuid FOR UPDATE`;await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id=${rows[0].id}::uuid FOR UPDATE`;}
  const ticket=rows[0]?await tx.ticket.findUniqueOrThrow({where:{id:rows[0].id},include:{admission:true,line:{include:{tier:true,order:{include:{payments:{where:{status:'VERIFIED'}}}}}}}}):null;
  const status=!ticket?'INVALID':ticket.status!=='ACTIVE'?'VOID':ticket.line.order.status!=='PAID'?'NOT_PAID':ticket.line.order.needsReconciliation?'PAYMENT_REVIEW':!ticket.line.order.payments.some(p=>p.domain===mode)?'WRONG_MODE':ticket.admission?'USED':'READY';
  const detail=ticket?{id:ticket.id,buyerName:ticket.line.order.buyerName,tier:ticket.line.tier.name,ordinal:ticket.ordinal,admittedAt:ticket.admission?.scannedAt??null}:null;
  if(status!=='READY'){
   await tx.auditLog.create({data:{actorId:staff[0].id,action:'ADMISSION_DENIED',entityType:ticket?'Ticket':'Event',entityId:ticket?.id??concertSlug(),metadata:{reason:status,mode}}});
   return {status,mode,ticket:detail};
  }
  if(!admit)return {status,mode,ticket:detail};
  const admission=await tx.admission.create({data:{ticketId:ticket!.id,staffId:staff[0].id}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'TICKET_ADMITTED',entityType:'Ticket',entityId:ticket!.id,metadata:{mode}}});
  return {status:'ADMITTED',mode,ticket:{...detail!,admittedAt:admission.scannedAt}};
 },{maxWait:10000,timeout:15000});
}
