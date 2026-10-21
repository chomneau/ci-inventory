CREATE TABLE `item_photos` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`image` blob NOT NULL,
	`thumbnail` blob NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
