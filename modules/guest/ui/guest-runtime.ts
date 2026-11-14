import { BrowserExerciseRepository } from "../infrastructure/browser-exercise-repository";
import { BrowserRoutineRepository } from "../infrastructure/browser-routine-repository";
import { LocalStorageGuestStorage } from "../storage/local-storage-guest-storage";

/*
 * Composition root for guest mode: the one place that picks localStorage.
 * Nothing here touches the browser at import time, so prerendering is safe.
 */
export const guestStorage = new LocalStorageGuestStorage();
export const guestExerciseRepository = new BrowserExerciseRepository(guestStorage);
export const guestRoutineRepository = new BrowserRoutineRepository(guestStorage);
