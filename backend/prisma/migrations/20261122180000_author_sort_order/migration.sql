-- The admin decides the order of the authors on /colunistas (and in the
-- panel). Existing authors keep the alphabetical order they had until now.
ALTER TABLE "authors" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

UPDATE "authors" AS a
SET "sort_order" = ranked.position
FROM (
  SELECT "id", (ROW_NUMBER() OVER (ORDER BY "name" ASC) - 1)::INTEGER AS position
  FROM "authors"
) AS ranked
WHERE a."id" = ranked."id";
