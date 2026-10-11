BEGIN;
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RESERVED', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ACTIVE', 'VOID');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dateLocal" VARCHAR(10) NOT NULL,
    "startsAt" TIMESTAMPTZ(3),
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "venue" TEXT,
    "salesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTier" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "capacity" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TicketTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'RESERVED',
    "totalMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "tierId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "orderLineId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" UUID NOT NULL,
    "authSubject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "ticketId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "scannedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("ticketId")
);

-- CreateTable
CREATE TABLE "Representative" (
    "id" UUID NOT NULL,
    "authSubject" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Representative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamRegistration" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "representativeId" UUID NOT NULL,
    "teamKey" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "universityName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "sportCode" TEXT NOT NULL,
    "minPlayers" INTEGER,
    "maxPlayers" INTEGER,
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportRoster" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMPTZ(3),
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNote" TEXT,

    CONSTRAINT "SportRoster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterMember" (
    "id" UUID NOT NULL,
    "rosterId" UUID NOT NULL,
    "participantKey" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "jerseyNumber" INTEGER,
    "captain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RosterMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" UUID NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTier_eventId_code_key" ON "TicketTier"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTier_id_eventId_key" ON "TicketTier"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Order_buyerEmail_idx" ON "Order"("buyerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_eventId_key" ON "Order"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_orderId_tierId_key" ON "OrderLine"("orderId", "tierId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_reference_key" ON "PaymentAttempt"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_providerTransactionId_key" ON "PaymentAttempt"("providerTransactionId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_idx" ON "PaymentAttempt"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_tokenHash_key" ON "Ticket"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_orderLineId_ordinal_key" ON "Ticket"("orderLineId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_authSubject_key" ON "StaffUser"("authSubject");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE INDEX "Admission_scannedAt_idx" ON "Admission"("scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Representative_authSubject_key" ON "Representative"("authSubject");

-- CreateIndex
CREATE UNIQUE INDEX "Representative_email_key" ON "Representative"("email");

-- CreateIndex
CREATE INDEX "TeamRegistration_representativeId_idx" ON "TeamRegistration"("representativeId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamRegistration_eventId_teamKey_key" ON "TeamRegistration"("eventId", "teamKey");

-- CreateIndex
CREATE UNIQUE INDEX "TeamRegistration_id_eventId_key" ON "TeamRegistration"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_eventId_sportCode_key" ON "Competition"("eventId", "sportCode");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_id_eventId_key" ON "Competition"("id", "eventId");

-- CreateIndex
CREATE INDEX "SportRoster_status_idx" ON "SportRoster"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SportRoster_teamId_competitionId_key" ON "SportRoster"("teamId", "competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterMember_rosterId_participantKey_key" ON "RosterMember"("rosterId", "participantKey");

-- CreateIndex
CREATE UNIQUE INDEX "RosterMember_rosterId_jerseyNumber_key" ON "RosterMember"("rosterId", "jerseyNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxMessage_deduplicationKey_key" ON "OutboxMessage"("deduplicationKey");

-- CreateIndex
CREATE INDEX "OutboxMessage_deliveredAt_createdAt_idx" ON "OutboxMessage"("deliveredAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "TicketTier" ADD CONSTRAINT "TicketTier_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_eventId_fkey" FOREIGN KEY ("orderId", "eventId") REFERENCES "Order"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_tierId_eventId_fkey" FOREIGN KEY ("tierId", "eventId") REFERENCES "TicketTier"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamRegistration" ADD CONSTRAINT "TeamRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamRegistration" ADD CONSTRAINT "TeamRegistration_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "Representative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportRoster" ADD CONSTRAINT "SportRoster_teamId_eventId_fkey" FOREIGN KEY ("teamId", "eventId") REFERENCES "TeamRegistration"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportRoster" ADD CONSTRAINT "SportRoster_competitionId_eventId_fkey" FOREIGN KEY ("competitionId", "eventId") REFERENCES "Competition"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterMember" ADD CONSTRAINT "RosterMember_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "SportRoster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


COMMIT;
