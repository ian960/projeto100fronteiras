-- Home carousel: any number of featured posts instead of a single lead story.

-- Several posts can now be featured at once.
DROP INDEX IF EXISTS "posts_single_featured";

-- When the admin featured it: the carousel shows the most recent first.
ALTER TABLE "posts" ADD COLUMN "featured_at" TIMESTAMP(3);
UPDATE "posts" SET "featured_at" = CURRENT_TIMESTAMP WHERE "featured" = true;

CREATE INDEX "posts_featured_featured_at_idx" ON "posts"("featured", "featured_at" DESC);
