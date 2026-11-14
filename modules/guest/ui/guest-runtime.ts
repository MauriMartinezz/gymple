import { BrowserExerciseRepository } from "../infrastructure/browser-exercise-repository";
import { BrowserRoutineRepository } from "../infrastructure/browser-routine-repository";
import { BrowserSessionRepository } from "../infrastructure/browser-session-repository";
import { BrowserSessionUnitOfWork } from "../infrastructure/browser-session-unit-of-work";
import { LocalStorageGuestStorage } from "../storage/local-storage-guest-storage";
import type { GuestSessionDeps } from "./guest-session-forms";

/*
 * Composition root for guest mode: the one place that picks localStorage.
 * Nothing here touches the browser at import time, so prerendering is safe.
 */
export const guestStorage = new LocalStorageGuestStorage();
export const guestExerciseRepository = new BrowserExerciseRepository(guestStorage);
export const guestRoutineRepository = new BrowserRoutineRepository(guestStorage);
export const guestSessionRepository = new BrowserSessionRepository(guestStorage);

/** Everything the guest workout screens need. */
export const guestSessionDeps: GuestSessionDeps = {
  sessions: guestSessionRepository,
  routines: guestRoutineRepository,
  exercises: guestExerciseRepository,
  uow: new BrowserSessionUnitOfWork(guestStorage),
};
