import { relations } from "drizzle-orm";
import {
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/*
 * Model overview
 *
 *   exercises ◄── routine_exercises ──► routines      (the plan / template)
 *       ▲
 *       └────── session_sets ──► workout_sessions      (what actually happened)
 *
 * History belongs to the exercise, not to the routine: editing or deleting a
 * routine never touches session_sets. Exercises with history are archived,
 * never deleted (FK uses `restrict`).
 */

const createdAt = timestamp("created_at", { mode: "date" }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow();

export const users = mysqlTable(
  "users",
  {
    id: int().primaryKey().autoincrement(),
    email: varchar({ length: 255 }).notNull(),
    name: varchar({ length: 120 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)],
);

export const muscleGroups = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs",
  "glutes",
  "core",
  "full_body",
  "other",
] as const;

export const exercises = mysqlTable(
  "exercises",
  {
    id: int().primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull(),
    muscleGroup: mysqlEnum("muscle_group", muscleGroups).notNull(),
    notes: text(),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("exercises_user_name_uq").on(table.userId, table.name)],
);

export const routines = mysqlTable(
  "routines",
  {
    id: int().primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull(),
    description: text(),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [index("routines_user_idx").on(table.userId)],
);

/** One exercise slot inside a routine, with its targets. */
export const routineExercises = mysqlTable(
  "routine_exercises",
  {
    id: int().primaryKey().autoincrement(),
    routineId: int("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    exerciseId: int("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: smallint().notNull(),
    targetSets: smallint("target_sets").notNull(),
    targetRepsMin: smallint("target_reps_min").notNull(),
    targetRepsMax: smallint("target_reps_max").notNull(),
    restSeconds: smallint("rest_seconds").notNull(),
    notes: text(),
  },
  (table) => [index("routine_exercises_routine_idx").on(table.routineId, table.position)],
);

/** One execution of a workout. `routineId` is null for free sessions. */
export const workoutSessions = mysqlTable(
  "workout_sessions",
  {
    id: int().primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    routineId: int("routine_id").references(() => routines.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { mode: "date" }),
    notes: text(),
  },
  (table) => [index("workout_sessions_user_started_idx").on(table.userId, table.startedAt)],
);

/** A performed set: the source of every progression chart and 1RM estimate. */
export const sessionSets = mysqlTable(
  "session_sets",
  {
    id: int().primaryKey().autoincrement(),
    sessionId: int("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: int("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    setNumber: smallint("set_number").notNull(),
    // decimal is returned as a string by mysql2; the repository adapter maps it to number.
    weightKg: decimal("weight_kg", { precision: 6, scale: 2 }).notNull(),
    reps: smallint().notNull(),
    // Rate of perceived exertion, 1–10 in 0.5 steps.
    rpe: decimal({ precision: 3, scale: 1 }),
    restSeconds: smallint("rest_seconds"),
    completedAt: timestamp("completed_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("session_sets_session_idx").on(table.sessionId, table.setNumber),
    index("session_sets_exercise_idx").on(table.exerciseId, table.completedAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  exercises: many(exercises),
  routines: many(routines),
  sessions: many(workoutSessions),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  user: one(users, { fields: [exercises.userId], references: [users.id] }),
  routineSlots: many(routineExercises),
  sets: many(sessionSets),
}));

export const routinesRelations = relations(routines, ({ one, many }) => ({
  user: one(users, { fields: [routines.userId], references: [users.id] }),
  items: many(routineExercises),
  sessions: many(workoutSessions),
}));

export const routineExercisesRelations = relations(routineExercises, ({ one }) => ({
  routine: one(routines, { fields: [routineExercises.routineId], references: [routines.id] }),
  exercise: one(exercises, { fields: [routineExercises.exerciseId], references: [exercises.id] }),
}));

export const workoutSessionsRelations = relations(workoutSessions, ({ one, many }) => ({
  user: one(users, { fields: [workoutSessions.userId], references: [users.id] }),
  routine: one(routines, { fields: [workoutSessions.routineId], references: [routines.id] }),
  sets: many(sessionSets),
}));

export const sessionSetsRelations = relations(sessionSets, ({ one }) => ({
  session: one(workoutSessions, { fields: [sessionSets.sessionId], references: [workoutSessions.id] }),
  exercise: one(exercises, { fields: [sessionSets.exerciseId], references: [exercises.id] }),
}));
