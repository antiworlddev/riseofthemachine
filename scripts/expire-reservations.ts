import {PrismaClient} from '@prisma/client';
import {expireReservations} from '../src/server/ticketing';
const db=new PrismaClient();try{console.log(`Expired ${await expireReservations(db)} reservations.`);}finally{await db.$disconnect();}
