import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { trainers, users } from "@/infrastructure/db/schema";
import { uniqueViolationConstraint } from "@/infrastructure/db/unique-violation";
import { sameEmail, type Trainer, type TrainerAccount, type TrainerInput } from "../domain/trainer";
import {
  AlreadyTrainerError,
  DniTakenError,
  EmailTakenError,
  type TrainerRepository,
} from "../domain/trainer-repository";

const accountColumns = {
  userId: users.id,
  name: users.name,
  email: users.email,
  emailVerified: users.emailVerified,
};

const trainerColumns = {
  ...accountColumns,
  dni: trainers.dni,
  certifiedAt: trainers.createdAt,
  revokedAt: trainers.revokedAt,
};

type TrainerRow = Omit<Trainer, "status">;

export class DrizzleTrainerRepository implements TrainerRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<Trainer[]> {
    const rows = await this.selectTrainers().orderBy(desc(trainers.id));
    return rows.map(toTrainer);
  }

  async findByUserId(userId: number): Promise<Trainer | null> {
    const [row] = await this.selectTrainers().where(eq(trainers.userId, userId));
    return row ? toTrainer(row) : null;
  }

  async findAccountByEmail(email: string): Promise<TrainerAccount | null> {
    // The users table collation is case-insensitive.
    const [row] = await this.db.select(accountColumns).from(users).where(eq(users.email, email));
    return row ?? null;
  }

  async createAccountWithTrainer(input: TrainerInput): Promise<Trainer> {
    const userId = await rethrowDuplicates(input, () =>
      this.db.transaction(async (tx) => {
        const [{ id }] = await tx
          .insert(users)
          .values({ name: input.name, email: input.email, emailVerified: true })
          .returning({ id: users.id });
        await tx.insert(trainers).values({ userId: id, dni: input.dni });
        return id;
      }),
    );
    return this.mustFind(userId);
  }

  async certify(userId: number, dni: string): Promise<Trainer | null> {
    const [account] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!account) return null;
    await rethrowDuplicates({ dni, userId }, () => this.db.insert(trainers).values({ userId, dni }));
    return this.mustFind(userId);
  }

  async setRevoked(userId: number, revoked: boolean): Promise<boolean> {
    const result = await this.db
      .update(trainers)
      // Revoking twice keeps the original date.
      .set({ revokedAt: revoked ? sql`COALESCE(${trainers.revokedAt}, NOW())` : null })
      .where(eq(trainers.userId, userId));
    return (result.rowCount ?? 0) > 0;
  }

  async update(userId: number, input: TrainerInput): Promise<Trainer | null> {
    const current = await this.findByUserId(userId);
    if (!current) return null;

    const emailChanged = !sameEmail(current.email, input.email);
    await rethrowDuplicates(input, () =>
      this.db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ name: input.name, email: input.email, ...(emailChanged ? { emailVerified: false } : {}) })
          .where(eq(users.id, userId));
        await tx.update(trainers).set({ dni: input.dni }).where(eq(trainers.userId, userId));
      }),
    );
    return this.findByUserId(userId);
  }

  async isActiveTrainer(userId: number): Promise<boolean> {
    const [row] = await this.db
      .select({ revokedAt: trainers.revokedAt })
      .from(trainers)
      .where(eq(trainers.userId, userId));
    return Boolean(row) && row.revokedAt === null;
  }

  private selectTrainers() {
    return this.db.select(trainerColumns).from(trainers).innerJoin(users, eq(users.id, trainers.userId)).$dynamic();
  }

  private async mustFind(userId: number): Promise<Trainer> {
    const trainer = await this.findByUserId(userId);
    if (!trainer) throw new Error(`Trainer ${userId} vanished right after insert.`);
    return trainer;
  }
}

function toTrainer(row: TrainerRow): Trainer {
  return { ...row, status: row.revokedAt ? "revoked" : "active" };
}

/** Maps unique-key violations to domain errors, by index name. */
async function rethrowDuplicates<T>(
  context: { email?: string; dni: string; userId?: number },
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const key = uniqueViolationConstraint(error);
    if (key === "trainers_dni_uq") throw new DniTakenError(context.dni);
    if (key === "users_email_uq" && context.email) throw new EmailTakenError(context.email);
    if (key === "trainers_user_uq" && context.userId) throw new AlreadyTrainerError(context.userId);
    throw error;
  }
}
