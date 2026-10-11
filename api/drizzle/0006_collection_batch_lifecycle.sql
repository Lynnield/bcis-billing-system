CREATE TABLE "collection_batch_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"batch_id" bigint NOT NULL,
	"service_account_id" bigint NOT NULL,
	"balance_due" numeric(14, 2) NOT NULL,
	CONSTRAINT "collection_batch_accounts_batch_account_unique" UNIQUE("batch_id","service_account_id")
);
--> statement-breakpoint
ALTER TABLE "collection_batches" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "collection_batches" ALTER COLUMN "status" SET DEFAULT 'open'::text;--> statement-breakpoint
DROP TYPE "public"."collection_batch_status";--> statement-breakpoint
CREATE TYPE "public"."collection_batch_status" AS ENUM('open', 'in_progress', 'submitted', 'remitted', 'reconciled', 'closed');--> statement-breakpoint
ALTER TABLE "collection_batches" ALTER COLUMN "status" SET DEFAULT 'open'::"public"."collection_batch_status";--> statement-breakpoint
ALTER TABLE "collection_batches" ALTER COLUMN "status" SET DATA TYPE "public"."collection_batch_status" USING "status"::"public"."collection_batch_status";--> statement-breakpoint
ALTER TABLE "collection_batches" ADD COLUMN "expected_receivable" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD COLUMN "reconciled_by_user_id" bigint;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD COLUMN "closed_by_user_id" bigint;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD COLUMN "closing_notes" text;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_batch_accounts_service_account_id_idx" ON "collection_batch_accounts" USING btree ("service_account_id");--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_reconciled_by_user_id_users_id_fk" FOREIGN KEY ("reconciled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;