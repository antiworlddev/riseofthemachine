BEGIN;
CREATE OR REPLACE FUNCTION guard_roster_member() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE roster_status "RegistrationStatus";
BEGIN
 IF TG_OP = 'UPDATE' AND NEW."rosterId" <> OLD."rosterId" THEN
   RAISE EXCEPTION 'Moving roster members is not supported';
 END IF;
 SELECT status INTO roster_status FROM "SportRoster" WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."rosterId" ELSE NEW."rosterId" END FOR UPDATE;
 IF roster_status IS NULL OR roster_status NOT IN ('DRAFT','REJECTED') THEN
   RAISE EXCEPTION 'Only draft or rejected rosters may be edited';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
COMMIT;
