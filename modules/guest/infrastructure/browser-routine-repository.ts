import type { Routine, RoutineInput } from "@/modules/routines/domain/routine";
import { UnknownExerciseError, type RoutineRepository } from "@/modules/routines/domain/routine-repository";
import { readSnapshotOrThrow, type GuestSnapshot, type GuestStorage, type StoredRoutine } from "../storage/guest-storage";

/**
 * RoutineRepository for guests, persisted in the guest snapshot next to the
 * exercises it references. Mirrors the Postgres adapter (user-scoped access,
 * items only reference the user's own exercises, archived included) and runs
 * the same contract suite.
 *
 * @throws GuestStorageError when the storage cannot be read or written.
 */
export class BrowserRoutineRepository implements RoutineRepository {
  constructor(private readonly storage: GuestStorage) {}

  async list(userId: number, { archived }: { archived: boolean }): Promise<Routine[]> {
    return readSnapshotOrThrow(this.storage)
      .routines.filter((row) => row.userId === userId && (row.archivedAt !== null) === archived)
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
      .map(toRoutine);
  }

  async findById(userId: number, id: number): Promise<Routine | null> {
    const row = find(readSnapshotOrThrow(this.storage).routines, userId, id);
    return row ? toRoutine(row) : null;
  }

  async create(userId: number, input: RoutineInput): Promise<Routine> {
    const snapshot = readSnapshotOrThrow(this.storage);
    assertOwnsExercises(snapshot, userId, input);
    const row: StoredRoutine = { id: snapshot.nextIds.routine++, userId, ...copyInput(input), archivedAt: null };
    snapshot.routines.push(row);
    this.storage.write(snapshot);
    return toRoutine(row);
  }

  async update(userId: number, id: number, input: RoutineInput): Promise<Routine | null> {
    const snapshot = readSnapshotOrThrow(this.storage);
    const row = find(snapshot.routines, userId, id);
    if (!row) return null;
    assertOwnsExercises(snapshot, userId, input);
    Object.assign(row, copyInput(input));
    this.storage.write(snapshot);
    return toRoutine(row);
  }

  async setArchived(userId: number, id: number, archived: boolean): Promise<boolean> {
    const snapshot = readSnapshotOrThrow(this.storage);
    const row = find(snapshot.routines, userId, id);
    if (!row) return false;
    row.archivedAt = archived ? (row.archivedAt ?? new Date()) : null;
    this.storage.write(snapshot);
    return true;
  }
}

function find(rows: StoredRoutine[], userId: number, id: number) {
  return rows.find((row) => row.userId === userId && row.id === id);
}

function assertOwnsExercises(snapshot: GuestSnapshot, userId: number, input: RoutineInput) {
  const owned = new Set(snapshot.exercises.filter((e) => e.userId === userId).map((e) => e.id));
  const unknown = input.items.flatMap((item, index) => (owned.has(item.exerciseId) ? [] : [index]));
  if (unknown.length > 0) throw new UnknownExerciseError(unknown);
}

function copyInput(input: RoutineInput): RoutineInput {
  return { name: input.name, description: input.description, items: input.items.map((item) => ({ ...item })) };
}

function toRoutine(row: StoredRoutine): Routine {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    items: row.items.map((item) => ({ ...item })),
    archivedAt: row.archivedAt,
  };
}
