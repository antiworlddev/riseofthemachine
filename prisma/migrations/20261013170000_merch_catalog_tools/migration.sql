ALTER TABLE "MerchProduct" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "MerchProduct" ADD CONSTRAINT "MerchProduct_revision_positive" CHECK ("revision" > 0);
ALTER TABLE "MerchVariant" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "MerchOrder_eventSlug_createdAt_id_idx" ON "MerchOrder"("eventSlug", "createdAt", "id");
