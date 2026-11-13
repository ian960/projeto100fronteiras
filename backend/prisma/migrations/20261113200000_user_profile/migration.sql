-- "Minha conta": every user (readers too) can set a photo and a short bio.
ALTER TABLE "users" ADD COLUMN "bio" TEXT,
ADD COLUMN "avatar_id" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_fkey" FOREIGN KEY ("avatar_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
