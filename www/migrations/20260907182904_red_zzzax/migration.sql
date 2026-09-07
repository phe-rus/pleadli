CREATE TABLE `institution_template` (
	`id` text PRIMARY KEY,
	`institution_type` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`description` text,
	`default_units` text NOT NULL,
	`default_entitlements` text NOT NULL,
	`form_schema` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `organization` ADD `logo` text;--> statement-breakpoint
ALTER TABLE `organization` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `entitlement` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `membership` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `organization_unit` DROP COLUMN `created_at`;