ALTER TABLE "Order" ADD COLUMN "operationsRevision" INTEGER NOT NULL DEFAULT 1 CHECK ("operationsRevision">0);
ALTER TABLE "MerchOrder" ADD COLUMN "operationsRevision" INTEGER NOT NULL DEFAULT 1 CHECK ("operationsRevision">0);
CREATE TABLE "PaymentRefund" (
 "id" UUID PRIMARY KEY,
 "orderId" UUID UNIQUE REFERENCES "Order"(id) ON DELETE RESTRICT,
 "merchOrderId" UUID UNIQUE REFERENCES "MerchOrder"(id) ON DELETE RESTRICT,
 "reference" TEXT NOT NULL UNIQUE CHECK (reference ~ '^(rotm|merch)-[a-f0-9]{32}$'),
 "transactionId" TEXT NOT NULL UNIQUE CHECK ("transactionId" ~ '^[0-9]+$'),
 "domain" TEXT NOT NULL CHECK (domain IN ('test','live')),
 "amountMinor" INTEGER NOT NULL CHECK ("amountMinor">0),
 "currency" TEXT NOT NULL DEFAULT 'NGN' CHECK (currency='NGN'),
 "status" TEXT NOT NULL DEFAULT 'INITIATING' CHECK (status IN ('INITIATING','UNKNOWN','pending','processing','needs-attention','failed','processed')),
 "providerRefundId" TEXT UNIQUE CHECK ("providerRefundId" IS NULL OR "providerRefundId" ~ '^[0-9]+$'),
 "stockBasis" TEXT NOT NULL CHECK ("stockBasis" IN ('SOLD','NONE')),
 "reason" TEXT NOT NULL CHECK (length(reason) BETWEEN 5 AND 500),
 "requestedBy" UUID NOT NULL REFERENCES "StaffUser"(id) ON DELETE RESTRICT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT refund_one_order CHECK (("orderId" IS NULL) <> ("merchOrderId" IS NULL)),
 CONSTRAINT refund_processed_provider CHECK (status!='processed' OR "providerRefundId" IS NOT NULL)
);
