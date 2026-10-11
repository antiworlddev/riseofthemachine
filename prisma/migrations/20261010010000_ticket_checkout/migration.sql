BEGIN;
ALTER TABLE "Order" ADD COLUMN "buyerSubject" TEXT, ADD COLUMN "needsReconciliation" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Order_buyerSubject_createdAt_idx" ON "Order" ("buyerSubject", "createdAt");
ALTER TABLE "PaymentAttempt" ADD COLUMN "authorizationUrl" TEXT, ADD COLUMN "initializingAt" TIMESTAMPTZ(3), ADD COLUMN "domain" TEXT NOT NULL DEFAULT 'test', ADD CONSTRAINT "payment_domain" CHECK (domain IN ('test','live'));
ALTER TABLE "Ticket" ADD COLUMN "encryptedToken" TEXT;
COMMIT;
