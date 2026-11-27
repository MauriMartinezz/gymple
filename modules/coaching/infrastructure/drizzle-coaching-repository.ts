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
      .onConflictDoUpdate({ target: trainerInviteCodes.trainerUserId, set: { code } });
  }

  async findTrainerByInviteCode(code: string): Promise<Person | null> {
    // Default (deterministic) collation: compared byte for byte, so case and trailing spaces matter.
    const [row] = await this.db
      .select(personColumns)
      .from(trainerInviteCodes)
      .innerJoin(users, eq(users.id, trainerInviteCodes.trainerUserId))
      .where(eq(trainerInviteCodes.code, code));
    return row ?? null;
  }

  async link(trainerId: number, studentId: number): Promise<boolean> {
    // Joining twice (or two requests at once) is a no-op.
    const inserted = await this.db
      .insert(coachingLinks)
      .values({ trainerUserId: trainerId, studentUserId: studentId })
      .onConflictDoNothing({ target: [coachingLinks.trainerUserId, coachingLinks.studentUserId] })
      .returning({ id: coachingLinks.id });
    return inserted.length > 0;
  }

  async unlink(trainerId: number, studentId: number): Promise<boolean> {
    const result = await this.db.delete(coachingLinks).where(pair(trainerId, studentId));
    return (result.rowCount ?? 0) > 0;
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
