CREATE TABLE `staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`department` text,
	`pin_hash` text,
	`pin_set_at` integer,
	`pin_set_by` integer,
	`pin_failed_count` integer DEFAULT 0 NOT NULL,
	`pin_locked_until` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`pin_set_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_code_unique` ON `staff` (`code`);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `staff_id` integer REFERENCES staff(id);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `confirmation` text;--> statement-breakpoint
CREATE INDEX `stock_movements_staff_idx` ON `stock_movements` (`staff_id`);