CREATE TABLE `backup_report` (
	`id` text PRIMARY KEY NOT NULL,
	`computer_id` text NOT NULL,
	`organization_id` text,
	`at` integer NOT NULL,
	`size_bytes` integer,
	`ok` integer NOT NULL,
	`message` text,
	FOREIGN KEY (`computer_id`) REFERENCES `computer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backup_report_org` ON `backup_report` (`organization_id`,`at`);--> statement-breakpoint
CREATE TABLE `computer` (
	`id` text PRIMARY KEY NOT NULL,
	`device_hash` text NOT NULL,
	`application` text NOT NULL,
	`organization_id` text,
	`unit_id` text,
	`licence_id` text,
	`version` text,
	`os` text,
	`country` text,
	`trial_started_at` integer NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`unit_id`) REFERENCES `organization_unit`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`licence_id`) REFERENCES `licence`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `computer_device_app` ON `computer` (`device_hash`,`application`);--> statement-breakpoint
CREATE INDEX `computer_org` ON `computer` (`organization_id`);--> statement-breakpoint
CREATE TABLE `licence` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`application` text NOT NULL,
	`seats` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_hint` text NOT NULL,
	`issued_by` text,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `licence_key_hash_unique` ON `licence` (`key_hash`);--> statement-breakpoint
CREATE INDEX `licence_org` ON `licence` (`organization_id`);--> statement-breakpoint
CREATE TABLE `licence_request` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`application` text NOT NULL,
	`seats` integer NOT NULL,
	`message` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`handled_at` integer,
	`handled_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `orchestra_member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`invited_at` integer NOT NULL,
	`joined_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orchestra_member_org_email` ON `orchestra_member` (`organization_id`,`email`);--> statement-breakpoint
CREATE TABLE `storage_target` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`sealed_config` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `support_report` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`application` text,
	`version` text,
	`computer_id` text,
	`organization_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`reply` text,
	`created_at` integer NOT NULL,
	`replied_at` integer,
	`replied_by` text,
	FOREIGN KEY (`computer_id`) REFERENCES `computer`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `support_report_status` ON `support_report` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `organization` ADD `kind` text DEFAULT 'institution' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `country` text DEFAULT 'UG' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `district` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `contact_email` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `contact_phone` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `address` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `requested_at` integer;--> statement-breakpoint
ALTER TABLE `organization` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `organization` ADD `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `review_note` text;--> statement-breakpoint
CREATE UNIQUE INDEX `organization_address_unique` ON `organization` (`address`);--> statement-breakpoint
ALTER TABLE `organization_unit` ADD `kind` text DEFAULT 'office' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization_unit` ADD `district` text;--> statement-breakpoint
ALTER TABLE `organization_unit` ADD `address` text;--> statement-breakpoint
CREATE UNIQUE INDEX `organization_unit_address_unique` ON `organization_unit` (`address`);