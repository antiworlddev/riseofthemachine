import {PrismaClient} from '@prisma/client';
import {expireMerch} from '../src/server/merch';
const db=new PrismaClient();try{console.log({expired:await expireMerch(db)});}finally{await db.$disconnect();}
