import "server-only";
import { cache } from "react";
import { getCurrentUser, requireUser } from "@/modules/auth/infrastructure/session";
import {
  FREE_WORKOUT,
  formatDate,
  formatDuration,
  groupSets,
  toHistoryEntry,
} from "@/modules/sessions/ui/session-view";
import {
  getInviteCode,
  listStudentsOf,
  listTrainersOf,
  previewJoin,
} from "../application/coaching-use-cases";
import { getStudentHistory, getStudentWorkout } from "../application/student-workouts";
import { coachingDeps } from "./coaching-deps";

/*
 * Reads for pages. Each one resolves the signed-in user itself; a trainer
 * read returns null (the page shows not-found) unless that user is the
 * student's active trainer.
 */

/** The signed-in user's trainers, active or inactive. */
export async function loadMyTrainers() {
  const user = await requireUser();
  return listTrainersOf(coachingDeps, user.id);
}

/** The trainer's invite link and students; null for anyone who is not an active trainer. */
export async function loadTrainerDashboard() {
  const user = await requireUser();
  const students = await listStudentsOf(coachingDeps, user.id);
  if (!students) return null;
  const code = await getInviteCode(coachingDeps, user.id);
  if (!code) return null;
  return { invitePath: `/join/${code}`, students };
}

/** For the navigation: whether the signed-in user is an active trainer. Cached per request. */
export const isCurrentUserActiveTrainer = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  return user ? coachingDeps.trainers.isActiveTrainer(user.id) : false;
});

export async function loadJoinPreview(code: string) {
  const user = await requireUser();
  return previewJoin(coachingDeps, user.id, code);
}

/** A student's finished workouts, for their active trainer only. */
export async function loadStudentHistory(studentId: number) {
  const user = await requireUser();
  const history = await getStudentHistory(coachingDeps, user.id, studentId);
  if (!history) return null;
  return {
    student: { userId: history.student.userId, name: history.student.name },
    entries: history.sessions.map((session) => toHistoryEntry(session, history.routineNames)),
  };
}

/** One finished workout of a student, read-only, for their active trainer only. */
export async function loadStudentWorkout(studentId: number, sessionId: number) {
  const user = await requireUser();
  const workout = await getStudentWorkout(coachingDeps, user.id, studentId, sessionId);
  if (!workout) return null;
  const { session } = workout;
  return {
    id: session.id,
    student: { userId: workout.student.userId, name: workout.student.name },
    title: workout.routineName ?? FREE_WORKOUT,
    date: formatDate(session.startedAt),
    // findById returns finished sessions only here (checked by getStudentWorkout).
    duration: session.finishedAt ? formatDuration(session.startedAt, session.finishedAt) : "",
    notes: session.notes,
    setCount: session.sets.length,
    groups: groupSets(session.sets, workout.exercises),
  };
}
