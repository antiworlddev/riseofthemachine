BEGIN;
ALTER TABLE "TicketTier" ADD CONSTRAINT "inventory_bounds" CHECK ("priceMinor" >= 0 AND capacity >= 0 AND reserved >= 0 AND sold >= 0 AND reserved + sold <= capacity);
ALTER TABLE "Order" ADD CONSTRAINT "order_amount" CHECK ("totalMinor" >= 0), ADD CONSTRAINT "paid_timestamp" CHECK ((status <> 'PAID') OR "paidAt" IS NOT NULL);
ALTER TABLE "OrderLine" ADD CONSTRAINT "line_bounds" CHECK (quantity > 0 AND "unitPriceMinor" >= 0);
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "payment_bounds" CHECK ("amountMinor" >= 0), ADD CONSTRAINT "verified_evidence" CHECK (status <> 'VERIFIED' OR ("verifiedAt" IS NOT NULL AND "providerTransactionId" IS NOT NULL));
ALTER TABLE "Ticket" ADD CONSTRAINT "ticket_ordinal" CHECK (ordinal > 0), ADD CONSTRAINT "token_hash_format" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "StaffUser" ADD CONSTRAINT "staff_role" CHECK (role IN ('ADMIN', 'SCANNER'));
ALTER TABLE "Competition" ADD CONSTRAINT "roster_limits" CHECK (("minPlayers" IS NULL OR "minPlayers" > 0) AND ("maxPlayers" IS NULL OR "maxPlayers" > 0) AND ("minPlayers" IS NULL OR "maxPlayers" IS NULL OR "minPlayers" <= "maxPlayers"));
ALTER TABLE "SportRoster" ADD CONSTRAINT "roster_revision" CHECK (revision > 0), ADD CONSTRAINT "submitted_timestamp" CHECK (status NOT IN ('SUBMITTED','APPROVED','REJECTED') OR "submittedAt" IS NOT NULL);
ALTER TABLE "RosterMember" ADD CONSTRAINT "jersey_bounds" CHECK ("jerseyNumber" IS NULL OR "jerseyNumber" BETWEEN 0 AND 999);
CREATE UNIQUE INDEX "one_captain_per_roster" ON "RosterMember" ("rosterId") WHERE captain;
ALTER TABLE "TeamRegistration" ADD CONSTRAINT "canonical_team_key" CHECK ("teamKey" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Representative" ADD CONSTRAINT "canonical_email" CHECK (email = lower(btrim(email)));
ALTER TABLE "Order" ADD CONSTRAINT "canonical_buyer_email" CHECK ("buyerEmail" = lower(btrim("buyerEmail")));
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "attempts_bounds" CHECK (attempts >= 0);

-- Lock the line so concurrent issuance cannot evade quantity checks.
CREATE FUNCTION enforce_ticket_issuance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line_quantity integer; order_status "OrderStatus";
BEGIN
 SELECT l.quantity, o.status INTO line_quantity, order_status
 FROM "OrderLine" l JOIN "Order" o ON o.id = l."orderId"
 WHERE l.id = NEW."orderLineId" FOR UPDATE OF l, o;
 IF order_status IS DISTINCT FROM 'PAID' OR NEW.ordinal > line_quantity THEN
   RAISE EXCEPTION 'Ticket requires paid order and ordinal within purchased quantity';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ticket_issuance BEFORE INSERT OR UPDATE OF "orderLineId", ordinal ON "Ticket" FOR EACH ROW EXECUTE FUNCTION enforce_ticket_issuance();

CREATE FUNCTION enforce_admission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ticket_status "TicketStatus"; order_status "OrderStatus"; staff_enabled boolean;
BEGIN
 SELECT t.status, o.status INTO ticket_status, order_status
 FROM "Ticket" t JOIN "OrderLine" l ON l.id = t."orderLineId" JOIN "Order" o ON o.id = l."orderId"
 WHERE t.id = NEW."ticketId" FOR UPDATE OF t, o;
 SELECT enabled INTO staff_enabled FROM "StaffUser" WHERE id = NEW."staffId";
 IF ticket_status IS DISTINCT FROM 'ACTIVE' OR order_status IS DISTINCT FROM 'PAID' OR staff_enabled IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Admission requires active ticket, paid order and enabled staff';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER admission_guard BEFORE INSERT ON "Admission" FOR EACH ROW EXECUTE FUNCTION enforce_admission();

-- Application also locks this parent when editing members. Trigger locks it for DB writers.
CREATE FUNCTION guard_roster_member() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE roster_status "RegistrationStatus";
BEGIN
 IF TG_OP = 'UPDATE' AND NEW."rosterId" <> OLD."rosterId" THEN
   RAISE EXCEPTION 'Moving roster members is not supported';
 END IF;
 SELECT status INTO roster_status FROM "SportRoster" WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."rosterId" ELSE NEW."rosterId" END FOR UPDATE;
 IF roster_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Only draft rosters may be edited'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER roster_member_guard BEFORE INSERT OR UPDATE OR DELETE ON "RosterMember" FOR EACH ROW EXECUTE FUNCTION guard_roster_member();
CREATE FUNCTION validate_roster_submission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE player_count integer; minimum integer; maximum integer;
BEGIN
 IF TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' THEN
  RAISE EXCEPTION 'Rosters must be created as drafts';
 END IF;
 IF TG_OP = 'UPDATE' AND NEW.status = 'SUBMITTED' AND OLD.status <> 'SUBMITTED' THEN
  SELECT count(*) INTO player_count FROM "RosterMember" WHERE "rosterId" = NEW.id;
  SELECT "minPlayers", "maxPlayers" INTO minimum, maximum FROM "Competition" WHERE id = NEW."competitionId";
  IF player_count = 0 OR (minimum IS NOT NULL AND player_count < minimum) OR (maximum IS NOT NULL AND player_count > maximum) THEN
   RAISE EXCEPTION 'Roster does not meet configured player limits';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER roster_submission_guard BEFORE INSERT OR UPDATE OF status ON "SportRoster" FOR EACH ROW EXECUTE FUNCTION validate_roster_submission();
COMMIT;
