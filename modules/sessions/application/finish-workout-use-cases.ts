import type { RoutineErrors } from "@/modules/routines/domain/routine";
import type { RoutineRepository } from "@/modules/routines/domain/routine-repository";
import { updateRoutine } from "@/modules/routines/application/routine-use-cases";
import { proposeRoutineUpdate, type RoutineChange, type RoutineUpdateProposal } from "../domain/routine-changes";
import type { WorkoutSession } from "../domain/session";
import { finishSession, type FinishSessionResult } from "./session-use-cases";
import type { SessionRepositories, SessionUnitOfWork } from "./session-unit-of-work";

export interface RoutineUpdatePreview {
  routineId: number;
  /** Never empty: no changes is reported as null. */
  changes: RoutineChange[];
}

/**
 * What finishing the user's active session would add to its routine, for the
 * finish dialog. Null when there is nothing to add: a free session, an
 * archived or no longer owned routine, a missing or finished session, or a
 * session that stayed within the template.
 */
export async function previewRoutineUpdate(
  { sessions, routines }: SessionRepositories,
  userId: number,
  sessionId: number,
): Promise<RoutineUpdatePreview | null> {
  const session = await sessions.findById(userId, sessionId);
  if (!session || session.finishedAt !== null) return null;
  const proposal = await proposalFor(routines, userId, session);
  return proposal && { routineId: proposal.routineId, changes: proposal.changes };
}

/**
 * Finishes the session like `finishSession`. With `updateRoutine`, the
 * session's additions are also saved to its routine in the same unit of work
 * (when there are any): if the routine rejects them, the session stays
 * active, the routine is unchanged and `errors.routine` says why, naming the
 * exercise through `exerciseName` when the problem is one of its items.
 */
export async function finishWorkout(
  uow: SessionUnitOfWork,
  userId: number,
  sessionId: number,
  rawNotes: unknown,
  {
    updateRoutine: withRoutineUpdate,
    exerciseName,
  }: { updateRoutine: boolean; exerciseName?: (exerciseId: number) => Promise<string | null> },
): Promise<FinishSessionResult> {
  try {
    return await uow.run(async ({ sessions, routines }) => {
      const finished = await finishSession(sessions, userId, sessionId, rawNotes);
      if (!finished.ok || !withRoutineUpdate) return finished;

      const proposal = await proposalFor(routines, userId, finished.session);
      if (!proposal) return finished;
      // Reuses the routines module's validation; a rejection undoes the finish above.
      const updated = await updateRoutine(routines, userId, proposal.routineId, proposal.input);
      if (!updated.ok) {
        throw new RoutineUpdateRejected(updated.reason === "invalid" ? updated.errors : null, proposal.input.items);
      }
      return finished;
    });
  } catch (error) {
    if (error instanceof RoutineUpdateRejected) {
      // Looked up after the rollback, only when there is something to name.
      const name = error.exerciseId === null ? null : ((await exerciseName?.(error.exerciseId)) ?? null);
      const subject = name ? `The routine could not be updated (${name})` : "The routine could not be updated";
      return { ok: false, reason: "invalid", errors: { routine: `${subject}: ${error.message}` } };
    }
    throw error;
  }
}

/** The proposal for a session's routine, or null when it cannot or need not change. */
async function proposalFor(
  routines: RoutineRepository,
  userId: number,
  session: WorkoutSession,
): Promise<(RoutineUpdateProposal & { routineId: number }) | null> {
  if (session.routineId === null) return null;
  const routine = await routines.findById(userId, session.routineId);
  if (!routine || routine.archivedAt !== null) return null;
  const proposal = proposeRoutineUpdate(session.sets, routine);
  return proposal.changes.length > 0 ? { ...proposal, routineId: routine.id } : null;
}

/**
 * Thrown inside the unit of work so it rolls back. Carries the first problem
 * for the user and, when it belongs to one item, that item's exercise.
 */
class RoutineUpdateRejected extends Error {
  readonly exerciseId: number | null;

  constructor(errors: RoutineErrors | null, items: ReadonlyArray<{ exerciseId: number }>) {
    const itemIndex = errors?.itemErrors?.findIndex((item) => item && Object.keys(item).length > 0) ?? -1;
    const itemMessage = itemIndex >= 0 ? Object.values(errors!.itemErrors![itemIndex]!)[0] : undefined;
    const message = errors
      ? (errors.items ?? itemMessage ?? errors.name ?? errors.description ?? "it is not valid.")
      : "it no longer exists.";
    super(message);
    this.name = "RoutineUpdateRejected";
    // A list-level problem (such as too many exercises) names no exercise.
    this.exerciseId = !errors?.items && itemMessage !== undefined ? (items[itemIndex]?.exerciseId ?? null) : null;
  }
}
