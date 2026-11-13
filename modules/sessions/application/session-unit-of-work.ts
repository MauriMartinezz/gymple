import type { RoutineRepository } from "@/modules/routines/domain/routine-repository";
import type { SessionRepository } from "../domain/session-repository";

/** The repositories a unit of work hands out, all bound to the same transaction. */
export interface SessionRepositories {
  sessions: SessionRepository;
  routines: RoutineRepository;
}

/**
 * Runs work that must commit or fail as a whole. Every write made through the
 * given repositories is kept only if `work` resolves; if it throws, none is.
 */
export interface SessionUnitOfWork {
  run<T>(work: (repos: SessionRepositories) => Promise<T>): Promise<T>;
}
