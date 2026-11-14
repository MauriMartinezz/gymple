import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import { MUSCLE_GROUPS } from "../../modules/exercises/domain/exercise";

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

/*
 * Auth tables. Shape and property names follow Better Auth's core schema
 * (configured with numeric serial ids); do not rename properties.
 */

export const users = mysqlTable(
  "users",
  {
    id: int().primaryKey().autoincrement(),
    email: varchar({ length: 255 }).notNull(),
    name: varchar({ length: 120 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text(),
    // Ours, not Better Auth's: it never reads or writes it. Granted only by
    // `pnpm admin:grant <email>`.
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)],
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: int().primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar({ length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("sessions_token_uq").on(table.token),
    index("sessions_user_idx").on(table.userId),
  ],
);

/** Login methods per user. Email/password lives here with providerId "credential". */
export const accounts = mysqlTable(
  "accounts",
  {
    id: int().primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 64 }).notNull(),
    password: text(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: "date" }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: "date" }),
    scope: text(),
    createdAt,
    updatedAt,
  },
  (table) => [index("accounts_user_idx").on(table.userId)],
);

export const verifications = mysqlTable(
  "verifications",
  {
    id: int().primaryKey().autoincrement(),
    identifier: varchar({ length: 255 }).notNull(),
    value: text().notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

/** Better Auth rate-limit counters, one row per IP + path. */
export const rateLimits = mysqlTable(
  "rate_limits",
  {
    id: int().primaryKey().autoincrement(),
    key: varchar({ length: 255 }).notNull(),
    count: int().notNull(),
    // Epoch milliseconds, as Better Auth stores it.
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("rate_limits_key_uq").on(table.key)],
);

/*
 * The trainer capability (S7, S8): a user with a row here is a trainer while
 * `revoked_at` is null. Revoking keeps the row and its DNI so the admin can
 * restore it, and so links to students can stay suspended instead of deleted.
 * The id gives a stable "most recently certified first" order.
 */
export const trainers = mysqlTable(
  "trainers",
  {
    id: int().primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 7 or 8 digits, normalized by the domain. Unique among trainers, revoked ones included.
    dni: varchar({ length: 8 }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("trainers_user_uq").on(table.userId),
    uniqueIndex("trainers_dni_uq").on(table.dni),
  ],
);

export const exercises = mysqlTable(
  "exercises",
  {
    id: int().primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull(),
    muscleGroup: mysqlEnum("muscle_group", MUSCLE_GROUPS).notNull(),
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
  sessions: many(sessions),
  accounts: many(accounts),
  exercises: many(exercises),
  routines: many(routines),
  workoutSessions: many(workoutSessions),
}));

export const trainersRelations = relations(trainers, ({ one }) => ({
  user: one(users, { fields: [trainers.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
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
