import { createCipheriv,createDecipheriv,createHash,randomBytes } from 'node:crypto';
import { AppError } from './errors';
function key(){if(!/^[a-f0-9]{64}$/i.test(process.env.TICKET_TOKEN_KEY??''))throw new AppError(503,'TICKETS_NOT_CONFIGURED','Ticket checkout is not available yet.');return Buffer.from(process.env.TICKET_TOKEN_KEY!,'hex');}
export function requireTicketKey(){key();}
export function hashTicket(token:string){return createHash('sha256').update(token).digest('hex');}
export function encryptTicket(token:string,id:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(id));const body=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');}
export function decryptTicket(encrypted:string,id:string){const bytes=Buffer.from(encrypted,'base64url');const cipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));cipher.setAAD(Buffer.from(id));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');}
