-- `pg_trgm` backs the substring search on transactions.search_text: a GIN trigram index is
-- what lets `%migros%` run on every keystroke. Bundled with the official Postgres images.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"system_key" text,
	"name_overridden" boolean DEFAULT false NOT NULL,
	"is_essential" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_id_workspace_key" UNIQUE("id","workspace_id"),
	CONSTRAINT "categories_workspace_system_key" UNIQUE("workspace_id","system_key"),
	CONSTRAINT "categories_name_not_blank" CHECK (length(btrim("categories"."name")) > 0),
	CONSTRAINT "categories_parent_not_self" CHECK ("categories"."parent_id" IS NULL OR "categories"."parent_id" <> "categories"."id")
);
--> statement-breakpoint
CREATE TABLE "category_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"system_key" text,
	"name_overridden" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_groups_id_workspace_key" UNIQUE("id","workspace_id"),
	CONSTRAINT "category_groups_workspace_system_key" UNIQUE("workspace_id","system_key"),
	CONSTRAINT "category_groups_kind_known" CHECK ("category_groups"."kind" IN ('income', 'essential', 'flexible', 'debt', 'savings', 'investment')),
	CONSTRAINT "category_groups_name_not_blank" CHECK (length(btrim("category_groups"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_fk" FOREIGN KEY ("group_id","workspace_id") REFERENCES "public"."category_groups"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_fk" FOREIGN KEY ("parent_id","workspace_id") REFERENCES "public"."categories"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_workspace_idx" ON "categories" USING btree ("workspace_id","group_id","sort_order");--> statement-breakpoint
CREATE INDEX "category_groups_workspace_idx" ON "category_groups" USING btree ("workspace_id","sort_order","name");--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_category_fk" FOREIGN KEY ("category_id","workspace_id") REFERENCES "public"."categories"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_lines_category_date_idx" ON "transaction_lines" USING btree ("workspace_id","category_id","date");--> statement-breakpoint
CREATE INDEX "transactions_search_idx" ON "transactions" USING gin ("search_text" gin_trgm_ops) WHERE "transactions"."deleted_at" IS NULL;