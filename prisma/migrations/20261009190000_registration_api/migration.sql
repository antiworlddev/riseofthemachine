BEGIN;
-- CreateTable
CREATE TABLE "TeamOption" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "universityName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TeamOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiRateBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ApiRateBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamOption_eventId_key_key" ON "TeamOption"("eventId", "key");

-- CreateIndex
CREATE INDEX "ApiRateBucket_expiresAt_idx" ON "ApiRateBucket"("expiresAt");

-- Preserve pre-existing registrations with disabled organizer options for review.
INSERT INTO "TeamOption" (id,"eventId",key,name,"universityName",enabled)
SELECT gen_random_uuid(),"eventId","teamKey","teamName","universityName",false FROM "TeamRegistration";

-- AddForeignKey
ALTER TABLE "TeamRegistration" ADD CONSTRAINT "TeamRegistration_eventId_teamKey_fkey" FOREIGN KEY ("eventId", "teamKey") REFERENCES "TeamOption"("eventId", "key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamOption" ADD CONSTRAINT "TeamOption_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ApiRateBucket" ADD CONSTRAINT "rate_count_positive" CHECK (count > 0);
COMMIT;
