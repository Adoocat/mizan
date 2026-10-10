-- Cover (PLAN §10, decision D4): money reassigned from one plan line to another. The move
-- records where the money came from, so covering an overspend never creates any — the covered
-- line's budget rises and the source line's falls by the same amount.
CREATE TABLE "plan_moves" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"from_line_id" uuid NOT NULL,
	"to_line_id" uuid NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_moves_amount_positive" CHECK ("plan_moves"."amount" > 0),
	CONSTRAINT "plan_moves_two_lines" CHECK ("plan_moves"."from_line_id" <> "plan_moves"."to_line_id")
);
--> statement-breakpoint
ALTER TABLE "plan_moves" ADD CONSTRAINT "plan_moves_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_moves" ADD CONSTRAINT "plan_moves_period_fk" FOREIGN KEY ("period_id","workspace_id") REFERENCES "public"."plan_periods"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Added before the foreign keys below, which reference it: a composite FK needs a unique
-- key on the columns it points at.
ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_id_workspace_key" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "plan_moves" ADD CONSTRAINT "plan_moves_from_fk" FOREIGN KEY ("from_line_id","workspace_id") REFERENCES "public"."plan_lines"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_moves" ADD CONSTRAINT "plan_moves_to_fk" FOREIGN KEY ("to_line_id","workspace_id") REFERENCES "public"."plan_lines"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_moves_period_idx" ON "plan_moves" USING btree ("workspace_id","period_id","created_at");
