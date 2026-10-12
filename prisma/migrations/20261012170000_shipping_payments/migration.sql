CREATE TABLE "ShippingRate" (
 "id" UUID PRIMARY KEY,
 "eventSlug" TEXT NOT NULL,
 "state" TEXT NOT NULL CHECK (length(state) BETWEEN 2 AND 80),
 "stateKey" TEXT NOT NULL,
 "feeMinor" INTEGER NOT NULL CHECK ("feeMinor" BETWEEN 0 AND 100000000),
 "note" TEXT NOT NULL CHECK (length(note) BETWEEN 5 AND 300),
 "enabled" BOOLEAN NOT NULL DEFAULT false,
 "revision" INTEGER NOT NULL DEFAULT 1 CHECK (revision>0),
 UNIQUE ("eventSlug","stateKey")
);
ALTER TABLE "MerchOrder"
 ADD COLUMN "shippingFeeMinor" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "shippingRateId" UUID REFERENCES "ShippingRate"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "shippingSnapshot" JSONB;
ALTER TABLE "MerchOrder" ADD CONSTRAINT shipping_order_amount CHECK ("shippingFeeMinor">=0 AND "shippingFeeMinor"<"totalMinor");
ALTER TABLE "MerchOrder" ADD CONSTRAINT shipping_snapshot CHECK (
 ("shippingFeeMinor"=0 AND "shippingRateId" IS NULL AND "shippingSnapshot" IS NULL)
 OR (fulfilment='DELIVERY' AND "shippingRateId" IS NOT NULL AND "shippingSnapshot" IS NOT NULL AND jsonb_typeof("shippingSnapshot")='object' AND
 COALESCE(("shippingSnapshot"->>'feeMinor')::integer="shippingFeeMinor" AND "shippingSnapshot"->>'currency'='NGN' AND "shippingSnapshot"->>'rateId'="shippingRateId"::text AND length("shippingSnapshot"->>'state') BETWEEN 2 AND 80 AND "shippingSnapshot"->>'state'=address->>'state' AND address->>'country'='Nigeria' AND ("shippingSnapshot"->>'revision')::integer>0 AND length("shippingSnapshot"->>'note') BETWEEN 5 AND 300,false))
);
