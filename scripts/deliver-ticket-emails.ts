import {PrismaClient} from '@prisma/client';
import {deliverEmails} from '../src/server/notifications';
const db=new PrismaClient();try{console.log(await deliverEmails(db));}finally{await db.$disconnect();}
