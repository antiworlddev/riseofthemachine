ALTER TABLE "OutboxMessage"
ADD COLUMN "encryptedDeliveryPayload" TEXT,
ADD COLUMN "firstAttemptAt" TIMESTAMPTZ(3),
ADD COLUMN "lockedUntil" TIMESTAMPTZ(3),
ADD COLUMN "leaseToken" UUID,
ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastErrorCode" TEXT,
ADD COLUMN "providerMessageId" TEXT,
ADD COLUMN "blocked" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "OutboxMessage_pending_email_idx" ON "OutboxMessage" ("nextAttemptAt") WHERE "deliveredAt" IS NULL AND NOT "blocked";
