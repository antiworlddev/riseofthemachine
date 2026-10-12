import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import type {Identity} from './session';
import {AppError} from './errors';
import {admissionMode} from './admission';
import {concertSlug} from './ticketing';
import {hashTicket} from './ticket-tokens';
export const parkingInput=z.object({token:z.string().regex(/^park_[A-Za-z0-9_-]{43}$/,'Enter a VIP parking code.')}).strict();
export async function checkParking(db:PrismaClient,identity:Identity,token:string,admit=false){
 const hash=hashTicket(token),mode=admissionMode();
 return db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role IN ('ADMIN','SCANNER') FOR SHARE`;
  if(!staff.length)throw new AppError(403,'SCANNER_REQUIRED','Enabled parking staff access required.');
  const rows=await tx.$queryRaw<{id:string;orderId:string}[]>`SELECT p.id,o.id AS "orderId" FROM "ParkingPass" p JOIN "OrderLine" l ON l.id=p."orderLineId" JOIN "Order" o ON o.id=l."orderId" JOIN "Event" e ON e.id=o."eventId" WHERE p."tokenHash"=${hash} AND e.slug=${concertSlug()}`;
  if(rows[0]){await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${rows[0].orderId}::uuid FOR UPDATE`;await tx.$queryRaw`SELECT id FROM "ParkingPass" WHERE id=${rows[0].id}::uuid FOR UPDATE`;}
  const pass=rows[0]?await tx.parkingPass.findUniqueOrThrow({where:{id:rows[0].id},include:{admission:true,line:{include:{tier:true,order:{include:{payments:true,refund:true}}}}}}):null;
  const o=pass?.line.order;
  const status=!pass?'INVALID':pass.status!=='ACTIVE'?'VOID':o!.status!=='PAID'?'NOT_PAID':o!.needsReconciliation||o!.refund?'PAYMENT_REVIEW':!o!.payments.some(p=>p.status==='VERIFIED'&&p.domain===mode)?'WRONG_MODE':pass.admission?'USED':'READY';
  const detail=pass?{id:pass.id,buyerName:o!.buyerName,tier:`${pass.line.tier.name} VIP parking${o!.tableLabel?` · ${o!.tableLabel}`:''}`,ordinal:pass.ordinal,admittedAt:pass.admission?.scannedAt??null}:null;
  if(status!=='READY'){await tx.auditLog.create({data:{actorId:staff[0].id,action:'PARKING_DENIED',entityType:'ParkingPass',entityId:pass?.id??concertSlug(),metadata:{reason:status,mode}}});return {status,mode,ticket:detail};}
  if(!admit)return {status,mode,ticket:detail};
  const admission=await tx.parkingAdmission.create({data:{passId:pass!.id,staffId:staff[0].id}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'PARKING_ADMITTED',entityType:'ParkingPass',entityId:pass!.id,metadata:{mode}}});return {status:'ADMITTED',mode,ticket:{...detail!,admittedAt:admission.scannedAt}};
 },{maxWait:10000,timeout:15000});
}
