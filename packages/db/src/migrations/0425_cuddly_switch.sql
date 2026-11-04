CREATE TABLE "workspace_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"key" text NOT NULL,
	"project_id" uuid,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_instructions_scope_check" CHECK (("workspace_instructions"."project_id" is not null and "workspace_instructions"."key" = 'project:' || "workspace_instructions"."project_id"::text) or ("workspace_instructions"."project_id" is null and ("workspace_instructions"."key" = 'company' or "workspace_instructions"."key" like 'user:%'))),
	CONSTRAINT "workspace_instructions_length_check" CHECK (length("workspace_instructions"."text") <= 8000)
);
--> statement-breakpoint
ALTER TABLE "workspace_instructions" ADD CONSTRAINT "workspace_instructions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_instructions" ADD CONSTRAINT "workspace_instructions_company_id_project_id_projects_company_id_id_fk" FOREIGN KEY ("company_id","project_id") REFERENCES "public"."projects"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_instructions_scope_uq" ON "workspace_instructions" USING btree ("company_id","key");