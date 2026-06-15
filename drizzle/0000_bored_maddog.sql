CREATE TYPE "public"."commit_job_status" AS ENUM('queued', 'processing', 'committed', 'conflict', 'failed');--> statement-breakpoint
CREATE TYPE "public"."deploy_adapter" AS ENUM('cloudways', 'cloudflare', 'vercel', 'none');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('idle', 'queued', 'building', 'live', 'failed');--> statement-breakpoint
CREATE TYPE "public"."site_role" AS ENUM('client_editor', 'viewer');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"file_path" text,
	"commit_sha" text,
	"summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commit_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_email" text NOT NULL,
	"file_path" text NOT NULL,
	"base_sha" text,
	"payload" jsonb NOT NULL,
	"status" "commit_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"result_commit_sha" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "site_role" DEFAULT 'client_editor' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"is_staff" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "site_role" DEFAULT 'client_editor' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"github_installation_id" integer NOT NULL,
	"repo_owner" text NOT NULL,
	"repo_name" text NOT NULL,
	"content_branch" text DEFAULT 'main' NOT NULL,
	"schema_path" text DEFAULT 'portal.yml' NOT NULL,
	"schema_json" jsonb,
	"schema_sha" text,
	"schema_synced_at" timestamp with time zone,
	"client_editing_enabled" boolean DEFAULT false NOT NULL,
	"deploy_adapter" "deploy_adapter" DEFAULT 'none' NOT NULL,
	"deploy_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit_jobs" ADD CONSTRAINT "commit_jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit_jobs" ADD CONSTRAINT "commit_jobs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_members" ADD CONSTRAINT "site_members_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_members" ADD CONSTRAINT "site_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_site_idx" ON "audit_log" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "commit_jobs_site_status_idx" ON "commit_jobs" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX "commit_jobs_file_idx" ON "commit_jobs" USING btree ("site_id","file_path");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invites_site_email_idx" ON "invites" USING btree ("site_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_key" ON "org_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "site_members_site_user_key" ON "site_members" USING btree ("site_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_repo_key" ON "sites" USING btree ("repo_owner","repo_name");--> statement-breakpoint
CREATE INDEX "sites_org_idx" ON "sites" USING btree ("org_id");
-- Audit log is append-only. Block UPDATE/DELETE at the database level so a
-- compromised app credential cannot rewrite history. Inserts remain allowed.
CREATE RULE "audit_log_no_update" AS ON UPDATE TO "audit_log" DO INSTEAD NOTHING;
--> statement-breakpoint
CREATE RULE "audit_log_no_delete" AS ON DELETE TO "audit_log" DO INSTEAD NOTHING;
