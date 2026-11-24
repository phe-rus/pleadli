ALTER TABLE `paper` ADD `superseded_by_code` text;--> statement-breakpoint
ALTER TABLE `paper` ADD `public_fields` text DEFAULT '["reference","kind","office","issuedAt"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracking_code` ADD `unpublished_at` integer;