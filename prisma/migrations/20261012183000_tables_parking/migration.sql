ALTER TABLE "TicketTier" ADD COLUMN "parkingPerTable" INTEGER;
ALTER TABLE "Order" ADD COLUMN "tableArrivedAt" TIMESTAMPTZ(3), ADD COLUMN "tableLabel" TEXT, ADD COLUMN "bookingNote" TEXT, ADD COLUMN "bookingRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "OrderLine" ADD COLUMN "parkingQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TicketTier" ADD CONSTRAINT "table_parking_allocation" CHECK ("parkingPerTable" IS NULL OR (code IN ('engines','autobots','machineries') AND "parkingPerTable" BETWEEN 1 AND 100));
ALTER TABLE "OrderLine" ADD CONSTRAINT "parking_quantity_range" CHECK ("parkingQuantity" BETWEEN 0 AND 100);
ALTER TABLE "Order" ADD CONSTRAINT "booking_revision_positive" CHECK ("bookingRevision">0), ADD CONSTRAINT "booking_label_length" CHECK ("tableLabel" IS NULL OR length("tableLabel") BETWEEN 1 AND 80), ADD CONSTRAINT "booking_note_length" CHECK ("bookingNote" IS NULL OR length("bookingNote") BETWEEN 1 AND 500);
CREATE UNIQUE INDEX "Order_table_label_unique" ON "Order" ("eventId","tableLabel") WHERE "tableLabel" IS NOT NULL AND status='PAID';
CREATE TABLE "TableInventory" (
 "eventId" UUID PRIMARY KEY REFERENCES "Event"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "parkingCapacity" INTEGER NOT NULL DEFAULT 0, "parkingReserved" INTEGER NOT NULL DEFAULT 0, "parkingSold" INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1,
 CONSTRAINT "parking_stock" CHECK ("parkingCapacity" BETWEEN 0 AND 1000000 AND "parkingReserved">=0 AND "parkingSold">=0 AND "parkingReserved"+"parkingSold"<="parkingCapacity"),
 CONSTRAINT "parking_revision" CHECK(revision>0)
);
CREATE TABLE "ParkingPass" (
 id UUID PRIMARY KEY, "orderLineId" UUID NOT NULL REFERENCES "OrderLine"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ordinal INTEGER NOT NULL CHECK(ordinal>0), "tokenHash" VARCHAR(64) NOT NULL UNIQUE CHECK("tokenHash" ~ '^[a-f0-9]{64}$'), "encryptedToken" TEXT NOT NULL, status "TicketStatus" NOT NULL DEFAULT 'ACTIVE',
 UNIQUE("orderLineId",ordinal)
);
CREATE TABLE "ParkingAdmission" (
 "passId" UUID PRIMARY KEY REFERENCES "ParkingPass"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "staffId" UUID NOT NULL REFERENCES "StaffUser"(id) ON DELETE RESTRICT ON UPDATE CASCADE, "scannedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE FUNCTION validate_parking_pass() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l "OrderLine"; o "Order"; tier "TicketTier";
BEGIN
 SELECT * INTO l FROM "OrderLine" WHERE id=NEW."orderLineId";
 SELECT * INTO o FROM "Order" WHERE id=l."orderId";
 SELECT * INTO tier FROM "TicketTier" WHERE id=l."tierId";
 IF o.status<>'PAID' OR o."needsReconciliation" OR tier.code NOT IN ('engines','autobots','machineries') OR NEW.ordinal>l."parkingQuantity" THEN RAISE EXCEPTION 'Parking requires a confirmed table and captured allocation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER parking_pass_guard BEFORE INSERT ON "ParkingPass" FOR EACH ROW EXECUTE FUNCTION validate_parking_pass();
CREATE FUNCTION validate_parking_admission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 SELECT p.status='ACTIVE' AND o.status='PAID' AND NOT o."needsReconciliation" AND s.enabled AND s.role IN ('ADMIN','SCANNER') AND EXISTS(SELECT 1 FROM "PaymentAttempt" WHERE "orderId"=o.id AND status='VERIFIED') INTO valid
 FROM "ParkingPass" p JOIN "OrderLine" l ON l.id=p."orderLineId" JOIN "Order" o ON o.id=l."orderId" JOIN "StaffUser" s ON s.id=NEW."staffId" WHERE p.id=NEW."passId";
 IF NOT coalesce(valid,false) THEN RAISE EXCEPTION 'Parking pass not admissible'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER parking_admission_guard BEFORE INSERT ON "ParkingAdmission" FOR EACH ROW EXECUTE FUNCTION validate_parking_admission();

ALTER TABLE "TicketTier" ADD CONSTRAINT "confirmed_table_prices" CHECK (code NOT IN ('engines','autobots','machineries') OR (currency='NGN' AND "priceMinor"=CASE code WHEN 'engines' THEN 300000000 WHEN 'autobots' THEN 500000000 ELSE 1000000000 END));
