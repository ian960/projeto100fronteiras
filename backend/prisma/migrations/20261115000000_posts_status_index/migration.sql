-- CreateIndex
CREATE INDEX "posts_status_published_at_idx" ON "posts"("status", "published_at" DESC);
