-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('pending', 'active', 'unsubscribed');

-- CreateEnum
CREATE TYPE "NewsletterDeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL,
    "unsubscribe_token" TEXT NOT NULL,
    "confirm_token_hash" TEXT,
    "confirm_sent_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_issues" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "intro" TEXT,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_deliveries" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "status" "NewsletterDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_unsubscribe_token_key" ON "newsletter_subscribers"("unsubscribe_token");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_confirm_token_hash_key" ON "newsletter_subscribers"("confirm_token_hash");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_status_idx" ON "newsletter_subscribers"("status");

-- CreateIndex
CREATE INDEX "newsletter_issues_created_at_idx" ON "newsletter_issues"("created_at" DESC);

-- CreateIndex
CREATE INDEX "newsletter_deliveries_status_created_at_idx" ON "newsletter_deliveries"("status", "created_at");

-- CreateIndex
CREATE INDEX "newsletter_deliveries_sent_at_idx" ON "newsletter_deliveries"("sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_deliveries_issue_id_subscriber_id_key" ON "newsletter_deliveries"("issue_id", "subscriber_id");

-- AddForeignKey
ALTER TABLE "newsletter_issues" ADD CONSTRAINT "newsletter_issues_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "newsletter_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "newsletter_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

