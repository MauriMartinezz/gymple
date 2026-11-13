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
 * active, the routine is unchanged and `errors.routine` says why.
 */
export async function finishWorkout(
  uow: SessionUnitOfWork,
  userId: number,
  sessionId: number,
  rawNotes: unknown,
  { updateRoutine: withRoutineUpdate }: { updateRoutine: boolean },
): Promise<FinishSessionResult> {
  try {
    return await uow.run(async ({ sessions, routines }) => {
      const finished = await finishSession(sessions, userId, sessionId, rawNotes);
      if (!finished.ok || !withRoutineUpdate) return finished;

      const proposal = await proposalFor(routines, userId, finished.session);
      if (!proposal) return finished;
      // Reuses the routines module's validation; a rejection undoes the finish above.
      const updated = await updateRoutine(routines, userId, proposal.routineId, proposal.input);
      if (!updated.ok) throw new RoutineUpdateRejected(updated.reason === "invalid" ? updated.errors : null);
      return finished;
    });
  } catch (error) {
    if (error instanceof RoutineUpdateRejected) {
      return { ok: false, reason: "invalid", errors: { routine: error.message } };
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

/** Thrown inside the unit of work so it rolls back; carries the message for the user. */
class RoutineUpdateRejected extends Error {
  constructor(errors: RoutineErrors | null) {
    super(`The routine could not be updated: ${errors ? firstMessage(errors) : "it no longer exists."}`);
    this.name = "RoutineUpdateRejected";
  }
}

function firstMessage(errors: RoutineErrors): string {
  const itemMessage = errors.itemErrors?.flatMap((item) => Object.values(item ?? {}))[0];
  return errors.items ?? itemMessage ?? errors.name ?? errors.description ?? "it is not valid.";
}
