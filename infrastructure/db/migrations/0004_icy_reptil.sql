CREATE TABLE `coaching_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trainer_user_id` int NOT NULL,
	`student_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coaching_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `coaching_links_pair_uq` UNIQUE(`trainer_user_id`,`student_user_id`)
);
--> statement-breakpoint
CREATE TABLE `trainer_invite_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trainer_user_id` int NOT NULL,
	`code` varbinary(32) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trainer_invite_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `trainer_invite_codes_trainer_uq` UNIQUE(`trainer_user_id`),
	CONSTRAINT `trainer_invite_codes_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `coaching_links` ADD CONSTRAINT `coaching_links_trainer_user_id_users_id_fk` FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_links` ADD CONSTRAINT `coaching_links_student_user_id_users_id_fk` FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trainer_invite_codes` ADD CONSTRAINT `trainer_invite_codes_trainer_user_id_users_id_fk` FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `coaching_links_student_idx` ON `coaching_links` (`student_user_id`);