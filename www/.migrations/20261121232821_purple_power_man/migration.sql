CREATE TABLE `record_access` (
	`id` text PRIMARY KEY,
	`at` integer NOT NULL,
	`credential_id` text,
	`caller_organization_id` text,
	`issuer_organization_id` text,
	`outcome` text NOT NULL,
	`audience` text,
	`reference_hash` text,
	`fields_returned` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `record_credential` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`secret_hash` text NOT NULL UNIQUE,
	`hint` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_used_at` integer,
	CONSTRAINT `fk_record_credential_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `record_grant` (
	`id` text PRIMARY KEY,
	`issuer_organization_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`level` text NOT NULL,
	`record_type` text,
	`projection_id` text,
	`verified_by` text,
	`verified_at` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	CONSTRAINT `fk_record_grant_issuer_organization_id_organization_id_fk` FOREIGN KEY (`issuer_organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_record_grant_credential_id_record_credential_id_fk` FOREIGN KEY (`credential_id`) REFERENCES `record_credential`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_record_grant_projection_id_record_projection_id_fk` FOREIGN KEY (`projection_id`) REFERENCES `record_projection`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `record_projection` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`jurisdiction` text NOT NULL,
	`record_type` text NOT NULL,
	`reference_kind` text NOT NULL,
	`reference` text NOT NULL,
	`display_reference` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`status_note` text,
	`superseded_by_reference` text,
	`fields` text DEFAULT '{}' NOT NULL,
	`field_policy` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source_updated_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`computer_id` text,
	CONSTRAINT `fk_record_projection_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_record_projection_computer_id_computer_id_fk` FOREIGN KEY (`computer_id`) REFERENCES `computer`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `record_access_issuer` ON `record_access` (`issuer_organization_id`,`at`);--> statement-breakpoint
CREATE INDEX `record_access_credential` ON `record_access` (`credential_id`,`at`);--> statement-breakpoint
CREATE INDEX `record_grant_credential` ON `record_grant` (`credential_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `record_projection_key` ON `record_projection` (`organization_id`,`jurisdiction`,`record_type`,`reference_kind`,`reference`);--> statement-breakpoint
CREATE INDEX `record_projection_lookup` ON `record_projection` (`jurisdiction`,`reference_kind`,`reference`);