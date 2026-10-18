ALTER TABLE "Subscriber"
 ADD COLUMN "mailjetSyncPending" BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN "mailjetRevision" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "mailjetSyncedAt" TIMESTAMPTZ(3),
 ADD COLUMN "mailjetNextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "mailjetAttempts" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "mailjetLease" UUID,
 ADD COLUMN "mailjetLockedUntil" TIMESTAMPTZ(3),
 ADD COLUMN "mailjetLastError" VARCHAR(64),
 ADD COLUMN "mailjetSuppressedAt" TIMESTAMPTZ(3),
 ADD CONSTRAINT "Subscriber_mailjet_revision_positive" CHECK ("mailjetRevision">0 AND "mailjetAttempts">=0);
CREATE INDEX "Subscriber_mailjet_pending_idx" ON "Subscriber"("mailjetNextAttemptAt") WHERE "mailjetSyncPending"=true;
CREATE TABLE "MailjetEvent" ("key" VARCHAR(64) NOT NULL PRIMARY KEY,"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
