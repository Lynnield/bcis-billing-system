ALTER TYPE "public"."invoice_status" ADD VALUE 'draft' BEFORE 'unpaid';--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE 'credited';--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD COLUMN "post_issue" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_by_user_id" bigint;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;