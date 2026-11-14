import type { Trainer, TrainerAccount, TrainerInput } from "./trainer";

/**
 * Persistence port for the trainer capability and the account fields the
 * admin manages. Not scoped to a user: only admin use cases call the
 * mutating methods, and they run after `requireAdmin()`.
 *
 * Revoking keeps the trainer row (with its DNI): later features that link
 * trainers to students must check `isActiveTrainer` so the links stay
 * suspended, not deleted, while the trainer is revoked (S7).
 */
export interface TrainerRepository {
  /** Every trainer, active and revoked, most recently certified first. */
  list(): Promise<Trainer[]>;
  findByUserId(userId: number): Promise<Trainer | null>;
  /** Any account, trainer or not. Email is matched case-insensitively. */
  findAccountByEmail(email: string): Promise<TrainerAccount | null>;
  /**
   * Creates a verified account (the admin vouches for it) with the trainer
   * capability, atomically. The account has no password yet.
   * @throws EmailTakenError, DniTakenError
   */
  createAccountWithTrainer(input: TrainerInput): Promise<Trainer>;
  /**
   * Adds the trainer capability to an existing account.
   * Returns null when the account does not exist.
   * @throws AlreadyTrainerError, DniTakenError
   */
  certify(userId: number, dni: string): Promise<Trainer | null>;
  /** Revokes or restores the capability. Returns false when the account is not a trainer. */
  setRevoked(userId: number, revoked: boolean): Promise<boolean>;
  /**
   * Edits a trainer's name, email and DNI. A new email is stored unverified.
   * Returns null when the account is not a trainer.
   * @throws EmailTakenError, DniTakenError
   */
  update(userId: number, input: TrainerInput): Promise<Trainer | null>;
  /** The trainer capability check: true only for a trainer that is not revoked. */
  isActiveTrainer(userId: number): Promise<boolean>;
}

export class EmailTakenError extends Error {
  constructor(readonly email: string) {
    super(`An account already uses ${email}.`);
    this.name = "EmailTakenError";
  }
}

/** DNIs are unique among trainers, revoked ones included (they keep theirs to be restored). */
export class DniTakenError extends Error {
  constructor(readonly dni: string) {
    super(`A trainer with DNI ${dni} already exists.`);
    this.name = "DniTakenError";
  }
}

export class AlreadyTrainerError extends Error {
  constructor(readonly userId: number) {
    super(`Account ${userId} is already a trainer.`);
    this.name = "AlreadyTrainerError";
  }
}
