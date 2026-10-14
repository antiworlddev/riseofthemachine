import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
const email=z.email().parse(process.argv[2]?.trim().toLowerCase());
const db=new PrismaClient({transactionOptions:{maxWait:10000,timeout:15000}});
try {
 await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(73194622)`;
  const representative=await tx.representative.findUnique({where:{email}});
  if(!representative?.verifiedAt)throw new Error('This account must first sign in and create a team registration with its verified email.');
  const staff=await tx.staffUser.upsert({where:{authSubject:representative.authSubject},create:{authSubject:representative.authSubject,email,role:'ADMIN',enabled:true},update:{revision:{increment:1},email,role:'ADMIN',enabled:true}});
  await tx.auditLog.create({data:{actorId:staff.id,action:'ADMIN_ACCESS_GRANTED_BY_CLI',entityType:'StaffUser',entityId:staff.id,metadata:{method:'trusted-database-operator'}}});
 });
 console.log('Organizer access enabled for the existing verified account. Open /admin/kala-games after sign-in.');
}finally{await db.$disconnect();}
