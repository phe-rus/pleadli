CREATE TABLE `paper` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
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
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`computer_id`) REFERENCES `computer`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_code_unique` ON `paper` (`code`);--> statement-breakpoint
CREATE INDEX `paper_org` ON `paper` (`organization_id`,`issued_at`);--> statement-breakpoint
CREATE TABLE `tracking_code` (
	`code` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`computer_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`computer_id`) REFERENCES `computer`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `tracking_event` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`stage` text NOT NULL,
	`office` text,
	`at` integer NOT NULL,
	`next_at` integer,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `tracking_code`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracking_event_code` ON `tracking_event` (`code`,`at`);--> statement-breakpoint
ALTER TABLE `computer` ADD `token_hash` text;