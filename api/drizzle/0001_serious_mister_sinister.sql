CREATE TYPE "public"."backup_status" AS ENUM('completed', 'verified', 'failed', 'restored');--> statement-breakpoint
CREATE TABLE "backup_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"filename" varchar(255) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"status" "backup_status" DEFAULT 'completed' NOT NULL,
	"created_by_user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"restored_at" timestamp with time zone,
	"restored_by_user_id" bigint
);
--> statement-breakpoint
ALTER TABLE "backup_history" ADD CONSTRAINT "backup_history_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_history" ADD CONSTRAINT "backup_history_restored_by_user_id_users_id_fk" FOREIGN KEY ("restored_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_history_created_at_idx" ON "backup_history" USING btree ("created_at");