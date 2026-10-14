ALTER TABLE "TeamRegistration" ADD COLUMN "ownershipRevision" INTEGER NOT NULL DEFAULT 1 CHECK ("ownershipRevision">0);
