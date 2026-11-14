import type { Exercise, ExerciseInput } from "@/modules/exercises/domain/exercise";
import { DuplicateExerciseNameError, type ExerciseRepository } from "@/modules/exercises/domain/exercise-repository";
import { readSnapshotOrThrow, type GuestStorage, type StoredExercise } from "../storage/guest-storage";

/**
 * ExerciseRepository for guests, persisted in the guest snapshot. Mirrors the
 * MySQL adapter (case-insensitive unique names, user-scoped access) and runs
 * the same contract suite. Each call reads, changes and writes the snapshot
 * synchronously, so calls never interleave inside one tab.
 *
 * @throws GuestStorageError when the storage cannot be read or written.
 */
export class BrowserExerciseRepository implements ExerciseRepository {
  constructor(private readonly storage: GuestStorage) {}

  async list(userId: number, { archived }: { archived: boolean }): Promise<Exercise[]> {
    return readSnapshotOrThrow(this.storage)
      .exercises.filter((row) => row.userId === userId && (row.archivedAt !== null) === archived)
      .sort((a, b) => compareNames(a.name, b.name))
      .map(toExercise);
  }

  async findById(userId: number, id: number): Promise<Exercise | null> {
    const row = find(readSnapshotOrThrow(this.storage).exercises, userId, id);
    return row ? toExercise(row) : null;
  }

  async create(userId: number, input: ExerciseInput): Promise<Exercise> {
    const snapshot = readSnapshotOrThrow(this.storage);
    assertUniqueName(snapshot.exercises, userId, input.name);
    const row: StoredExercise = { id: snapshot.nextIds.exercise++, userId, ...input, archivedAt: null };
    snapshot.exercises.push(row);
    this.storage.write(snapshot);
    return toExercise(row);
  }

  async update(userId: number, id: number, input: ExerciseInput): Promise<Exercise | null> {
    const snapshot = readSnapshotOrThrow(this.storage);
    const row = find(snapshot.exercises, userId, id);
    if (!row) return null;
    assertUniqueName(snapshot.exercises, userId, input.name, id);
    Object.assign(row, { name: input.name, muscleGroup: input.muscleGroup, notes: input.notes });
    this.storage.write(snapshot);
    return toExercise(row);
  }

  async setArchived(userId: number, id: number, archived: boolean): Promise<boolean> {
    const snapshot = readSnapshotOrThrow(this.storage);
    const row = find(snapshot.exercises, userId, id);
    if (!row) return false;
    row.archivedAt = archived ? (row.archivedAt ?? new Date()) : null;
    this.storage.write(snapshot);
    return true;
  }
}

function find(rows: StoredExercise[], userId: number, id: number) {
  return rows.find((row) => row.userId === userId && row.id === id);
}

function assertUniqueName(rows: StoredExercise[], userId: number, name: string, exceptId?: number) {
  const taken = rows.some(
    (row) => row.userId === userId && row.id !== exceptId && compareNames(row.name, name) === 0,
  );
  if (taken) throw new DuplicateExerciseNameError(name);
}

function compareNames(a: string, b: string) {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

function toExercise(row: StoredExercise): Exercise {
  return { id: row.id, name: row.name, muscleGroup: row.muscleGroup, notes: row.notes, archivedAt: row.archivedAt };
}
