CREATE TABLE `support` (
	`order_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`messages` text NOT NULL,
	`version` integer NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_owner` ON `support` (`owner`);