-- A banner can be just a picture: no advertiser name, no link.
ALTER TABLE "banners" ALTER COLUMN "advertiser" DROP NOT NULL;
ALTER TABLE "banners" ALTER COLUMN "link_url" DROP NOT NULL;
