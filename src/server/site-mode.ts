import {AppError} from './errors';
export function prelaunch(){return process.env.SITE_MODE!=='live';}
export function requirePublicLaunch(){if(prelaunch())throw new AppError(403,'PRELAUNCH','We are getting ready. Join the waitlist for launch updates.');}
export function heldPath(path:string){
 if(!prelaunch())return false;
 if(['/tickets/orders','/tickets/confirmation','/merch/orders','/merch/confirmation','/api/tickets/orders','/api/tickets/verify','/api/merch/orders','/api/merch/verify','/api/kala/representative'].includes(path))return false;
 return ['/tickets','/merch','/kala-games','/api/tickets','/api/merch','/api/kala'].some(prefix=>path===prefix||path.startsWith(prefix+'/'));
}
