CREATE TABLE "project_conversations" (
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_conversations_project_uq" UNIQUE("company_id","project_id"),
	CONSTRAINT "project_conversations_issue_uq" UNIQUE("company_id","issue_id")
);
--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_company_project_id_uq" UNIQUE("company_id","project_id","id");--> statement-breakpoint
ALTER TABLE "project_conversations" ADD CONSTRAINT "project_conversations_project_fk" FOREIGN KEY ("company_id","project_id") REFERENCES "public"."projects"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_conversations" ADD CONSTRAINT "project_conversations_issue_fk" FOREIGN KEY ("company_id","project_id","issue_id") REFERENCES "public"."issues"("company_id","project_id","id") ON DELETE restrict ON UPDATE no action;
