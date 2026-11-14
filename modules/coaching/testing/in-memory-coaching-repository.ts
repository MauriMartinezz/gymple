import type { CoachingRepository, Person } from "../domain/coaching-repository";

interface LinkRow {
  seq: number;
  trainerId: number;
  studentId: number;
}

/**
 * Test double for CoachingRepository. Mirrors the MySQL adapter: one link per
 * pair, newest first, one code per trainer, exact code matching.
 * Both implementations run the same contract suite.
 */
export class InMemoryCoachingRepository implements CoachingRepository {
  private users = new Map<number, Person>();
  private links: LinkRow[] = [];
  private codes = new Map<number, string>();
  private nextUserId = 1;
  private nextSeq = 1;

  /** Seeds an account, as sign-up would create it. */
  addUser({ name, email }: { name: string; email: string }): number {
    const userId = this.nextUserId++;
    this.users.set(userId, { userId, name, email });
    return userId;
  }

  async findInviteCode(trainerId: number): Promise<string | null> {
    return this.codes.get(trainerId) ?? null;
  }

  async saveInviteCode(trainerId: number, code: string): Promise<void> {
    for (const [owner, existing] of this.codes) {
      if (owner !== trainerId && existing === code) throw new Error("Duplicate invite code.");
    }
    this.codes.set(trainerId, code);
  }

  async findTrainerByInviteCode(code: string): Promise<Person | null> {
    for (const [trainerId, existing] of this.codes) {
      if (existing === code) return this.person(trainerId);
    }
    return null;
  }

  async link(trainerId: number, studentId: number): Promise<boolean> {
    if (!this.users.has(trainerId) || !this.users.has(studentId)) throw new Error("Unknown user.");
    if (this.find(trainerId, studentId)) return false;
    this.links.push({ seq: this.nextSeq++, trainerId, studentId });
    return true;
  }

  async unlink(trainerId: number, studentId: number): Promise<boolean> {
    const row = this.find(trainerId, studentId);
    if (!row) return false;
    this.links = this.links.filter((l) => l !== row);
    return true;
  }

  async findStudent(trainerId: number, studentId: number): Promise<Person | null> {
    return this.find(trainerId, studentId) ? this.person(studentId) : null;
  }

  async listStudents(trainerId: number): Promise<Person[]> {
    return this.newestFirst()
      .filter((l) => l.trainerId === trainerId)
      .map((l) => this.person(l.studentId)!);
  }

  async listTrainers(studentId: number): Promise<Person[]> {
    return this.newestFirst()
      .filter((l) => l.studentId === studentId)
      .map((l) => this.person(l.trainerId)!);
  }

  private find(trainerId: number, studentId: number) {
    return this.links.find((l) => l.trainerId === trainerId && l.studentId === studentId);
  }

  private newestFirst() {
    return [...this.links].sort((a, b) => b.seq - a.seq);
  }

  private person(userId: number): Person | null {
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }
}
