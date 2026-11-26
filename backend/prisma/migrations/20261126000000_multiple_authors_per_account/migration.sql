-- One login may now write under several authors (a columnist who also
-- publishes for a friend). An author still belongs to one login at most:
-- that is the foreign key on authors.user_id, which stays. Only the
-- uniqueness goes; existing links are kept as they are.
DROP INDEX "authors_user_id_key";

CREATE INDEX "authors_user_id_idx" ON "authors"("user_id");
