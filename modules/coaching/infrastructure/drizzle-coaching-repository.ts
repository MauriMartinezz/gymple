import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { coachingLinks, trainerInviteCodes, users } from "@/infrastructure/db/schema";
import type { CoachingRepository, Person } from "../domain/coaching-repository";

const personColumns = { userId: users.id, name: users.name, email: users.email };

export class DrizzleCoachingRepository implements CoachingRepository {
  constructor(private readonly db: Db) {}

  async findInviteCode(trainerId: number): Promise<string | null> {
    const [row] = await this.db
      .select({ code: trainerInviteCodes.code })
      .from(trainerInviteCodes)
      .where(eq(trainerInviteCodes.trainerUserId, trainerId));
    return row?.code ?? null;
  }

  async saveInviteCode(trainerId: number, code: string): Promise<void> {
    await this.db
      .insert(trainerInviteCodes)
      .values({ trainerUserId: trainerId, code })
      .onDuplicateKeyUpdate({ set: { code } });
  }

  async findTrainerByInviteCode(code: string): Promise<Person | null> {
    // varbinary: compared byte for byte, so case and trailing spaces matter.
    const [row] = await this.db
      .select(personColumns)
      .from(trainerInviteCodes)
      .innerJoin(users, eq(users.id, trainerInviteCodes.trainerUserId))
      .where(eq(trainerInviteCodes.code, code));
    return row ?? null;
  }

  async link(trainerId: number, studentId: number): Promise<boolean> {
    try {
      await this.db.insert(coachingLinks).values({ trainerUserId: trainerId, studentUserId: studentId });
      return true;
    } catch (error) {
      // Joining twice (or two requests at once) is a no-op.
      if (isDuplicate(error, "coaching_links_pair_uq")) return false;
      throw error;
    }
  }

  async unlink(trainerId: number, studentId: number): Promise<boolean> {
    const [result] = await this.db.delete(coachingLinks).where(pair(trainerId, studentId));
    return result.affectedRows > 0;
  }

  async findStudent(trainerId: number, studentId: number): Promise<Person | null> {
    const [row] = await this.db
      .select(personColumns)
      .from(coachingLinks)
      .innerJoin(users, eq(users.id, coachingLinks.studentUserId))
      .where(pair(trainerId, studentId));
    return row ?? null;
  }

  async listStudents(trainerId: number): Promise<Person[]> {
    return this.db
      .select(personColumns)
      .from(coachingLinks)
      .innerJoin(users, eq(users.id, coachingLinks.studentUserId))
      .where(eq(coachingLinks.trainerUserId, trainerId))
      .orderBy(desc(coachingLinks.id));
  }

  async listTrainers(studentId: number): Promise<Person[]> {
    return this.db
      .select(personColumns)
      .from(coachingLinks)
      .innerJoin(users, eq(users.id, coachingLinks.trainerUserId))
      .where(eq(coachingLinks.studentUserId, studentId))
      .orderBy(desc(coachingLinks.id));
  }
}

function pair(trainerId: number, studentId: number) {
  return and(eq(coachingLinks.trainerUserId, trainerId), eq(coachingLinks.studentUserId, studentId));
}

/** An ER_DUP_ENTRY on the given index, possibly wrapped by Drizzle in DrizzleQueryError.cause. */
function isDuplicate(error: unknown, index: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, sqlMessage } = current as { code?: string; sqlMessage?: string };
    if (code === "ER_DUP_ENTRY") return (sqlMessage ?? current.message).includes(index);
    current = current.cause;
  }
  return false;
}
