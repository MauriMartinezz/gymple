import type { InMemoryRoutineRepository } from "@/modules/routines/testing/in-memory-routine-repository";
import type { SessionRepositories, SessionUnitOfWork } from "../application/session-unit-of-work";
import type { InMemorySessionRepository } from "./in-memory-session-repository";

/**
 * Test double for SessionUnitOfWork: snapshots both in-memory repositories
 * before the work and restores them if it throws, like a rolled-back
 * transaction. The repositories keep all their state in plain own fields
 * (arrays, maps, counters), so a structured clone captures it.
 */
export class InMemoryUnitOfWork implements SessionUnitOfWork {
  constructor(
    private readonly sessions: InMemorySessionRepository,
    private readonly routines: InMemoryRoutineRepository,
  ) {}

  async run<T>(work: (repos: SessionRepositories) => Promise<T>): Promise<T> {
    const snapshots = [this.sessions, this.routines].map((repo) => [repo, structuredClone({ ...repo })] as const);
    try {
      return await work({ sessions: this.sessions, routines: this.routines });
    } catch (error) {
      for (const [repo, snapshot] of snapshots) Object.assign(repo, snapshot);
      throw error;
    }
  }
}
