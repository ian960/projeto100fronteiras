-- CreateTable
CREATE TABLE "news_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feed_url" TEXT NOT NULL,
    "full_text" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "category_id" TEXT,
    "last_run_at" TIMESTAMP(3),
    "last_error" TEXT,
    "last_imported_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imported_items" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "post_id" TEXT,
    "image_url" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imported_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_sources_feed_url_key" ON "news_sources"("feed_url");

-- CreateIndex
CREATE UNIQUE INDEX "imported_items_post_id_key" ON "imported_items"("post_id");

-- CreateIndex
CREATE INDEX "imported_items_imported_at_idx" ON "imported_items"("imported_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "imported_items_source_id_guid_key" ON "imported_items"("source_id", "guid");

-- AddForeignKey
ALTER TABLE "news_sources" ADD CONSTRAINT "news_sources_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_items" ADD CONSTRAINT "imported_items_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "news_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_items" ADD CONSTRAINT "imported_items_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
