import {PrismaClient} from '@prisma/client';
import {z} from 'zod';
const email=z.email().parse(process.argv[2]?.trim().toLowerCase());
const subject=z.string().regex(/^[a-f0-9]{64}$/,'Use the subject from the signed-in account session endpoint.').parse(process.argv[3]);
const db=new PrismaClient({transactionOptions:{maxWait:10000,timeout:15000}});
try{
 await db.$transaction(async tx=>{
  const current=await tx.staffUser.findUnique({where:{authSubject:subject}});
  if(current?.role==='ADMIN')throw new Error('This account already has organizer access. It can check in tickets without changing its role.');
  const staff=await tx.staffUser.upsert({where:{authSubject:subject},create:{authSubject:subject,email,role:'SCANNER',enabled:true},update:{email,role:'SCANNER',enabled:true}});
  await tx.auditLog.create({data:{actorId:staff.id,action:'SCANNER_ACCESS_GRANTED_BY_CLI',entityType:'StaffUser',entityId:staff.id,metadata:{method:'trusted-database-operator'}}});
 });
 console.log('Scanner access enabled. Sign in and open /staff/check-in.');
}finally{await db.$disconnect();}
