import { sameEmail, type Trainer, type TrainerAccount, type TrainerInput } from "../domain/trainer";
import {
  AlreadyTrainerError,
  DniTakenError,
  EmailTakenError,
  type TrainerRepository,
} from "../domain/trainer-repository";

interface TrainerRow {
  /** Insertion order: the MySQL adapter sorts by the auto-increment id. */
  seq: number;
  dni: string;
  certifiedAt: Date;
  revokedAt: Date | null;
}

/**
 * Test double for TrainerRepository, holding accounts and trainer rows.
 * Mirrors the MySQL adapter, including case-insensitive email uniqueness.
 * Both implementations run the same contract suite.
 */
export class InMemoryTrainerRepository implements TrainerRepository {
  private accounts: TrainerAccount[] = [];
  private trainers = new Map<number, TrainerRow>();
  private nextUserId = 1;
  private nextSeq = 1;

  /** Seeds a plain account, as sign-up would create it. */
  addAccount({ name, email, emailVerified = false }: { name: string; email: string; emailVerified?: boolean }): number {
    this.assertEmailFree(email);
    const userId = this.nextUserId++;
    this.accounts.push({ userId, name, email, emailVerified });
    return userId;
  }

  async list(): Promise<Trainer[]> {
    return [...this.trainers.entries()]
      .sort(([, a], [, b]) => b.seq - a.seq)
      .map(([userId]) => this.toTrainer(userId)!);
  }

  async findByUserId(userId: number): Promise<Trainer | null> {
    return this.toTrainer(userId);
  }

  async findAccountByEmail(email: string): Promise<TrainerAccount | null> {
    const account = this.accounts.find((a) => sameEmail(a.email, email));
    return account ? { ...account } : null;
  }

  async createAccountWithTrainer(input: TrainerInput): Promise<Trainer> {
    this.assertEmailFree(input.email);
    this.assertDniFree(input.dni);
    const userId = this.addAccount({ name: input.name, email: input.email, emailVerified: true });
    this.addTrainer(userId, input.dni);
    return this.toTrainer(userId)!;
  }

  async certify(userId: number, dni: string): Promise<Trainer | null> {
    if (!this.account(userId)) return null;
    if (this.trainers.has(userId)) throw new AlreadyTrainerError(userId);
    this.assertDniFree(dni);
    this.addTrainer(userId, dni);
    return this.toTrainer(userId);
  }

  async setRevoked(userId: number, revoked: boolean): Promise<boolean> {
    const row = this.trainers.get(userId);
    if (!row) return false;
    row.revokedAt = revoked ? (row.revokedAt ?? new Date()) : null;
    return true;
  }

  async update(userId: number, input: TrainerInput): Promise<Trainer | null> {
    const row = this.trainers.get(userId);
    const account = this.account(userId);
    if (!row || !account) return null;
    this.assertEmailFree(input.email, userId);
    this.assertDniFree(input.dni, userId);

    if (!sameEmail(account.email, input.email)) account.emailVerified = false;
    account.name = input.name;
    account.email = input.email;
    row.dni = input.dni;
    return this.toTrainer(userId);
  }

  async isActiveTrainer(userId: number): Promise<boolean> {
    const row = this.trainers.get(userId);
    return Boolean(row && row.revokedAt === null);
  }

  private addTrainer(userId: number, dni: string) {
    this.trainers.set(userId, { seq: this.nextSeq++, dni, certifiedAt: new Date(), revokedAt: null });
  }

  private account(userId: number) {
    return this.accounts.find((a) => a.userId === userId);
  }

  private toTrainer(userId: number): Trainer | null {
    const row = this.trainers.get(userId);
    const account = this.account(userId);
    if (!row || !account) return null;
    return {
      ...account,
      dni: row.dni,
      status: row.revokedAt ? "revoked" : "active",
      certifiedAt: row.certifiedAt,
      revokedAt: row.revokedAt,
    };
  }

  private assertEmailFree(email: string, exceptUserId?: number) {
    if (this.accounts.some((a) => a.userId !== exceptUserId && sameEmail(a.email, email))) {
      throw new EmailTakenError(email);
    }
  }

  private assertDniFree(dni: string, exceptUserId?: number) {
    for (const [userId, row] of this.trainers) {
      if (userId !== exceptUserId && row.dni === dni) throw new DniTakenError(dni);
    }
  }
}
