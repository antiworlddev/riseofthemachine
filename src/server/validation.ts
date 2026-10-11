import { z } from 'zod';
const name = z.string().trim().min(2).max(120);
export const uuid = z.uuid();
export const teamInput = z.object({
  teamOptionId: uuid,
  sportCodes: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).min(1).max(5).refine(x => new Set(x).size === x.length, 'Duplicate sport'),
  representative: z.object({ name, phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,24}$/) }).strict(),
}).strict();
export const rosterInput = z.object({
  revision: z.number().int().positive(),
  members: z.array(z.object({
    participantKey: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    fullName: name,
    jerseyNumber: z.number().int().min(0).max(999).nullable().optional(),
    captain: z.boolean(),
  }).strict()).max(100),
}).strict().superRefine((input, ctx) => {
  const keys = input.members.map(x => x.participantKey);
  const numbers = input.members.flatMap(x => x.jerseyNumber == null ? [] : [x.jerseyNumber]);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Duplicate player', path: ['members'] });
  if (new Set(numbers).size !== numbers.length) ctx.addIssue({ code: 'custom', message: 'Duplicate jersey number', path: ['members'] });
  if (input.members.filter(x => x.captain).length > 1) ctx.addIssue({ code: 'custom', message: 'Only one captain is allowed', path: ['members'] });
});
export const revisionInput = z.object({ revision: z.number().int().positive() }).strict();
