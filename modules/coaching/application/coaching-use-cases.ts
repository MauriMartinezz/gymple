import type { TrainerRepository } from "@/modules/trainers/domain/trainer-repository";
import type { CoachingRepository, Person } from "../domain/coaching-repository";
import { newInviteCode, parseInviteCode } from "../domain/invite-code";

/*
 * Trainer–student links (S3, S4, S11). Whether someone acts as a trainer is
 * decided only by `isActiveTrainer` (S7): a revoked trainer keeps their links,
 * suspended, and gets them back when certified again.
 */

export interface CoachingDeps {
  coaching: CoachingRepository;
  trainers: Pick<TrainerRepository, "isActiveTrainer">;
  /** Defaults to a cryptographically secure code. */
  newCode?: () => string;
}

export interface TrainerRef {
  userId: number;
  name: string;
}

export type JoinPreview =
  | { status: "can_join"; trainer: TrainerRef }
  | { status: "already_student"; trainer: TrainerRef }
  | { status: "not_accepting"; trainer: TrainerRef }
  | { status: "own_link" }
  /** Malformed, never issued, or replaced by a newer code. */
  | { status: "unknown" };

export type JoinResult =
  | { ok: true; joined: boolean; trainer: TrainerRef }
  | { ok: false; reason: "unknown" | "own_link" | "not_accepting" };

export type TrainerStatusForStudent = "active" | "inactive";

export interface MyTrainer extends TrainerRef {
  status: TrainerStatusForStudent;
}

/**
 * The access check for a trainer acting on a student's data: the link exists
 * AND the trainer capability is active. Later features (load suggestions,
 * comments) must use this, never the link or the capability alone.
 */
export async function isActiveTrainerOf(deps: CoachingDeps, trainerId: number, studentId: number): Promise<boolean> {
  return (await findCoachedStudent(deps, trainerId, studentId)) !== null;
}

/** The student when `trainerId` is their active trainer, else null. */
export async function findCoachedStudent(
  deps: CoachingDeps,
  trainerId: number,
  studentId: number,
): Promise<Person | null> {
  if (trainerId === studentId) return null;
  const [student, active] = await Promise.all([
    deps.coaching.findStudent(trainerId, studentId),
    deps.trainers.isActiveTrainer(trainerId),
  ]);
  return student && active ? student : null;
}

/** The active trainer's invite code, created on first use. Null for anyone else. */
export async function getInviteCode(deps: CoachingDeps, trainerId: number): Promise<string | null> {
  if (!(await deps.trainers.isActiveTrainer(trainerId))) return null;
  const existing = await deps.coaching.findInviteCode(trainerId);
  if (existing) return existing;
  return saveNewCode(deps, trainerId);
}

/** Issues a new code; the old link stops working. Null when not an active trainer. */
export async function regenerateInviteCode(deps: CoachingDeps, trainerId: number): Promise<string | null> {
  if (!(await deps.trainers.isActiveTrainer(trainerId))) return null;
  return saveNewCode(deps, trainerId);
}

/** What the join page shows `userId` for this code. */
export async function previewJoin(deps: CoachingDeps, userId: number, rawCode: unknown): Promise<JoinPreview> {
  const code = parseInviteCode(rawCode);
  const owner = code ? await deps.coaching.findTrainerByInviteCode(code) : null;
  if (!owner) return { status: "unknown" };
  if (owner.userId === userId) return { status: "own_link" };

  const trainer = { userId: owner.userId, name: owner.name };
  if (!(await deps.trainers.isActiveTrainer(owner.userId))) return { status: "not_accepting", trainer };
  if (await deps.coaching.findStudent(owner.userId, userId)) return { status: "already_student", trainer };
  return { status: "can_join", trainer };
}

/** Makes `userId` a student of the code's trainer. Joining twice is a no-op. */
export async function joinTrainer(deps: CoachingDeps, userId: number, rawCode: unknown): Promise<JoinResult> {
  const preview = await previewJoin(deps, userId, rawCode);
  switch (preview.status) {
    case "unknown":
    case "own_link":
    case "not_accepting":
      return { ok: false, reason: preview.status };
    case "already_student":
      return { ok: true, joined: false, trainer: preview.trainer };
    case "can_join":
      return { ok: true, joined: await deps.coaching.link(preview.trainer.userId, userId), trainer: preview.trainer };
  }
}

/** The student ends the link; allowed whatever the trainer's status. */
export function leaveTrainer(deps: CoachingDeps, studentId: number, trainerId: number): Promise<boolean> {
  return deps.coaching.unlink(trainerId, studentId);
}

/** An active trainer ends the link. A revoked trainer cannot: the link stays suspended (S7). */
export async function removeStudent(deps: CoachingDeps, trainerId: number, studentId: number): Promise<boolean> {
  if (!(await deps.trainers.isActiveTrainer(trainerId))) return false;
  return deps.coaching.unlink(trainerId, studentId);
}

/** The active trainer's students, newest first; null for anyone else. */
export async function listStudentsOf(deps: CoachingDeps, trainerId: number): Promise<Person[] | null> {
  if (!(await deps.trainers.isActiveTrainer(trainerId))) return null;
  return deps.coaching.listStudents(trainerId);
}

/** The user's trainers, newest first, each active or inactive (revoked). */
export async function listTrainersOf(deps: CoachingDeps, studentId: number): Promise<MyTrainer[]> {
  const trainers = await deps.coaching.listTrainers(studentId);
  return Promise.all(
    trainers.map(async (t) => ({
      userId: t.userId,
      name: t.name,
      status: (await deps.trainers.isActiveTrainer(t.userId)) ? ("active" as const) : ("inactive" as const),
    })),
  );
}

async function saveNewCode(deps: CoachingDeps, trainerId: number): Promise<string> {
  const code = (deps.newCode ?? newInviteCode)();
  await deps.coaching.saveInviteCode(trainerId, code);
  return code;
}
