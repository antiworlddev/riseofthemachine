import {randomBytes,randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {AppError} from './errors';
import {encryptTicket,hashTicket} from './ticket-tokens';
export const tablePackages=[{code:'engines',name:'Engines',priceMinor:300000000},{code:'autobots',name:'Autobots',priceMinor:500000000},{code:'machineries',name:'Machineries',priceMinor:1000000000}] as const;
export function isTable(code:string){return tablePackages.some(p=>p.code===code);}
export async function changeParkingStock(tx:Prisma.TransactionClient,eventId:string,quantity:number,action:'RESERVE'|'SELL'|'REACQUIRE'|'RELEASE'|'RESTOCK'){
 if(!quantity)return;
 await tx.$queryRaw`SELECT "eventId" FROM "TableInventory" WHERE "eventId"=${eventId}::uuid FOR UPDATE`;
 const stock=await tx.tableInventory.findUnique({where:{eventId}});
 if(!stock||['RESERVE','REACQUIRE'].includes(action)&&stock.parkingCapacity-stock.parkingReserved-stock.parkingSold<quantity)throw new AppError(409,'PARKING_UNAVAILABLE','Included VIP parking is unavailable. Contact booking support.');
 const data=action==='RESERVE'?{parkingReserved:{increment:quantity}}:action==='SELL'?{parkingReserved:{decrement:quantity},parkingSold:{increment:quantity}}:action==='REACQUIRE'?{parkingSold:{increment:quantity}}:action==='RELEASE'?{parkingReserved:{decrement:quantity}}:{parkingSold:{decrement:quantity}};
 await tx.tableInventory.update({where:{eventId},data});
}
export async function issueParking(tx:Prisma.TransactionClient,lines:{id:string;parkingQuantity:number}[]){
 for(const line of lines)for(let ordinal=1;ordinal<=line.parkingQuantity;ordinal++){
  const id=randomUUID(),token=`park_${randomBytes(32).toString('base64url')}`;
  await tx.parkingPass.create({data:{id,orderLineId:line.id,ordinal,tokenHash:hashTicket(token),encryptedToken:encryptTicket(token,id)}});
 }
}
