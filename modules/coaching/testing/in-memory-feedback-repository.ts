import type { FeedbackRepository, LoadSuggestion, WorkoutComment } from "../domain/feedback-repository";

interface SuggestionRow extends Omit<LoadSuggestion, "trainerName"> {
  seq: number;
}

type CommentRow = Omit<WorkoutComment, "trainerName">;

/**
 * Test double for FeedbackRepository. Mirrors the Postgres adapter: one
 * suggestion per (trainer, student, exercise), the same orderings, names
 * resolved from the accounts. Both implementations run the same contract.
 * Deleting a workout's comments with the workout is the database's foreign
 * key; here it is covered by readers that only ask for existing workouts.
 */
export class InMemoryFeedbackRepository implements FeedbackRepository {
  private suggestions: SuggestionRow[] = [];
  private comments: CommentRow[] = [];
  private nextSeq = 1;
  private nextCommentId = 1;

  constructor(private readonly people: { nameOf(userId: number): string | null }) {}

  async saveSuggestion(suggestion: Omit<LoadSuggestion, "trainerName">): Promise<void> {
    const existing = this.findSuggestion(suggestion.trainerId, suggestion.studentId, suggestion.exerciseId);
    if (existing) {
      Object.assign(existing, { ...suggestion, suggestedAt: new Date(suggestion.suggestedAt) });
      return;
    }
    this.suggestions.push({ ...suggestion, suggestedAt: new Date(suggestion.suggestedAt), seq: this.nextSeq++ });
  }

  async deleteSuggestion(trainerId: number, studentId: number, exerciseId: number): Promise<boolean> {
    const row = this.findSuggestion(trainerId, studentId, exerciseId);
    if (!row) return false;
    this.suggestions = this.suggestions.filter((s) => s !== row);
    return true;
  }

  async listSuggestionsForStudent(studentId: number): Promise<LoadSuggestion[]> {
    return this.suggestions
      .filter((s) => s.studentId === studentId)
      .sort((a, b) => b.suggestedAt.getTime() - a.suggestedAt.getTime() || b.seq - a.seq)
      .map((row) => ({
        trainerId: row.trainerId,
        trainerName: this.people.nameOf(row.trainerId) ?? "",
        studentId: row.studentId,
        exerciseId: row.exerciseId,
        weightKg: row.weightKg,
        reps: row.reps,
        sets: row.sets,
        note: row.note,
        suggestedAt: new Date(row.suggestedAt),
      }));
  }

  async addComment(comment: { sessionId: number; trainerId: number; body: string; createdAt: Date }): Promise<WorkoutComment> {
    const row: CommentRow = { ...comment, id: this.nextCommentId++, createdAt: new Date(comment.createdAt) };
    this.comments.push(row);
    return this.toComment(row);
  }

  async deleteComment(trainerId: number, sessionId: number, commentId: number): Promise<boolean> {
    const row = this.comments.find((c) => c.id === commentId && c.trainerId === trainerId && c.sessionId === sessionId);
    if (!row) return false;
    this.comments = this.comments.filter((c) => c !== row);
    return true;
  }

  async listComments(sessionId: number): Promise<WorkoutComment[]> {
    return this.comments
      .filter((c) => c.sessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
      .map((c) => this.toComment(c));
  }

  private findSuggestion(trainerId: number, studentId: number, exerciseId: number) {
    return this.suggestions.find(
      (s) => s.trainerId === trainerId && s.studentId === studentId && s.exerciseId === exerciseId,
    );
  }

  private toComment(row: CommentRow): WorkoutComment {
    return { ...row, createdAt: new Date(row.createdAt), trainerName: this.people.nameOf(row.trainerId) ?? "" };
  }
}
