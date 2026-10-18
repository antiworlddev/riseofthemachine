import {PrismaClient} from '@prisma/client';
import {scheduledEmailJobs} from '../src/server/scheduled-email-jobs';
const db=new PrismaClient();try{console.log(await scheduledEmailJobs(db));}finally{await db.$disconnect();}
