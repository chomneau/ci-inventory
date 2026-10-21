CREATE TABLE `login_throttle` (
	`email` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`locked_until` integer,
	`updated_at` integer NOT NULL
);
