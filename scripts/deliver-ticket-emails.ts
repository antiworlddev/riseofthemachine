import {PrismaClient} from '@prisma/client';
import {deliverTicketEmails} from '../src/server/ticket-emails';
const db=new PrismaClient();try{console.log(await deliverTicketEmails(db));}finally{await db.$disconnect();}
