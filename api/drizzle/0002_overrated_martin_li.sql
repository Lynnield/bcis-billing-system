CREATE TYPE "public"."reconnection_status" AS ENUM('requested', 'completed');--> statement-breakpoint
CREATE TABLE "application_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" bigint
);
--> statement-breakpoint
CREATE TABLE "reconnection_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"service_account_id" bigint NOT NULL,
	"fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"technician_user_id" bigint,
	"request_date" timestamp with time zone DEFAULT now() NOT NULL,
	"completion_date" timestamp with time zone,
	"status" "reconnection_status" DEFAULT 'completed' NOT NULL,
	"notes" text,
	"requested_by_user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suspension_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"service_account_id" bigint NOT NULL,
	"reason" text,
	"effective_date" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by_user_id" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_technician_user_id_users_id_fk" FOREIGN KEY ("technician_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconnection_records_service_account_id_idx" ON "reconnection_records" USING btree ("service_account_id");--> statement-breakpoint
CREATE INDEX "suspension_records_service_account_id_idx" ON "suspension_records" USING btree ("service_account_id");