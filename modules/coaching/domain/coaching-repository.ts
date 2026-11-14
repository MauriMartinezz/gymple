/** An account as the other side of a coaching link sees it. */
export interface Person {
  userId: number;
  name: string;
  email: string;
}

/**
 * Persistence port for trainer–student links (many-to-many, S4) and trainers'
 * invite codes. A link has a direction: trainer → student. It knows nothing
 * about the trainer capability: callers check `isActiveTrainer` (S7), so the
 * links of a revoked trainer stay stored but suspended.
 */
export interface CoachingRepository {
  findInviteCode(trainerId: number): Promise<string | null>;
  /** Sets or replaces the trainer's code; the previous code stops resolving. */
  saveInviteCode(trainerId: number, code: string): Promise<void>;
  /** The account that owns exactly this code, trainer or not. */
  findTrainerByInviteCode(code: string): Promise<Person | null>;
  /** Returns false when the link already existed (nothing changes). */
  link(trainerId: number, studentId: number): Promise<boolean>;
  /** Returns false when there was no such link. */
  unlink(trainerId: number, studentId: number): Promise<boolean>;
  /** The student, only when linked to this trainer. */
  findStudent(trainerId: number, studentId: number): Promise<Person | null>;
  /** Newest link first. */
  listStudents(trainerId: number): Promise<Person[]>;
  /** Newest link first. */
  listTrainers(studentId: number): Promise<Person[]>;
}
