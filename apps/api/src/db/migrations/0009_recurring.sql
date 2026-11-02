CREATE TABLE "recurrence_exceptions" (
	"workspace_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"original_date" date NOT NULL,
	"action" text NOT NULL,
	"override_date" date,
	"override_amount" numeric(20, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurrence_exceptions_rule_id_original_date_pk" PRIMARY KEY("rule_id","original_date"),
	CONSTRAINT "recurrence_exceptions_action_known" CHECK ("recurrence_exceptions"."action" IN ('skip', 'override')),
	CONSTRAINT "recurrence_exceptions_override_not_negative" CHECK ("recurrence_exceptions"."override_amount" IS NULL OR "recurrence_exceptions"."override_amount" >= 0),
	CONSTRAINT "recurrence_exceptions_shape" CHECK (CASE WHEN "recurrence_exceptions"."action" = 'skip'
            THEN "recurrence_exceptions"."override_date" IS NULL AND "recurrence_exceptions"."override_amount" IS NULL
            ELSE "recurrence_exceptions"."override_date" IS NOT NULL OR "recurrence_exceptions"."override_amount" IS NOT NULL
          END)
);
--> statement-breakpoint
CREATE TABLE "recurring_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"payee" text,
	"notes" text,
	"amount" numeric(20, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_mode" text DEFAULT 'fixed' NOT NULL,
	"account_id" uuid NOT NULL,
	"to_account_id" uuid,
	"category_id" uuid,
	"goal_id" uuid,
	"freq" text NOT NULL,
	"interval" smallint DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"by_month_day" smallint,
	"weekend_policy" text DEFAULT 'none' NOT NULL,
	"end_date" date,
	"max_count" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"paused_from" date,
	"paused_until" date,
	"auto_post" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_rules_id_workspace_key" UNIQUE("id","workspace_id"),
	CONSTRAINT "recurring_rules_name_not_blank" CHECK (length(btrim("recurring_rules"."name")) > 0),
	CONSTRAINT "recurring_rules_kind_known" CHECK ("recurring_rules"."kind" IN ('expense', 'income', 'transfer')),
	CONSTRAINT "recurring_rules_amount_not_negative" CHECK ("recurring_rules"."amount" >= 0),
	CONSTRAINT "recurring_rules_amount_mode_known" CHECK ("recurring_rules"."amount_mode" IN ('fixed', 'estimated')),
	CONSTRAINT "recurring_rules_freq_known" CHECK ("recurring_rules"."freq" IN ('daily', 'weekly', 'monthly', 'yearly')),
	CONSTRAINT "recurring_rules_interval_positive" CHECK ("recurring_rules"."interval" BETWEEN 1 AND 365),
	CONSTRAINT "recurring_rules_month_day_range" CHECK ("recurring_rules"."by_month_day" IS NULL OR "recurring_rules"."by_month_day" BETWEEN 1 AND 31),
	CONSTRAINT "recurring_rules_weekend_policy_known" CHECK ("recurring_rules"."weekend_policy" IN ('none', 'previous_business_day', 'next_business_day')),
	CONSTRAINT "recurring_rules_end_after_start" CHECK ("recurring_rules"."end_date" IS NULL OR "recurring_rules"."end_date" >= "recurring_rules"."start_date"),
	CONSTRAINT "recurring_rules_max_count_range" CHECK ("recurring_rules"."max_count" IS NULL OR "recurring_rules"."max_count" BETWEEN 1 AND 1000),
	CONSTRAINT "recurring_rules_status_known" CHECK ("recurring_rules"."status" IN ('active', 'paused')),
	CONSTRAINT "recurring_rules_pause_ordered" CHECK ("recurring_rules"."paused_from" IS NULL
          OR "recurring_rules"."paused_until" IS NULL
          OR "recurring_rules"."paused_until" > "recurring_rules"."paused_from"),
	CONSTRAINT "recurring_rules_pause_matches_status" CHECK ("recurring_rules"."status" = 'paused'
          OR ("recurring_rules"."paused_from" IS NULL AND "recurring_rules"."paused_until" IS NULL)),
	CONSTRAINT "recurring_rules_transfer_shape" CHECK (CASE WHEN "recurring_rules"."kind" = 'transfer'
            THEN "recurring_rules"."to_account_id" IS NOT NULL
                 AND "recurring_rules"."to_account_id" <> "recurring_rules"."account_id"
                 AND "recurring_rules"."category_id" IS NULL
            ELSE "recurring_rules"."to_account_id" IS NULL
          END),
	CONSTRAINT "recurring_rules_auto_post_is_fixed" CHECK (NOT "recurring_rules"."auto_post" OR "recurring_rules"."amount_mode" = 'fixed')
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "occurrence_date" date;--> statement-breakpoint
ALTER TABLE "recurrence_exceptions" ADD CONSTRAINT "recurrence_exceptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_exceptions" ADD CONSTRAINT "recurrence_exceptions_rule_fk" FOREIGN KEY ("rule_id","workspace_id") REFERENCES "public"."recurring_rules"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_fk" FOREIGN KEY ("account_id","workspace_id","currency") REFERENCES "public"."accounts"("id","workspace_id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_to_account_fk" FOREIGN KEY ("to_account_id","workspace_id","currency") REFERENCES "public"."accounts"("id","workspace_id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_fk" FOREIGN KEY ("category_id","workspace_id") REFERENCES "public"."categories"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_goal_fk" FOREIGN KEY ("goal_id","workspace_id") REFERENCES "public"."goals"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurrence_exceptions_workspace_idx" ON "recurrence_exceptions" USING btree ("workspace_id","original_date");--> statement-breakpoint
CREATE INDEX "recurring_rules_workspace_status_idx" ON "recurring_rules" USING btree ("workspace_id","status","name");--> statement-breakpoint
CREATE INDEX "recurring_rules_series_idx" ON "recurring_rules" USING btree ("workspace_id","series_id","start_date");--> statement-breakpoint
CREATE INDEX "recurring_rules_auto_post_idx" ON "recurring_rules" USING btree ("workspace_id","start_date") WHERE "recurring_rules"."auto_post";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_occurrence_key" ON "transactions" USING btree ("workspace_id","recurring_rule_id","occurrence_date") WHERE "transactions"."deleted_at" IS NULL AND "transactions"."recurring_rule_id" IS NOT NULL;