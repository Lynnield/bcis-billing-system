ALTER TABLE "service_accounts" DROP CONSTRAINT "service_accounts_subscriber_id_subscribers_id_fk";
--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD COLUMN "completed_by_user_id" bigint;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD COLUMN "billed_invoice_id" bigint;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD COLUMN "installation_address" varchar(255);--> statement-breakpoint
ALTER TABLE "service_accounts" ADD COLUMN "billing_start_date" date;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD COLUMN "billing_due_day" integer;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD COLUMN "current_rate" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "code" varchar(30);--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "installation_fee" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "reconnection_fee" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "speed_mbps" integer;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "channel_count" integer;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_billed_invoice_id_invoices_id_fk" FOREIGN KEY ("billed_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_reference_number_idx" ON "payments" USING btree ("reference_number");--> statement-breakpoint
CREATE INDEX "service_accounts_collector_idx" ON "service_accounts" USING btree ("assigned_collector_id");--> statement-breakpoint
CREATE INDEX "service_accounts_area_idx" ON "service_accounts" USING btree ("collection_area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_plans_code_unique" ON "service_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "subscribers_contact_number_idx" ON "subscribers" USING btree ("contact_number");--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_due_day_range" CHECK ("service_accounts"."billing_due_day" is null or "service_accounts"."billing_due_day" between 1 and 28);--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_rate_non_negative" CHECK ("service_accounts"."current_rate" is null or "service_accounts"."current_rate" >= 0);--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_fees_non_negative" CHECK ("service_plans"."installation_fee" >= 0 AND "service_plans"."reconnection_fee" >= 0);