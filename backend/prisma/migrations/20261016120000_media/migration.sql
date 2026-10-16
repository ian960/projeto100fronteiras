-- Media in Cloudinary: covers, author photos, videos and PDF attachments.
--
-- Data notes:
--   - YouTube videos are kept: the id moves from "video_url" to the new
--     "video_youtube_id" column before the old pair is dropped.
--   - Covers and author photos were plain links to other sites. They cannot be
--     carried over automatically (the file has to be uploaded), so they go.
--     Posts keep their alt text; re-attach an image in the panel.
--   - Uploaded videos (provider "r2") were never used in production.

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('image', 'video', 'document');

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "public_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_sec" DOUBLE PRECISION,
    "pages" INTEGER,
    "original_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by_id" TEXT NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_attachments" (
    "post_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "post_attachments_pkey" PRIMARY KEY ("post_id","media_id")
);

-- AlterTable
ALTER TABLE "authors" DROP COLUMN "photo_url",
ADD COLUMN     "photo_id" TEXT;

-- AlterTable: new columns first, so the YouTube ids can be copied over.
ALTER TABLE "posts" ADD COLUMN     "cover_id" TEXT,
ADD COLUMN     "video_id" TEXT,
ADD COLUMN     "video_youtube_id" TEXT;

UPDATE "posts"
SET "video_youtube_id" = "video_url"
WHERE "video_provider" = 'youtube';

-- AlterTable: the old pair and its CHECK go away.
ALTER TABLE "posts" DROP CONSTRAINT "posts_video_pair";

ALTER TABLE "posts" DROP COLUMN "cover_url",
DROP COLUMN "video_provider",
DROP COLUMN "video_url";

-- One video per post: a YouTube id or an uploaded file, never both.
ALTER TABLE "posts" ADD CONSTRAINT "posts_single_video"
CHECK ("video_youtube_id" IS NULL OR "video_id" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "media_public_id_key" ON "media"("public_id");

-- CreateIndex
CREATE INDEX "media_uploaded_by_id_created_at_idx" ON "media"("uploaded_by_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "post_attachments_media_id_idx" ON "post_attachments"("media_id");

-- AddForeignKey
ALTER TABLE "authors" ADD CONSTRAINT "authors_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_id_fkey" FOREIGN KEY ("cover_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
