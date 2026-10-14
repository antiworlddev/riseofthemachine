CREATE TABLE "Tournament" (
 id UUID PRIMARY KEY, "competitionId" UUID NOT NULL UNIQUE REFERENCES "Competition"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 format TEXT NOT NULL CHECK(format IN ('ROUND_ROBIN','KNOCKOUT')), "scoreLabel" TEXT NOT NULL CHECK(length("scoreLabel") BETWEEN 2 AND 40), rules JSONB,
 published BOOLEAN NOT NULL DEFAULT false, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), "drawnAt" TIMESTAMPTZ(3),
 CHECK(NOT published OR "drawnAt" IS NOT NULL),
 CHECK((format='KNOCKOUT' AND rules IS NULL) OR (format='ROUND_ROBIN' AND coalesce(jsonb_typeof(rules)='object' AND jsonb_typeof(rules->'winPoints')='number' AND jsonb_typeof(rules->'drawPoints')='number' AND jsonb_typeof(rules->'lossPoints')='number' AND (rules->>'winPoints')::numeric BETWEEN 0 AND 1000 AND (rules->>'drawPoints')::numeric BETWEEN 0 AND 1000 AND (rules->>'lossPoints')::numeric BETWEEN 0 AND 1000 AND (rules->>'winPoints')::numeric=trunc((rules->>'winPoints')::numeric) AND (rules->>'drawPoints')::numeric=trunc((rules->>'drawPoints')::numeric) AND (rules->>'lossPoints')::numeric=trunc((rules->>'lossPoints')::numeric) AND jsonb_typeof(rules->'allowDraws')='boolean' AND jsonb_typeof(rules->'tiebreakers')='array' AND rules->'tiebreakers' <@ '["WINS","SCORE_DIFFERENCE","SCORED"]'::jsonb,false)))
);
CREATE TABLE "TournamentEntry" (
 "tournamentId" UUID NOT NULL REFERENCES "Tournament"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "rosterId" UUID NOT NULL REFERENCES "SportRoster"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "teamName" TEXT NOT NULL, "drawPosition" INTEGER NOT NULL CHECK("drawPosition" BETWEEN 1 AND 32),
 PRIMARY KEY("tournamentId","rosterId"), UNIQUE("tournamentId","drawPosition")
);
CREATE TABLE "Fixture" (
 id UUID PRIMARY KEY, "tournamentId" UUID NOT NULL REFERENCES "Tournament"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 round INTEGER NOT NULL CHECK(round>0), slot INTEGER NOT NULL CHECK(slot>0),
 "homeRosterId" UUID, "awayRosterId" UUID, "winnerRosterId" UUID,
 status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','FINAL','BYE')),
 "homeScore" INTEGER CHECK("homeScore" BETWEEN 0 AND 100000), "awayScore" INTEGER CHECK("awayScore" BETWEEN 0 AND 100000), "deciderNote" TEXT CHECK(length("deciderNote") BETWEEN 5 AND 300),
 "startsAt" TIMESTAMPTZ(3), venue TEXT CHECK(length(venue) BETWEEN 2 AND 120), revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 "nextFixtureId" UUID REFERENCES "Fixture"(id) ON DELETE RESTRICT ON UPDATE CASCADE, "nextSide" TEXT,
 UNIQUE("tournamentId",round,slot), UNIQUE("nextFixtureId","nextSide"),
 FOREIGN KEY("tournamentId","homeRosterId") REFERENCES "TournamentEntry"("tournamentId","rosterId") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY("tournamentId","awayRosterId") REFERENCES "TournamentEntry"("tournamentId","rosterId") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY("tournamentId","winnerRosterId") REFERENCES "TournamentEntry"("tournamentId","rosterId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK("homeRosterId" IS NULL OR "awayRosterId" IS NULL OR "homeRosterId"<>"awayRosterId"),
 CHECK(("nextFixtureId" IS NULL AND "nextSide" IS NULL) OR ("nextFixtureId" IS NOT NULL AND "nextSide" IN ('HOME','AWAY'))),
 CHECK((status='SCHEDULED' AND "homeScore" IS NULL AND "awayScore" IS NULL AND "winnerRosterId" IS NULL AND "deciderNote" IS NULL) OR (status='FINAL' AND "homeRosterId" IS NOT NULL AND "awayRosterId" IS NOT NULL AND "homeScore" IS NOT NULL AND "awayScore" IS NOT NULL) OR (status='BYE' AND "winnerRosterId" IS NOT NULL AND "homeRosterId" IS NOT NULL AND "awayRosterId" IS NULL AND "winnerRosterId"="homeRosterId" AND "homeScore" IS NULL AND "awayScore" IS NULL AND "deciderNote" IS NULL))
);
CREATE FUNCTION guard_tournament_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "SportRoster" r JOIN "Tournament" t ON t."competitionId"=r."competitionId" JOIN "TeamRegistration" team ON team.id=r."teamId" WHERE r.id=NEW."rosterId" AND t.id=NEW."tournamentId" AND r.status='APPROVED' AND NEW."teamName"=team."teamName") THEN RAISE EXCEPTION 'Draw entry must be an approved roster in this competition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tournament_entry_guard BEFORE INSERT OR UPDATE ON "TournamentEntry" FOR EACH ROW EXECUTE FUNCTION guard_tournament_entry();
CREATE FUNCTION guard_fixture_result() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "Tournament"; target "Fixture";
BEGIN
 SELECT * INTO t FROM "Tournament" WHERE id=NEW."tournamentId";
 IF NEW.status='BYE' AND t.format<>'KNOCKOUT' THEN RAISE EXCEPTION 'Byes are knockout only'; END IF;
 IF NEW.status='FINAL' THEN
 IF NEW."homeScore">NEW."awayScore" AND NEW."winnerRosterId" IS DISTINCT FROM NEW."homeRosterId" OR NEW."awayScore">NEW."homeScore" AND NEW."winnerRosterId" IS DISTINCT FROM NEW."awayRosterId" THEN RAISE EXCEPTION 'Winner must match score'; END IF;
 IF NEW."homeScore"=NEW."awayScore" THEN
 IF t.format='ROUND_ROBIN' AND (NOT (t.rules->>'allowDraws')::boolean OR NEW."winnerRosterId" IS NOT NULL) OR t.format='KNOCKOUT' AND (NEW."winnerRosterId" IS NULL OR NEW."winnerRosterId" NOT IN (NEW."homeRosterId",NEW."awayRosterId") OR NEW."deciderNote" IS NULL) THEN RAISE EXCEPTION 'Tied result requires configured draw or knockout decider'; END IF;
 END IF;
 END IF;
 IF NEW."nextFixtureId" IS NOT NULL THEN
 SELECT * INTO target FROM "Fixture" WHERE id=NEW."nextFixtureId";
 IF t.format<>'KNOCKOUT' OR target."tournamentId" IS DISTINCT FROM NEW."tournamentId" OR target.round<>NEW.round+1 THEN RAISE EXCEPTION 'Bracket target must be next round of same tournament'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fixture_result_guard BEFORE INSERT OR UPDATE ON "Fixture" FOR EACH ROW EXECUTE FUNCTION guard_fixture_result();

CREATE FUNCTION guard_draw_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD."drawnAt" IS NOT NULL OR EXISTS(SELECT 1 FROM "TournamentEntry" WHERE "tournamentId"=OLD.id)) AND ROW(NEW.format,NEW."scoreLabel",NEW.rules) IS DISTINCT FROM ROW(OLD.format,OLD."scoreLabel",OLD.rules) THEN RAISE EXCEPTION 'Draw rules are immutable until an unused draw is reset'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER draw_rules_guard BEFORE UPDATE ON "Tournament" FOR EACH ROW EXECUTE FUNCTION guard_draw_rules();
