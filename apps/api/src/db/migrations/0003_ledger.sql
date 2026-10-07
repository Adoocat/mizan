CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"currency" char(3) NOT NULL,
	"on_budget" boolean DEFAULT true NOT NULL,
	"include_in_net_worth" boolean DEFAULT true NOT NULL,
	"institution" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_id_workspace_currency_key" UNIQUE("id","workspace_id","currency"),
	CONSTRAINT "accounts_type_known" CHECK ("accounts"."type" IN ('checking', 'savings', 'cash', 'credit_card')),
	CONSTRAINT "accounts_name_not_blank" CHECK (length(btrim("accounts"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "transaction_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"base_amount" numeric(20, 4) NOT NULL,
	"fx_rate" numeric(20, 10),
	"date" date NOT NULL,
	"memo" text,
	CONSTRAINT "transaction_lines_amount_not_zero" CHECK ("transaction_lines"."amount" <> 0),
	CONSTRAINT "transaction_lines_base_amount_not_zero" CHECK ("transaction_lines"."base_amount" <> 0),
	CONSTRAINT "transaction_lines_fx_rate_positive" CHECK ("transaction_lines"."fx_rate" IS NULL OR "transaction_lines"."fx_rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"date" date NOT NULL,
	"payee" text,
	"notes" text,
	"status" text DEFAULT 'cleared' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_type_known" CHECK ("transactions"."type" IN ('expense', 'income', 'transfer', 'adjustment', 'opening_balance')),
	CONSTRAINT "transactions_status_known" CHECK ("transactions"."status" IN ('cleared', 'pending')),
	CONSTRAINT "transactions_source_known" CHECK ("transactions"."source" IN ('manual', 'recurring', 'import'))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_account_fk" FOREIGN KEY ("account_id","workspace_id","currency") REFERENCES "public"."accounts"("id","workspace_id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_workspace_idx" ON "accounts" USING btree ("workspace_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "transaction_lines_account_date_idx" ON "transaction_lines" USING btree ("workspace_id","account_id","date");--> statement-breakpoint
CREATE INDEX "transaction_lines_transaction_idx" ON "transaction_lines" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transactions_workspace_date_idx" ON "transactions" USING btree ("workspace_id","date" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "transactions"."deleted_at" IS NULL;