CREATE TABLE `trainers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`dni` varchar(8) NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trainers_id` PRIMARY KEY(`id`),
	CONSTRAINT `trainers_user_uq` UNIQUE(`user_id`),
	CONSTRAINT `trainers_dni_uq` UNIQUE(`dni`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `is_admin` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `trainers` ADD CONSTRAINT `trainers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;