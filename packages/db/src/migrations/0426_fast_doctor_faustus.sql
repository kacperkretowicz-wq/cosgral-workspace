CREATE TABLE "company_role_applications" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"applied_by_user_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_roles_definition_check" CHECK (length(btrim("company_roles"."name")) between 1 and 100 and length("company_roles"."description") <= 2000 and "company_roles"."version" > 0 and jsonb_typeof("company_roles"."permissions") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_roles_company_id_unique" ON "company_roles" USING btree ("company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_roles_company_name_unique" ON "company_roles" USING btree ("company_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "company_memberships_company_id_unique" ON "company_memberships" USING btree ("company_id","id");--> statement-breakpoint
ALTER TABLE "company_role_applications" ADD CONSTRAINT "company_role_applications_company_id_role_id_company_roles_company_id_id_fk" FOREIGN KEY ("company_id","role_id") REFERENCES "public"."company_roles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_role_applications" ADD CONSTRAINT "company_role_applications_company_id_member_id_company_memberships_company_id_id_fk" FOREIGN KEY ("company_id","member_id") REFERENCES "public"."company_memberships"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_roles" ADD CONSTRAINT "company_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;