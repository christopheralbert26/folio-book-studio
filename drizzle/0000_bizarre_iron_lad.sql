CREATE TABLE `editions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`manifest` text NOT NULL,
	`created` integer NOT NULL,
	`status` text DEFAULT 'prepared' NOT NULL,
	`validation` text
);
--> statement-breakpoint
CREATE INDEX `editions_owner` ON `editions` (`owner`,`project_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`owner` text NOT NULL,
	`hash` text NOT NULL,
	`size` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`owner`, `hash`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`edition_id` text NOT NULL,
	`payload` text NOT NULL,
	`state` text NOT NULL,
	`total` integer NOT NULL,
	`currency` text NOT NULL,
	`expires` integer NOT NULL,
	`payment_id` text,
	`job_id` text,
	`attempted` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_owner` ON `orders` (`owner`);--> statement-breakpoint
CREATE TABLE `projects` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`object_key` text NOT NULL,
	`version` integer NOT NULL,
	`updated` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
