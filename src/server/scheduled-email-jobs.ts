import type { PrismaClient } from "@prisma/client";
import { deliverEmails } from "./notifications";
import { syncMailjet, MailjetError } from "./mailjet";
export async function scheduledEmailJobs(client: PrismaClient, limit = 10) {
  const started = Date.now();
  const email = await deliverEmails(client, undefined, limit, started + 20000);
  // Mailjet has a separate budget and does not require transactional email delivery to be enabled.
  let mailjet: { synced: number; retrying: number; error?: string };
  try {
    mailjet = await syncMailjet(client, undefined, limit, started + 45000);
  } catch (error) {
    mailjet = {
      synced: 0,
      retrying: 0,
      error: error instanceof MailjetError ? error.code : "MAILJET_SYNC_FAILED",
    };
  }
  return { ...email, mailjet };
}
