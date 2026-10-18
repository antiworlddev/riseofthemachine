import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { PrismaClient, Subscriber } from "@prisma/client";
import { z } from "zod";
import { AppError } from "./errors";
import { unsubscribeToken, consentVersion } from "./subscribers";
export class MailjetError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function mailjetConfig() {
  const parsed = z
    .object({
      MAILJET_API_KEY: z.string().min(1),
      MAILJET_SECRET_KEY: z.string().min(1),
      MAILJET_WAITLIST_LIST_ID: z.string().regex(/^[1-9][0-9]{0,14}$/),
      MAILJET_NEWSLETTER_LIST_ID: z.string().regex(/^[1-9][0-9]{0,14}$/),
    })
    .safeParse(process.env);
  if (
    !parsed.success ||
    parsed.data.MAILJET_WAITLIST_LIST_ID ===
      parsed.data.MAILJET_NEWSLETTER_LIST_ID
  )
    throw new MailjetError("MAILJET_NOT_CONFIGURED");
  return parsed.data;
}
export type MailjetRequest = (
  path: string,
  method: "GET" | "POST" | "PUT",
  body?: unknown,
  deadlineAt?: number,
) => Promise<Record<string, unknown>[]>;
export const mailjetRequest: MailjetRequest = async (
  path,
  method,
  body,
  deadlineAt = Date.now() + 5000,
) => {
  const cfg = mailjetConfig(),
    remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new MailjetError("MAILJET_DEADLINE");
  let response: Response;
  try {
    response = await fetch(`https://api.mailjet.com/v3/REST/${path}`, {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`${cfg.MAILJET_API_KEY}:${cfg.MAILJET_SECRET_KEY}`).toString("base64")}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(Math.min(5000, remaining)),
    });
  } catch {
    throw new MailjetError("MAILJET_NETWORK");
  }
  if (!response.ok) throw new MailjetError(`MAILJET_HTTP_${response.status}`);
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new MailjetError("MAILJET_INVALID_RESPONSE");
  }
  const parsed = z
    .object({ Data: z.array(z.record(z.string(), z.unknown())) })
    .safeParse(result);
  if (!parsed.success) throw new MailjetError("MAILJET_INVALID_RESPONSE");
  return parsed.data.Data;
};
export type MailjetSync = (
  fan: Subscriber,
  deadlineAt: number,
) => Promise<{ waitlistOptOut: boolean; newsletterOptOut: boolean }>;
// addnoforce deliberately respects a Mailjet-side unsubscribe, including retries after a timeout.
export async function syncMailjetContact(
  fan: Subscriber,
  deadlineAt: number,
  request: MailjetRequest = mailjetRequest,
) {
  const cfg = mailjetConfig(),
    origin = process.env.APP_ORIGIN;
  if (!origin || new URL(origin).origin !== origin)
    throw new MailjetError("MAILJET_ORIGIN_NOT_CONFIGURED");
  const properties = {
    rotm_first_name: fan.firstName,
    rotm_unsubscribe_url: `${origin}/newsletter/unsubscribe?token=${unsubscribeToken(fan.id)}`,
  };
  const result = { waitlistOptOut: false, newsletterOptOut: false };
  for (const kind of ["waitlist", "newsletter"] as const) {
    const joined = kind === "waitlist" ? fan.waitlistAt : fan.newsletterAt;
    if (!joined) continue;
    const optedOut =
      !!fan.mailjetSuppressedAt ||
      !!(kind === "waitlist" ? fan.waitlistUnsubscribedAt : fan.unsubscribedAt);
    const listId =
      kind === "waitlist"
        ? cfg.MAILJET_WAITLIST_LIST_ID
        : cfg.MAILJET_NEWSLETTER_LIST_ID;
    const rows = await request(
      `contactslist/${listId}/managecontact`,
      "POST",
      {
        Email: fan.email,
        Name: fan.firstName,
        Action: optedOut ? "unsub" : "addnoforce",
        Properties: properties,
      },
      deadlineAt,
    );
    if (
      rows[0]?.Email !== fan.email ||
      rows[0]?.Action !== (optedOut ? "unsub" : "addnoforce")
    )
      throw new MailjetError("MAILJET_INVALID_RESPONSE");
    // The synchronous write echoes its input. Read the actual subscription before acknowledging sync.
    const state = (
      await request(
        `listrecipient?ContactEmail=${encodeURIComponent(fan.email)}&ContactsList=${listId}&Limit=1`,
        "GET",
        undefined,
        deadlineAt,
      )
    )[0];
    if (
      !state ||
      typeof state.IsUnsubscribed !== "boolean" ||
      String(state.ListID) !== listId ||
      !Number.isSafeInteger(state.ContactID)
    )
      throw new MailjetError("MAILJET_INVALID_RESPONSE");
    if (optedOut && !state.IsUnsubscribed)
      throw new MailjetError("MAILJET_UNSUBSCRIBE_UNCONFIRMED");
    result[kind === "waitlist" ? "waitlistOptOut" : "newsletterOptOut"] =
      state.IsUnsubscribed;
  }
  return result;
}
export async function syncMailjet(
  client: PrismaClient,
  sync: MailjetSync = syncMailjetContact,
  limit = 10,
  deadlineAt = Date.now() + 35000,
) {
  const result = { synced: 0, retrying: 0 };
  if (process.env.MAILJET_ENABLED !== "true") return result;
  mailjetConfig();
  for (
    let i = 0;
    i < Math.min(25, Math.max(0, limit)) && Date.now() < deadlineAt;
    i++
  ) {
    const lease = randomUUID(),
      fan = await client.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "Subscriber" WHERE "mailjetSyncPending" AND "mailjetNextAttemptAt"<=now() AND ("mailjetLockedUntil" IS NULL OR "mailjetLockedUntil"<now()) ORDER BY "mailjetNextAttemptAt",id LIMIT 1 FOR UPDATE SKIP LOCKED`;
        return rows.length
          ? tx.subscriber.update({
              where: { id: rows[0].id },
              data: {
                mailjetLease: lease,
                mailjetLockedUntil: new Date(Date.now() + 120000),
              },
            })
          : null;
      });
    if (!fan) break;
    try {
      const outcome = await sync(fan, deadlineAt);
      await client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Subscriber" WHERE id=${fan.id}::uuid FOR UPDATE`;
        const current = await tx.subscriber.findUniqueOrThrow({
          where: { id: fan.id },
        });
        if (current.mailjetLease !== lease) return;
        if (current.mailjetRevision !== fan.mailjetRevision) {
          await tx.subscriber.updateMany({
            where: { id: fan.id, mailjetLease: lease },
            data: {
              mailjetLease: null,
              mailjetLockedUntil: null,
              mailjetSyncPending: true,
              mailjetNextAttemptAt: new Date(),
            },
          });
          return;
        }
        const now = new Date(),
          providerUnsub =
            (outcome.waitlistOptOut && !current.waitlistUnsubscribedAt) ||
            (outcome.newsletterOptOut && !current.unsubscribedAt);
        await tx.subscriber.updateMany({
          where: {
            id: fan.id,
            mailjetLease: lease,
            mailjetRevision: fan.mailjetRevision,
          },
          data: {
            mailjetSyncPending: false,
            mailjetSyncedAt: now,
            mailjetAttempts: 0,
            mailjetLastError: null,
            mailjetLease: null,
            mailjetLockedUntil: null,
            ...(outcome.waitlistOptOut && current.waitlistAt
              ? {
                  waitlistUnsubscribedAt: current.waitlistUnsubscribedAt ?? now,
                }
              : {}),
            ...(outcome.newsletterOptOut && current.newsletterAt
              ? { unsubscribedAt: current.unsubscribedAt ?? now }
              : {}),
          },
        });
        if (providerUnsub)
          await tx.subscriberConsent.create({
            data: {
              subscriberId: fan.id,
              source: "mailjet-sync",
              action: "PROVIDER_OPT_OUT",
              version: consentVersion,
            },
          });
      });
      result.synced++;
    } catch (error) {
      const code =
        error instanceof MailjetError ? error.code : "MAILJET_SYNC_FAILED";
      // Keep pending forever with bounded backoff. A new signup/unsubscribe resets its delay.
      await client.subscriber.updateMany({
        where: {
          id: fan.id,
          mailjetLease: lease,
          mailjetRevision: fan.mailjetRevision,
        },
        data: {
          mailjetAttempts: { increment: 1 },
          mailjetLastError: code,
          mailjetNextAttemptAt: new Date(
            Date.now() +
              Math.min(3600000, 60000 * 2 ** Math.min(fan.mailjetAttempts, 6)),
          ),
          mailjetLease: null,
          mailjetLockedUntil: null,
        },
      });
      await client.subscriber.updateMany({
        where: { id: fan.id, mailjetLease: lease },
        data: { mailjetLease: null, mailjetLockedUntil: null },
      });
      result.retrying++;
    }
  }
  return result;
}
export function authorizeMailjetWebhook(request: Request) {
  const secret = process.env.MAILJET_WEBHOOK_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret))
    throw new AppError(
      503,
      "MAILJET_NOT_CONFIGURED",
      "Mailjet webhook is not configured.",
    );
  const expected = createHash("sha256")
      .update(`Basic ${Buffer.from(`mailjet:${secret}`).toString("base64")}`)
      .digest(),
    actual = createHash("sha256")
      .update(request.headers.get("authorization") ?? "")
      .digest();
  if (!timingSafeEqual(expected, actual))
    throw new AppError(401, "UNAUTHORIZED", "Webhook authentication required.");
}
const eventSchema = z.object({
  event: z.string().max(40),
  email: z
    .string()
    .trim()
    .pipe(z.email().max(254))
    .transform((v) => v.toLowerCase()),
  time: z.number().int().nonnegative().max(4102444800),
  mj_list_id: z
    .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
    .optional(),
  Message_GUID: z.string().max(100).optional(),
  hard_bounce: z.boolean().optional(),
});
export const mailjetEventsInput = z
  .union([eventSchema, z.array(eventSchema).min(1).max(50)])
  .transform((v) => (Array.isArray(v) ? v : [v]));
