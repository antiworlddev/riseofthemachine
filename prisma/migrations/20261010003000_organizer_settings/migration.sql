ALTER TABLE "Event" ADD COLUMN "registrationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "settingsRevision" INTEGER NOT NULL DEFAULT 1,
ADD CONSTRAINT "event_settings_revision" CHECK ("settingsRevision" > 0);
