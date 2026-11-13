import type { Db } from "@/infrastructure/db/client";
import { DrizzleRoutineRepository } from "@/modules/routines/infrastructure/drizzle-routine-repository";
import type { SessionRepositories, SessionUnitOfWork } from "../application/session-unit-of-work";
import { DrizzleSessionRepository } from "./drizzle-session-repository";

/**
 * Opens one MySQL transaction and builds both repositories on it. Their own
 * `transaction` calls run as savepoints inside it (Drizzle's mysql2 driver
 * nests transactions that way), so everything commits or rolls back together.
 */
export class DrizzleSessionUnitOfWork implements SessionUnitOfWork {
  constructor(private readonly db: Db) {}

  run<T>(work: (repos: SessionRepositories) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      work({ sessions: new DrizzleSessionRepository(tx), routines: new DrizzleRoutineRepository(tx) }),
    );
  }
}
