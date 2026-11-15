-- Local advertisers' banners, managed by the admin in the panel.

-- CreateEnum
CREATE TYPE "BannerSlot" AS ENUM ('home_top', 'home_middle', 'article_middle', 'article_end', 'site_footer');

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "advertiser" TEXT NOT NULL,
    "link_url" TEXT NOT NULL,
    "slot" "BannerSlot" NOT NULL,
    "image_id" TEXT NOT NULL,
    "mobile_image_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id"),
    -- The service checks this too; the database has the last word.
    CONSTRAINT "banners_period" CHECK ("ends_at" > "starts_at")
);

-- CreateIndex
CREATE INDEX "banners_slot_active_starts_at_ends_at_idx" ON "banners"("slot", "active", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "banners_image_id_idx" ON "banners"("image_id");

-- CreateIndex
CREATE INDEX "banners_mobile_image_id_idx" ON "banners"("mobile_image_id");

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_mobile_image_id_fkey" FOREIGN KEY ("mobile_image_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
