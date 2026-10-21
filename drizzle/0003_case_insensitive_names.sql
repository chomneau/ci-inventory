DROP INDEX `categories_name_en_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_en_ci` ON `categories` (lower("name_en"));--> statement-breakpoint
DROP INDEX `locations_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `locations_name_ci` ON `locations` (lower("name"));