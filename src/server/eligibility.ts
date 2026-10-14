import {createHash} from 'node:crypto';
import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {AppError} from './errors';
import {requireAdmin} from './admin';
import {kalaSlug} from './config';
import type {Identity} from './session';
export const eligibilityInput=z.object({competitionId:z.uuid(),revision:z.number().int().positive(),enabled:z.boolean(),requirements:z.string().trim().max(4000),evidenceRequired:z.boolean()}).strict().refine(v=>!v.enabled||Array.from(v.requirements).length>=5,'Enter the eligibility requirements before enabling them.').refine(v=>!v.requirements||Array.from(v.requirements).length>=5,'Requirements must have at least five characters.');
export const eligibilityDeclaration=z.object({policyRevision:z.number().int().positive(),confirmed:z.literal(true),response:z.string().trim().max(4000).default('')}).strict();
export const submitRosterInput=z.object({revision:z.number().int().positive(),eligibility:eligibilityDeclaration.optional()}).strict();
export const eligibilitySelection={id:true,policyRevision:true,requirements:true,evidenceRequired:true,response:true,representativeName:true,representativeEmail:true,confirmed:true,submittedAt:true,decision:true,reviewNote:true,reviewedAt:true} as const;
export function membersFingerprint(members:{participantKey:string;fullName:string;jerseyNumber?:number|null;captain:boolean}[]){return createHash('sha256').update(JSON.stringify([...members].sort((a,b)=>a.participantKey<b.participantKey?-1:a.participantKey>b.participantKey?1:0).map(m=>[m.participantKey,m.fullName,m.jerseyNumber??null,m.captain]))).digest('hex');}
export async function eligibilitySettings(db:PrismaClient,identity:Identity){await requireAdmin(db,identity);return db.competition.findMany({where:{event:{slug:kalaSlug()}},orderBy:{sportCode:'asc'},select:{id:true,sportCode:true,eligibilityEnabled:true,eligibilityRevision:true,eligibilityRequirements:true,eligibilityEvidenceRequired:true}});}
export async function configureEligibility(db:PrismaClient,identity:Identity,input:z.infer<typeof eligibilityInput>){
 return db.$transaction(async tx=>{
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "StaffUser" WHERE "authSubject"=${identity.subject} AND enabled=true AND role='ADMIN' FOR SHARE`;
  if(!staff.length)throw new AppError(403,'ADMIN_REQUIRED','Organizer access required.');
  // Settings lock the event first, so submission cannot race a policy change.
  const event=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Event" WHERE slug=${kalaSlug()} FOR UPDATE`;
  if(!event.length)throw new AppError(503,'EVENT_NOT_CONFIGURED','KALA GAMES is not configured.');
  await tx.$queryRaw`SELECT id FROM "Competition" WHERE id=${input.competitionId}::uuid FOR UPDATE`;
  const c=await tx.competition.findUnique({where:{id:input.competitionId}});
  if(!c||c.eventId!==event[0].id)throw new AppError(404,'SPORT_NOT_FOUND','Sport not found.');
  if(c.eligibilityRevision!==input.revision)throw new AppError(409,'STALE_REVISION','Eligibility requirements changed. Reload.');
  const updated=await tx.competition.update({where:{id:c.id},data:{eligibilityEnabled:input.enabled,eligibilityRequirements:input.requirements||null,eligibilityEvidenceRequired:input.evidenceRequired,eligibilityRevision:{increment:1}},select:{eligibilityRevision:true}});
  await tx.auditLog.create({data:{actorId:staff[0].id,action:'ELIGIBILITY_POLICY_UPDATED',entityType:'Competition',entityId:c.id,metadata:{before:{enabled:c.eligibilityEnabled,requirements:c.eligibilityRequirements,evidenceRequired:c.eligibilityEvidenceRequired,revision:c.eligibilityRevision},after:input,newRevision:updated.eligibilityRevision}}});return updated;
 },{maxWait:10000,timeout:15000});
}
export async function captureEligibility(tx:Prisma.TransactionClient,roster:{id:string;team:{representativeId:string};competition:{eligibilityEnabled:boolean;eligibilityRevision:number;eligibilityRequirements:string|null;eligibilityEvidenceRequired:boolean};members:Parameters<typeof membersFingerprint>[0]},input?:z.infer<typeof eligibilityDeclaration>){
 const policy=roster.competition;
 if(!policy.eligibilityEnabled){if(input)throw new AppError(409,'ELIGIBILITY_CHANGED','Eligibility requirements changed. Reload before submitting.');return null;}
 if(!input||!input.confirmed)throw new AppError(400,'ELIGIBILITY_REQUIRED','Confirm the eligibility requirements for every player before submitting.');
 if(input.policyRevision!==policy.eligibilityRevision)throw new AppError(409,'ELIGIBILITY_CHANGED','Eligibility requirements changed. Reload and confirm the current rules.');
 if(policy.eligibilityEvidenceRequired&&Array.from(input.response.trim()).length<5)throw new AppError(400,'ELIGIBILITY_EVIDENCE_REQUIRED','Provide the requested eligibility statement or reference.');
 const representative=await tx.representative.findUniqueOrThrow({where:{id:roster.team.representativeId}});
 const captured=await tx.eligibilitySubmission.create({data:{rosterId:roster.id,representativeId:representative.id,representativeName:representative.name,representativeEmail:representative.email,policyRevision:policy.eligibilityRevision,requirements:policy.eligibilityRequirements!,evidenceRequired:policy.eligibilityEvidenceRequired,response:input.response,confirmed:true,membersHash:membersFingerprint(roster.members)}});return captured.id;
}

export async function eligibilityHistory(db:PrismaClient,identity:Identity,rosterId:string,organizer=false){
 if(organizer)await requireAdmin(db,identity);
 const roster=await db.sportRoster.findFirst({where:{id:rosterId,team:{event:{slug:kalaSlug()},...(organizer?{}:{representative:{authSubject:identity.subject}})}},select:{id:true}});
 if(!roster)throw new AppError(404,'ROSTER_NOT_FOUND','Roster not found.');
 return db.eligibilitySubmission.findMany({where:{rosterId,roster:{team:{event:{slug:kalaSlug()},...(organizer?{}:{representative:{authSubject:identity.subject}})}}},orderBy:[{submittedAt:'desc'},{id:'desc'}],take:20,select:eligibilitySelection});
}
