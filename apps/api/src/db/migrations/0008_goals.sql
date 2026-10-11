CREATE TABLE "goal_contributions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"source" text NOT NULL,
	"transaction_id" uuid,
	"period_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_contributions_amount_not_zero" CHECK ("goal_contributions"."amount" <> 0),
	CONSTRAINT "goal_contributions_source_known" CHECK ("goal_contributions"."source" IN ('manual', 'plan_line', 'transfer', 'rollover')),
	CONSTRAINT "goal_contributions_transaction_is_transfer" CHECK ("goal_contributions"."transaction_id" IS NULL OR "goal_contributions"."source" = 'transfer')
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"target_amount" numeric(20, 4),
	"currency" char(3) NOT NULL,
	"target_date" date,
	"emergency_months" integer,
	"repeat" text,
	"kept_in_account_id" uuid,
	"priority" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_id_workspace_key" UNIQUE("id","workspace_id"),
	CONSTRAINT "goals_type_known" CHECK ("goals"."type" IN ('emergency_fund', 'savings', 'sinking_fund')),
	CONSTRAINT "goals_name_not_blank" CHECK (length(btrim("goals"."name")) > 0),
	CONSTRAINT "goals_target_not_negative" CHECK ("goals"."target_amount" IS NULL OR "goals"."target_amount" >= 0),
	CONSTRAINT "goals_target_matches_type" CHECK (CASE WHEN "goals"."type" = 'emergency_fund'
            THEN "goals"."target_amount" IS NULL AND "goals"."emergency_months" IS NOT NULL
            ELSE "goals"."target_amount" IS NOT NULL AND "goals"."emergency_months" IS NULL
          END),
	CONSTRAINT "goals_emergency_months_known" CHECK ("goals"."emergency_months" IS NULL OR "goals"."emergency_months" IN (1, 3, 6)),
	CONSTRAINT "goals_sinking_fund_has_date" CHECK ("goals"."type" <> 'sinking_fund' OR "goals"."target_date" IS NOT NULL),
	CONSTRAINT "goals_repeat_known" CHECK ("goals"."repeat" IS NULL
          OR ("goals"."type" = 'sinking_fund'
              AND "goals"."repeat" IN ('monthly', 'quarterly', 'annual')))
);
--> statement-breakpoint
ALTER TABLE "plan_lines" DROP CONSTRAINT "plan_lines_one_target";--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD COLUMN "goal_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_lines" ADD COLUMN "goal_id" uuid;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_period_id_plan_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."plan_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_fk" FOREIGN KEY ("goal_id","workspace_id") REFERENCES "public"."goals"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_kept_in_account_fk" FOREIGN KEY ("kept_in_account_id","workspace_id","currency") REFERENCES "public"."accounts"("id","workspace_id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_contributions_goal_date_idx" ON "goal_contributions" USING btree ("workspace_id","goal_id","date");--> statement-breakpoint
CREATE INDEX "goal_contributions_period_idx" ON "goal_contributions" USING btree ("workspace_id","period_id");--> statement-breakpoint
CREATE INDEX "goals_workspace_idx" ON "goals" USING btree ("workspace_id","priority","name");--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_goal_fk" FOREIGN KEY ("goal_id","workspace_id") REFERENCES "public"."goals"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_goal_fk" FOREIGN KEY ("goal_id","workspace_id") REFERENCES "public"."goals"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_lines_goal_idx" ON "transaction_lines" USING btree ("workspace_id","goal_id","date") WHERE "transaction_lines"."goal_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_period_goal_key" UNIQUE("period_id","goal_id");--> statement-breakpoint
ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_one_target" CHECK ((CASE WHEN "plan_lines"."category_id" IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN "plan_lines"."goal_id" IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN "plan_lines"."is_pool" THEN 1 ELSE 0 END) = 1);