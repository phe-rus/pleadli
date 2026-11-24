CREATE TABLE `record_admin_event` (
	`id` text PRIMARY KEY,
	`at` integer NOT NULL,
	`organization_id` text NOT NULL,
	`actor` text NOT NULL,
	`actor_name` text,
	`action` text NOT NULL,
	`subject` text,
	`detail` text
);
--> statement-breakpoint
CREATE TABLE `record_officer` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`permissions` text DEFAULT '[]' NOT NULL,
	`computer_id` text,
	`secret_hash` text NOT NULL UNIQUE,
	`hint` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_used_at` integer,
	CONSTRAINT `fk_record_officer_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_record_officer_computer_id_computer_id_fk` FOREIGN KEY (`computer_id`) REFERENCES `computer`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `record_policy` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`jurisdiction` text NOT NULL,
	`record_type` text NOT NULL,
	`reference_kind` text NOT NULL,
	`allowed` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`basis` text,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_record_policy_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `record_admin_event_org` ON `record_admin_event` (`organization_id`,`at`);--> statement-breakpoint
CREATE INDEX `record_officer_org` ON `record_officer` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `record_policy_key` ON `record_policy` (`organization_id`,`jurisdiction`,`record_type`,`reference_kind`);