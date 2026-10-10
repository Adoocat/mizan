-- The monthly plan (PLAN §6, §10): periods with their own stored bounds, the income expected
-- in each, and the allocations that give every lira a job. `plan_lines.goal_id` joins the
-- target choice in phase 8, and `plan_moves` / `carry_overs` arrive with phases 7 and 10.
CREATE TABLE "plan_income_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"label" text,
	"expected_amount" numeric(20, 4) NOT NULL,
	"expected_date" date,
	"received_amount" numeric(20, 4),
	"received_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_income_items_expected_not_negative" CHECK ("plan_income_items"."expected_amount" >= 0),
	CONSTRAINT "plan_income_items_received_not_negative" CHECK ("plan_income_items"."received_amount" IS NULL OR "plan_income_items"."received_amount" >= 0),
	CONSTRAINT "plan_income_items_received_complete" CHECK (("plan_income_items"."received_amount" IS NULL) = ("plan_income_items"."received_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "plan_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"category_id" uuid,
	"is_pool" boolean DEFAULT false NOT NULL,
	"planned_amount" numeric(20, 4) NOT NULL,
	"carry_in" numeric(20, 4) DEFAULT '0' NOT NULL,
	"rollover" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_lines_period_category_key" UNIQUE("period_id","category_id"),
	CONSTRAINT "plan_lines_one_target" CHECK (("plan_lines"."category_id" IS NOT NULL) <> "plan_lines"."is_pool"),
	CONSTRAINT "plan_lines_planned_not_negative" CHECK ("plan_lines"."planned_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plan_periods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_periods_id_workspace_key" UNIQUE("id","workspace_id"),
	CONSTRAINT "plan_periods_workspace_start_key" UNIQUE("workspace_id","start_date"),
	CONSTRAINT "plan_periods_range_ordered" CHECK ("plan_periods"."end_date" > "plan_periods"."start_date"),
	CONSTRAINT "plan_periods_status_known" CHECK ("plan_periods"."status" IN ('open', 'closed')),
	CONSTRAINT "plan_periods_closed_at_matches_status" CHECK (("plan_periods"."status" = 'closed') = ("plan_periods"."closed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "plan_income_items" ADD CONSTRAINT "plan_income_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_income_items" ADD CONSTRAINT "plan_income_items_period_fk" FOREIGN KEY ("period_id","workspace_id") REFERENCES "public"."plan_periods"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_income_items" ADD CONSTRAINT "plan_income_items_category_fk" FOREIGN KEY ("category_id","workspace_id") REFERENCES "public"."categories"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_period_fk" FOREIGN KEY ("period_id","workspace_id") REFERENCES "public"."plan_periods"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_category_fk" FOREIGN KEY ("category_id","workspace_id") REFERENCES "public"."categories"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_periods" ADD CONSTRAINT "plan_periods_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_income_items_period_idx" ON "plan_income_items" USING btree ("workspace_id","period_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_lines_period_pool_key" ON "plan_lines" USING btree ("period_id") WHERE "plan_lines"."is_pool";--> statement-breakpoint
CREATE INDEX "plan_lines_period_idx" ON "plan_lines" USING btree ("workspace_id","period_id","sort_order");--> statement-breakpoint
CREATE INDEX "plan_periods_workspace_idx" ON "plan_periods" USING btree ("workspace_id","start_date");