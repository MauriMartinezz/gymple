CREATE TABLE `exercises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`muscle_group` enum('chest','back','shoulders','biceps','triceps','legs','glutes','core','full_body','other') NOT NULL,
	`notes` text,
	`archived_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exercises_id` PRIMARY KEY(`id`),
	CONSTRAINT `exercises_user_name_uq` UNIQUE(`user_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `routine_exercises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routine_id` int NOT NULL,
	`exercise_id` int NOT NULL,
	`position` smallint NOT NULL,
	`target_sets` smallint NOT NULL,
	`target_reps_min` smallint NOT NULL,
	`target_reps_max` smallint NOT NULL,
	`rest_seconds` smallint NOT NULL,
	`notes` text,
	CONSTRAINT `routine_exercises_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`archived_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `routines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session_sets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`exercise_id` int NOT NULL,
	`set_number` smallint NOT NULL,
	`weight_kg` decimal(6,2) NOT NULL,
	`reps` smallint NOT NULL,
	`rpe` decimal(3,1),
	`rest_seconds` smallint,
	`completed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `session_sets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(120) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`routine_id` int,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` timestamp,
	`notes` text,
	CONSTRAINT `workout_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `exercises` ADD CONSTRAINT `exercises_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `routine_exercises` ADD CONSTRAINT `routine_exercises_routine_id_routines_id_fk` FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `routine_exercises` ADD CONSTRAINT `routine_exercises_exercise_id_exercises_id_fk` FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `routines` ADD CONSTRAINT `routines_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_sets` ADD CONSTRAINT `session_sets_session_id_workout_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_sets` ADD CONSTRAINT `session_sets_exercise_id_exercises_id_fk` FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_sessions` ADD CONSTRAINT `workout_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_sessions` ADD CONSTRAINT `workout_sessions_routine_id_routines_id_fk` FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `routine_exercises_routine_idx` ON `routine_exercises` (`routine_id`,`position`);--> statement-breakpoint
CREATE INDEX `routines_user_idx` ON `routines` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_sets_session_idx` ON `session_sets` (`session_id`,`set_number`);--> statement-breakpoint
CREATE INDEX `session_sets_exercise_idx` ON `session_sets` (`exercise_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `workout_sessions_user_started_idx` ON `workout_sessions` (`user_id`,`started_at`);