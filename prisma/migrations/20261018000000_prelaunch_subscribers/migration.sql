CREATE TABLE "Subscriber" (
 "id" UUID NOT NULL, "email" VARCHAR(254) NOT NULL, "firstName" VARCHAR(80) NOT NULL,
 "waitlistAt" TIMESTAMPTZ(3), "waitlistUnsubscribedAt" TIMESTAMPTZ(3), "newsletterAt" TIMESTAMPTZ(3), "unsubscribedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");
CREATE INDEX "Subscriber_createdAt_id_idx" ON "Subscriber"("createdAt","id");
CREATE TABLE "SubscriberConsent" (
 "id" UUID NOT NULL, "subscriberId" UUID NOT NULL, "action" VARCHAR(32) NOT NULL,
 "source" VARCHAR(32) NOT NULL, "version" VARCHAR(32) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SubscriberConsent_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SubscriberConsent_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "SubscriberConsent_subscriberId_createdAt_idx" ON "SubscriberConsent"("subscriberId","createdAt");
