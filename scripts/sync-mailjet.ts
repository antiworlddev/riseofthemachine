import {PrismaClient} from '@prisma/client';
import {syncMailjet} from '../src/server/mailjet';
const db=new PrismaClient();try{console.log(await syncMailjet(db));}finally{await db.$disconnect();}
