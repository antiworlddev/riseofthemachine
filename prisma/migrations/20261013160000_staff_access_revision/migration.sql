ALTER TABLE "StaffUser" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_revision_positive" CHECK ("revision" > 0);
CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt", "id");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
