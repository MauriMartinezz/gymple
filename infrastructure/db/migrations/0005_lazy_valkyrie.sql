CREATE TABLE `load_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trainer_user_id` int NOT NULL,
	`student_user_id` int NOT NULL,
	`exercise_id` int NOT NULL,
	`weight_kg` decimal(6,2) NOT NULL,
	`reps` smallint NOT NULL,
	`sets` smallint,
	`note` text,
	`suggested_at` timestamp(3) NOT NULL,
	CONSTRAINT `load_suggestions_id` PRIMARY KEY(`id`),
	CONSTRAINT `load_suggestions_trainer_student_exercise_uq` UNIQUE(`trainer_user_id`,`student_user_id`,`exercise_id`)
);
--> statement-breakpoint
CREATE TABLE `workout_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`trainer_user_id` int NOT NULL,
	`body` text NOT NULL,
	`created_at` timestamp(3) NOT NULL,
	CONSTRAINT `workout_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `load_suggestions` ADD CONSTRAINT `load_suggestions_trainer_user_id_users_id_fk` FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `load_suggestions` ADD CONSTRAINT `load_suggestions_student_user_id_users_id_fk` FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `load_suggestions` ADD CONSTRAINT `load_suggestions_exercise_id_exercises_id_fk` FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_comments` ADD CONSTRAINT `workout_comments_session_id_workout_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_comments` ADD CONSTRAINT `workout_comments_trainer_user_id_users_id_fk` FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `load_suggestions_student_idx` ON `load_suggestions` (`student_user_id`,`suggested_at`);--> statement-breakpoint
CREATE INDEX `workout_comments_session_idx` ON `workout_comments` (`session_id`,`created_at`);