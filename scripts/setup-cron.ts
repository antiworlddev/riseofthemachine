import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
const configSchema=z.object({crons:z.array(z.object({path:z.string(),schedule:z.string()}).passthrough()).optional()}).passthrough();
export function cronConfig(value:unknown,mode:'daily'|'pro'):z.infer<typeof configSchema>&{crons:{path:string;schedule:string}[]}{
 const config=configSchema.parse(value);
 const jobs=[{path:'/api/jobs/ticket-emails',schedule:mode==='pro'?'* * * * *':'0 8 * * *'},{path:'/api/jobs/ticket-expiry',schedule:mode==='pro'?'* * * * *':'0 7 * * *'},{path:'/api/jobs/merch-expiry',schedule:mode==='pro'?'* * * * *':'30 7 * * *'}];
 return {...config,crons:[...(config.crons??[]).filter(c=>!jobs.some(j=>j.path===c.path)),...jobs]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const mode=z.enum(['daily','pro']).parse(process.argv[2]??'daily');
 const config=cronConfig(JSON.parse(await readFile('vercel.json','utf8')),mode);
 await writeFile('vercel.json',JSON.stringify(config,null,2)+'\n');
 console.log(`Configured ${mode} schedules for ticket emails and ticket/merch expiry. Existing unrelated Vercel settings retained. Deploy to activate.`);
}
