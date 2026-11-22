-- News may go out unsigned, or signed with a name the admin types that is not
-- a registered author ("Da redação", "Com informações da Agência Brasil").
--   author_id set             -> the registered author signs it
--   byline_name set           -> that free-text name signs it (no author page)
--   both NULL                 -> no byline at all
ALTER TABLE "posts" ALTER COLUMN "author_id" DROP NOT NULL;
ALTER TABLE "posts" ADD COLUMN "byline_name" TEXT;

-- Never both: one byline per post.
ALTER TABLE "posts" ADD CONSTRAINT "posts_single_byline"
CHECK ("author_id" IS NULL OR "byline_name" IS NULL);

-- A column is its columnist's: it always has a registered author.
ALTER TABLE "posts" ADD CONSTRAINT "posts_column_has_author"
CHECK ("type" <> 'column' OR "author_id" IS NOT NULL);
