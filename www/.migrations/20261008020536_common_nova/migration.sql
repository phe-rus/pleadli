CREATE TABLE `backup_key` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `storage_seal` (
	`storage_id` text NOT NULL,
	`computer_id` text NOT NULL,
	`sealed` text,
	`sealed_at` integer NOT NULL,
	`sealed_by` text,
	FOREIGN KEY (`storage_id`) REFERENCES `storage_target`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`computer_id`) REFERENCES `computer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sealed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_seal_pair` ON `storage_seal` (`storage_id`,`computer_id`);--> statement-breakpoint
ALTER TABLE `backup_report` ADD `storage_id` text;--> statement-breakpoint
ALTER TABLE `computer` ADD `seal_key` text;--> statement-breakpoint
ALTER TABLE `storage_target` ADD `settings` text NOT NULL DEFAULT '{}';