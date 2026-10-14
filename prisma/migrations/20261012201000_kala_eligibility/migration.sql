ALTER TABLE "Competition" ADD COLUMN "eligibilityEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "eligibilityRevision" INTEGER NOT NULL DEFAULT 1 CHECK("eligibilityRevision">0), ADD COLUMN "eligibilityRequirements" TEXT, ADD COLUMN "eligibilityEvidenceRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Competition" ADD CONSTRAINT "eligibility_policy_valid" CHECK (("eligibilityRequirements" IS NULL OR length("eligibilityRequirements") BETWEEN 5 AND 4000) AND (NOT "eligibilityEnabled" OR "eligibilityRequirements" IS NOT NULL));
CREATE TABLE "EligibilitySubmission" (
 id UUID PRIMARY KEY, "rosterId" UUID NOT NULL REFERENCES "SportRoster"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "representativeId" UUID NOT NULL REFERENCES "Representative"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "representativeName" TEXT NOT NULL, "representativeEmail" TEXT NOT NULL,
 "policyRevision" INTEGER NOT NULL CHECK("policyRevision">0), requirements TEXT NOT NULL CHECK(length(requirements) BETWEEN 5 AND 4000),
 "evidenceRequired" BOOLEAN NOT NULL, response TEXT NOT NULL CHECK(length(response)<=4000), "membersHash" VARCHAR(64) NOT NULL CHECK("membersHash" ~ '^[a-f0-9]{64}$'), confirmed BOOLEAN NOT NULL CHECK(confirmed),
 "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(), decision TEXT NOT NULL DEFAULT 'PENDING' CHECK(decision IN ('PENDING','APPROVED','REJECTED')),
 "reviewedAt" TIMESTAMPTZ(3), "reviewedBy" UUID REFERENCES "StaffUser"(id) ON DELETE RESTRICT ON UPDATE CASCADE, "reviewNote" TEXT,
 CONSTRAINT "eligibility_response_required" CHECK(NOT "evidenceRequired" OR length(trim(response))>=5),
 CONSTRAINT "eligibility_review_fields" CHECK((decision='PENDING' AND "reviewedAt" IS NULL AND "reviewedBy" IS NULL AND "reviewNote" IS NULL) OR (decision<>'PENDING' AND "reviewedAt" IS NOT NULL AND "reviewedBy" IS NOT NULL AND (decision<>'REJECTED' OR coalesce(length(trim("reviewNote")),0)>0)))
);
CREATE INDEX "EligibilitySubmission_rosterId_submittedAt_idx" ON "EligibilitySubmission"("rosterId","submittedAt");
ALTER TABLE "SportRoster" ADD COLUMN "currentEligibilityId" UUID UNIQUE REFERENCES "EligibilitySubmission"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION guard_eligibility_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Eligibility history cannot be deleted'; END IF;
 IF NEW.decision<>'PENDING' AND NOT EXISTS(SELECT 1 FROM "StaffUser" WHERE id=NEW."reviewedBy" AND enabled AND role='ADMIN') THEN RAISE EXCEPTION 'Enabled organizer required for eligibility review'; END IF;
 IF ROW(NEW.id,NEW."rosterId",NEW."representativeId",NEW."representativeName",NEW."representativeEmail",NEW."policyRevision",NEW.requirements,NEW."evidenceRequired",NEW.response,NEW."membersHash",NEW.confirmed,NEW."submittedAt") IS DISTINCT FROM ROW(OLD.id,OLD."rosterId",OLD."representativeId",OLD."representativeName",OLD."representativeEmail",OLD."policyRevision",OLD.requirements,OLD."evidenceRequired",OLD.response,OLD."membersHash",OLD.confirmed,OLD."submittedAt") OR OLD.decision<>'PENDING' THEN RAISE EXCEPTION 'Eligibility declaration history is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER eligibility_history_guard BEFORE UPDATE OR DELETE ON "EligibilitySubmission" FOR EACH ROW EXECUTE FUNCTION guard_eligibility_history();
CREATE FUNCTION guard_current_eligibility() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE declaration "EligibilitySubmission";
BEGIN
 IF TG_OP='UPDATE' AND OLD.status IN ('SUBMITTED','APPROVED') AND NEW."currentEligibilityId" IS DISTINCT FROM OLD."currentEligibilityId" THEN RAISE EXCEPTION 'Submitted eligibility cannot be replaced'; END IF;
 IF NEW."currentEligibilityId" IS NOT NULL THEN
 SELECT * INTO declaration FROM "EligibilitySubmission" WHERE id=NEW."currentEligibilityId";
 IF declaration."rosterId" IS DISTINCT FROM NEW.id OR (NEW.status='APPROVED' AND declaration.decision<>'APPROVED') THEN RAISE EXCEPTION 'Eligibility declaration does not match this roster or approval'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER current_eligibility_guard BEFORE INSERT OR UPDATE ON "SportRoster" FOR EACH ROW EXECUTE FUNCTION guard_current_eligibility();
