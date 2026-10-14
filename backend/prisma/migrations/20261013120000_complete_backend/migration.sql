-- Brings the main-branch database up to the complete backend.
--
-- 1. Fixes the column names of the cover image. The initial migration created
--    them as "conver_url" / "conver_alt" (typo). RENAME keeps any existing data.
ALTER TABLE "posts" RENAME COLUMN "conver_url" TO "cover_url";
ALTER TABLE "posts" RENAME COLUMN "conver_alt" TO "cover_alt";

-- 2. Video support. Nullable on purpose: most posts have no video.
ALTER TABLE "posts" ADD COLUMN "video_url" TEXT;
ALTER TABLE "posts" ADD COLUMN "video_provider" TEXT;

-- Both columns travel together: either the post has a video (url + provider)
-- or it has neither. A url without a provider would be unrenderable.
--
-- The explicit `video_provider IS NOT NULL` is load-bearing. Without it,
-- `NULL IN ('youtube', 'r2')` evaluates to NULL instead of false, the whole
-- expression becomes NULL, and Postgres lets a CHECK that is NULL pass.
ALTER TABLE "posts" ADD CONSTRAINT "posts_video_pair"
CHECK (
  ("video_url" IS NULL AND "video_provider" IS NULL) OR
  (
    "video_url" IS NOT NULL
    AND "video_provider" IS NOT NULL
    AND "video_provider" IN ('youtube', 'r2')
  )
);
