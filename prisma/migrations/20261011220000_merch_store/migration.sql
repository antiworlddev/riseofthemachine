CREATE TYPE "MerchFulfilment" AS ENUM ('PICKUP', 'DELIVERY');

CREATE TYPE "MerchFulfilmentStatus" AS ENUM ('PENDING', 'READY', 'DISPATCHED', 'COMPLETED');

CREATE TABLE "MerchProduct" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MerchProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchVariant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "sold" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MerchVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchOrder" (
    "id" UUID NOT NULL,
    "eventSlug" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "buyerSubject" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fulfilment" "MerchFulfilment" NOT NULL,
    "address" JSONB,
    "deliveryTerms" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'RESERVED',
    "needsReconciliation" BOOLEAN NOT NULL DEFAULT false,
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilmentStatus" "MerchFulfilmentStatus" NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "trackingNote" TEXT,

    CONSTRAINT "MerchOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchOrderLine" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "variantLabel" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,

    CONSTRAINT "MerchOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchPayment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "authorizationUrl" TEXT,
    "initializingAt" TIMESTAMPTZ(3),
    "domain" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MerchPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchProduct_slug_key" ON "MerchProduct"("slug");

CREATE UNIQUE INDEX "MerchVariant_productId_label_key" ON "MerchVariant"("productId", "label");

CREATE UNIQUE INDEX "MerchOrder_idempotencyKey_key" ON "MerchOrder"("idempotencyKey");

CREATE INDEX "MerchOrder_buyerSubject_createdAt_idx" ON "MerchOrder"("buyerSubject", "createdAt");

CREATE INDEX "MerchOrder_status_expiresAt_idx" ON "MerchOrder"("status", "expiresAt");

CREATE UNIQUE INDEX "MerchOrderLine_orderId_variantId_key" ON "MerchOrderLine"("orderId", "variantId");

CREATE UNIQUE INDEX "MerchPayment_orderId_key" ON "MerchPayment"("orderId");

CREATE UNIQUE INDEX "MerchPayment_reference_key" ON "MerchPayment"("reference");

CREATE UNIQUE INDEX "MerchPayment_providerTransactionId_key" ON "MerchPayment"("providerTransactionId");

ALTER TABLE "MerchVariant" ADD CONSTRAINT "MerchVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MerchProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MerchOrderLine" ADD CONSTRAINT "MerchOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MerchOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MerchOrderLine" ADD CONSTRAINT "MerchOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MerchVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MerchPayment" ADD CONSTRAINT "MerchPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MerchOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MerchProduct" ADD CONSTRAINT "merch_price" CHECK ("priceMinor">0 AND kind IN ('TEE','CAP','SATCHEL'));
ALTER TABLE "MerchVariant" ADD CONSTRAINT "merch_stock" CHECK (capacity>=0 AND reserved>=0 AND sold>=0 AND capacity>=reserved+sold);
ALTER TABLE "MerchOrderLine" ADD CONSTRAINT "merch_line" CHECK (quantity BETWEEN 1 AND 10 AND "unitPriceMinor">0);
ALTER TABLE "MerchOrder" ADD CONSTRAINT "merch_total" CHECK ("totalMinor">0 AND currency='NGN' AND (status!='PAID' OR "paidAt" IS NOT NULL));
ALTER TABLE "MerchOrder" ADD CONSTRAINT "merch_address" CHECK ((fulfilment='PICKUP' AND address IS NULL AND "deliveryTerms" IS NULL) OR (fulfilment='DELIVERY' AND address IS NOT NULL AND "deliveryTerms" IS NOT NULL));
ALTER TABLE "MerchOrder" ADD CONSTRAINT "merch_fulfilment" CHECK ("fulfilmentStatus"='PENDING' OR (status='PAID' AND NOT "needsReconciliation"));
ALTER TABLE "MerchPayment" ADD CONSTRAINT "merch_payment" CHECK ("amountMinor">0 AND currency='NGN' AND domain IN ('test','live') AND (status!='VERIFIED' OR ("verifiedAt" IS NOT NULL AND "providerTransactionId" IS NOT NULL)));
