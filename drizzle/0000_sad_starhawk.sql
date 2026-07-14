CREATE TYPE "public"."counter_status" AS ENUM('active', 'on_break', 'closed');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('user', 'counter');--> statement-breakpoint
CREATE TYPE "public"."token_event_type" AS ENUM('generated', 'assigned', 'served', 'not_arrived', 'prioritized', 'deleted', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."token_status" AS ENUM('queued', 'assigned', 'served', 'not_arrived');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'reception');--> statement-breakpoint
CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"application_number" varchar(50) PRIMARY KEY NOT NULL,
	"application_name" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(30) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_open" boolean DEFAULT false NOT NULL,
	"status" "counter_status" DEFAULT 'closed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_sequences" (
	"business_day" date PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "session_kind" NOT NULL,
	"user_id" uuid,
	"counter_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_kind_target_ck" CHECK ((kind = 'user' AND user_id IS NOT NULL AND counter_id IS NULL)
        OR (kind = 'counter' AND counter_id IS NOT NULL AND user_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "token_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "token_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"token_id" uuid,
	"token_number" integer,
	"application_number" varchar(50),
	"event_type" "token_event_type" NOT NULL,
	"actor_counter_id" uuid,
	"actor_user_id" uuid,
	"from_status" "token_status",
	"to_status" "token_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_day" date NOT NULL,
	"token_number" integer NOT NULL,
	"application_number" varchar(50) NOT NULL,
	"application_name" varchar(200) NOT NULL,
	"status" "token_status" DEFAULT 'queued' NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_at" timestamp with time zone,
	"served_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_counter_id_counters_id_fk" FOREIGN KEY ("counter_id") REFERENCES "public"."counters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_events" ADD CONSTRAINT "token_events_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_events" ADD CONSTRAINT "token_events_actor_counter_id_counters_id_fk" FOREIGN KEY ("actor_counter_id") REFERENCES "public"."counters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_events" ADD CONSTRAINT "token_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_assigned_to_counters_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."counters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "counters_label_lower_uniq" ON "counters" USING btree (lower("label"));--> statement-breakpoint
CREATE INDEX "sessions_counter_active" ON "sessions" USING btree ("counter_id") WHERE kind = 'counter';--> statement-breakpoint
CREATE INDEX "token_events_token_idx" ON "token_events" USING btree ("token_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_day_number_uniq" ON "tokens" USING btree ("business_day","token_number");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_one_live_per_app" ON "tokens" USING btree ("business_day","application_number") WHERE status IN ('queued','assigned','not_arrived');--> statement-breakpoint
CREATE INDEX "tokens_queue_pick" ON "tokens" USING btree ("business_day","token_number") WHERE status = 'queued';--> statement-breakpoint
CREATE INDEX "tokens_assigned_by_counter" ON "tokens" USING btree ("assigned_to") WHERE status = 'assigned';--> statement-breakpoint
CREATE INDEX "tokens_day_status" ON "tokens" USING btree ("business_day","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_uniq" ON "users" USING btree (lower("username"));