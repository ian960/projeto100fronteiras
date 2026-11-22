-- News brought by the import robots now waits in Revisão (pending) instead of
-- sitting among the drafts. Move the ones already imported and not yet
-- touched into the same place. Data only: the schema does not change.
UPDATE "posts"
SET "status" = 'pending'
WHERE "status" = 'draft'
  AND "id" IN (SELECT "post_id" FROM "imported_items" WHERE "post_id" IS NOT NULL);
