CREATE TABLE `relay_link` (
	`id` text PRIMARY KEY,
	`from_address` text NOT NULL,
	`to_address` text NOT NULL,
	`status` text NOT NULL,
	`requested_by` text,
	`decided_by` text,
	`reason` text,
	`created_at` integer NOT NULL,
	`decided_at` integer
);
--> statement-breakpoint
CREATE TABLE `relay_message` (
	`id` text PRIMARY KEY,
	`from_address` text NOT NULL,
	`to_address` text NOT NULL,
	`kind` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`blob_key` text NOT NULL,
	`posted_at` integer NOT NULL,
	`delivered_at` integer,
	`acked_at` integer,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `relay_office` (
	`address` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`ed25519_pub` text,
	`x25519_pub` text,
	`certificate` text,
	`relay` text,
	`name` text,
	`area` text,
	`kind` text,
	`accepts` text,
	`listed` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_relay_office_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_institution_template` (
	`id` text PRIMARY KEY,
	`institution_type` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`description` text,
	`default_units` text NOT NULL,
	`default_entitlements` text NOT NULL,
	`form_schema` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_institution_template`(`id`, `institution_type`, `name`, `description`, `default_units`, `default_entitlements`, `form_schema`) SELECT `id`, `institution_type`, `name`, `description`, `default_units`, `default_entitlements`, `form_schema` FROM `institution_template`;--> statement-breakpoint
DROP TABLE `institution_template`;--> statement-breakpoint
ALTER TABLE `__new_institution_template` RENAME TO `institution_template`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_organization` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`slug` text NOT NULL UNIQUE,
	`logo` text,
	`institution_type` text NOT NULL,
	`kind` text DEFAULT 'institution' NOT NULL,
	`country` text DEFAULT 'UG' NOT NULL,
	`district` text,
	`contact_email` text,
	`contact_phone` text,
	`status` text DEFAULT 'active' NOT NULL,
	`address` text UNIQUE,
	`requested_at` integer,
	`reviewed_at` integer,
	`reviewed_by` text,
	`review_note` text
);
--> statement-breakpoint
INSERT INTO `__new_organization`(`id`, `name`, `slug`, `logo`, `institution_type`, `kind`, `country`, `district`, `contact_email`, `contact_phone`, `status`, `address`, `requested_at`, `reviewed_at`, `reviewed_by`, `review_note`) SELECT `id`, `name`, `slug`, `logo`, `institution_type`, `kind`, `country`, `district`, `contact_email`, `contact_phone`, `status`, `address`, `requested_at`, `reviewed_at`, `reviewed_by`, `review_note` FROM `organization`;--> statement-breakpoint
DROP TABLE `organization`;--> statement-breakpoint
ALTER TABLE `__new_organization` RENAME TO `organization`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_organization_unit` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`kind` text DEFAULT 'office' NOT NULL,
	`district` text,
	`address` text UNIQUE,
	CONSTRAINT `organization_unit_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_organization_unit`(`id`, `organization_id`, `parent_id`, `name`, `kind`, `district`, `address`) SELECT `id`, `organization_id`, `parent_id`, `name`, `kind`, `district`, `address` FROM `organization_unit`;--> statement-breakpoint
DROP TABLE `organization_unit`;--> statement-breakpoint
ALTER TABLE `__new_organization_unit` RENAME TO `organization_unit`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_session`(`id`, `expires_at`, `token`, `created_at`, `updated_at`, `ip_address`, `user_agent`, `user_id`, `impersonated_by`) SELECT `id`, `expires_at`, `token`, `created_at`, `updated_at`, `ip_address`, `user_agent`, `user_id`, `impersonated_by` FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
INSERT INTO `__new_user`(`id`, `name`, `email`, `email_verified`, `image`, `created_at`, `updated_at`, `role`, `banned`, `ban_reason`, `ban_expires`) SELECT `id`, `name`, `email`, `email_verified`, `image`, `created_at`, `updated_at`, `role`, `banned`, `ban_reason`, `ban_expires` FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_licence` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`application` text NOT NULL,
	`seats` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`key_hash` text NOT NULL UNIQUE,
	`key_hint` text NOT NULL,
	`issued_by` text,
	`note` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `licence_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_licence`(`id`, `organization_id`, `application`, `seats`, `starts_at`, `expires_at`, `status`, `key_hash`, `key_hint`, `issued_by`, `note`, `created_at`) SELECT `id`, `organization_id`, `application`, `seats`, `starts_at`, `expires_at`, `status`, `key_hash`, `key_hint`, `issued_by`, `note`, `created_at` FROM `licence`;--> statement-breakpoint
DROP TABLE `licence`;--> statement-breakpoint
ALTER TABLE `__new_licence` RENAME TO `licence`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_paper` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`reference` text NOT NULL,
	`kind` text NOT NULL,
	`application` text NOT NULL,
	`organization_id` text NOT NULL,
	`office` text NOT NULL,
	`computer_id` text,
	`content_sha256` text NOT NULL,
	`file_sha256` text,
	`issued_at` integer NOT NULL,
	`withdrawn_at` integer,
	`withdrawn_reason` text,
	`recorded_at` integer NOT NULL,
	CONSTRAINT `paper_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `paper_computer_id_computer_id_fk` FOREIGN KEY (`computer_id`) REFERENCES `computer`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO `__new_paper`(`id`, `code`, `reference`, `kind`, `application`, `organization_id`, `office`, `computer_id`, `content_sha256`, `file_sha256`, `issued_at`, `withdrawn_at`, `withdrawn_reason`, `recorded_at`) SELECT `id`, `code`, `reference`, `kind`, `application`, `organization_id`, `office`, `computer_id`, `content_sha256`, `file_sha256`, `issued_at`, `withdrawn_at`, `withdrawn_reason`, `recorded_at` FROM `paper`;--> statement-breakpoint
DROP TABLE `paper`;--> statement-breakpoint
ALTER TABLE `__new_paper` RENAME TO `paper`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `institution_template_institution_type_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `organization_slug_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `organization_address_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `organization_unit_address_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `session_token_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `user_email_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `licence_key_hash_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `paper_code_unique`;--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `licence_org` ON `licence` (`organization_id`);--> statement-breakpoint
CREATE INDEX `paper_org` ON `paper` (`organization_id`,`issued_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `relay_link_pair` ON `relay_link` (`from_address`,`to_address`);--> statement-breakpoint
CREATE INDEX `relay_message_to` ON `relay_message` (`to_address`,`posted_at`);--> statement-breakpoint
CREATE INDEX `relay_message_from` ON `relay_message` (`from_address`,`posted_at`);