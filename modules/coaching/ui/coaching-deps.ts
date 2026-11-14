import "server-only";
import { db } from "@/infrastructure/db/client";
import { exerciseRepository } from "@/modules/exercises/ui/exercise-service";
import { routineRepository } from "@/modules/routines/ui/routine-service";
import { sessionRepository } from "@/modules/sessions/ui/session-service";
import { DrizzleTrainerRepository } from "@/modules/trainers/infrastructure/drizzle-trainer-repository";
import type { FeedbackDeps } from "../application/feedback-use-cases";
import type { StudentWorkoutDeps } from "../application/student-workouts";
import { DrizzleCoachingRepository } from "../infrastructure/drizzle-coaching-repository";
import { DrizzleFeedbackRepository } from "../infrastructure/drizzle-feedback-repository";

/** Composition root: the one place that picks the MySQL adapters for coaching. */
export const coachingDeps: StudentWorkoutDeps & FeedbackDeps = {
  coaching: new DrizzleCoachingRepository(db),
  feedback: new DrizzleFeedbackRepository(db),
  trainers: new DrizzleTrainerRepository(db),
  sessions: sessionRepository,
  exercises: exerciseRepository,
  routines: routineRepository,
};