export async function applyMailjetEvents(
  client: PrismaClient,
  events: z.infer<typeof mailjetEventsInput>,
) {
  const cfg = mailjetConfig();
  let applied = 0;
  for (const event of events) {
    if (
      !["unsub", "spam", "bounce"].includes(event.event) ||
      (event.event === "bounce" && !event.hard_bounce)
    )
      continue;
    const list = String(event.mj_list_id ?? ""),
      scope =
        event.event === "unsub"
          ? list === cfg.MAILJET_WAITLIST_LIST_ID
            ? "waitlist"
            : list === cfg.MAILJET_NEWSLETTER_LIST_ID
              ? "newsletter"
              : null
          : "all";
    if (!scope) continue;
    if (event.time > Math.floor(Date.now() / 1000) + 300)
      throw new AppError(400, "INVALID_EVENT", "Event time is in the future.");
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          event.event,
          event.email,
          event.time,
          list,
          event.Message_GUID ?? "",
        ]),
      )
      .digest("hex");
    await client.$transaction(async (tx) => {
      // Atomic dedup insert avoids duplicate consent entries on Mailjet webhook retries.
      const inserted = await tx.mailjetEvent.createMany({
        data: [{ key }],
        skipDuplicates: true,
      });
      if (!inserted.count) return;
      await tx.$queryRaw`SELECT id FROM "Subscriber" WHERE email=${event.email} FOR UPDATE`;
      const fan = await tx.subscriber.findUnique({
        where: { email: event.email },
      });
      if (!fan) return;
      const at = new Date(event.time * 1000),
        now = new Date();
      let changed = false;
      // Unsubscribes older than a later explicit local signup do not overwrite that consent.
      if (
        (scope === "all" || scope === "waitlist") &&
        fan.waitlistAt &&
        Math.floor(fan.waitlistAt.getTime() / 1000) <= event.time &&
        !fan.waitlistUnsubscribedAt
      ) {
        await tx.subscriber.update({
          where: { id: fan.id },
          data: { waitlistUnsubscribedAt: at },
        });
        changed = true;
      }
      if (
        (scope === "all" || scope === "newsletter") &&
        fan.newsletterAt &&
        Math.floor(fan.newsletterAt.getTime() / 1000) <= event.time &&
        !fan.unsubscribedAt
      ) {
        await tx.subscriber.update({
          where: { id: fan.id },
          data: { unsubscribedAt: at },
        });
        changed = true;
      }
      // Complaints and hard bounces suppress both lists regardless of later form submissions.
      if (scope === "all" && !fan.mailjetSuppressedAt) {
        await tx.subscriber.update({
          where: { id: fan.id },
          data: { mailjetSuppressedAt: at },
        });
        changed = true;
      }
      if (changed) {
        await tx.subscriber.update({
          where: { id: fan.id },
          data: {
            mailjetSyncPending: true,
            mailjetRevision: { increment: 1 },
            mailjetNextAttemptAt: now,
            mailjetAttempts: 0,
            mailjetLastError: null,
          },
        });
        await tx.subscriberConsent.create({
          data: {
            subscriberId: fan.id,
            source: "mailjet-webhook",
            action:
              scope === "all" ? "PROVIDER_SUPPRESSED" : "PROVIDER_OPT_OUT",
            version: consentVersion,
          },
        });
        applied++;
      }
    });
  }
  return { applied };
}
