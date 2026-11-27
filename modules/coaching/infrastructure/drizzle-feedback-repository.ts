import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { loadSuggestions, users, workoutComments } from "@/infrastructure/db/schema";
import type { FeedbackRepository, LoadSuggestion, WorkoutComment } from "../domain/feedback-repository";

const suggestionColumns = {
  trainerId: loadSuggestions.trainerUserId,
  trainerName: users.name,
  studentId: loadSuggestions.studentUserId,
  exerciseId: loadSuggestions.exerciseId,
  weightKg: loadSuggestions.weightKg,
  reps: loadSuggestions.reps,
  sets: loadSuggestions.sets,
  note: loadSuggestions.note,
  suggestedAt: loadSuggestions.suggestedAt,
};

const commentColumns = {
  id: workoutComments.id,
  sessionId: workoutComments.sessionId,
  trainerId: workoutComments.trainerUserId,
  trainerName: users.name,
  body: workoutComments.body,
  createdAt: workoutComments.createdAt,
};

export class DrizzleFeedbackRepository implements FeedbackRepository {
  constructor(private readonly db: Db) {}

  async saveSuggestion(s: Omit<LoadSuggestion, "trainerName">): Promise<void> {
    const values = {
      weightKg: s.weightKg.toFixed(2),
      reps: s.reps,
      sets: s.sets,
      note: s.note,
      suggestedAt: s.suggestedAt,
    };
    // The unique (trainer, student, exercise) key makes saving again a replace, even when concurrent.
    await this.db
      .insert(loadSuggestions)
      .values({ trainerUserId: s.trainerId, studentUserId: s.studentId, exerciseId: s.exerciseId, ...values })
      .onConflictDoUpdate({
        target: [loadSuggestions.trainerUserId, loadSuggestions.studentUserId, loadSuggestions.exerciseId],
        set: values,
      });
  }

  async deleteSuggestion(trainerId: number, studentId: number, exerciseId: number): Promise<boolean> {
    const result = await this.db
      .delete(loadSuggestions)
      .where(
        and(
          eq(loadSuggestions.trainerUserId, trainerId),
          eq(loadSuggestions.studentUserId, studentId),
          eq(loadSuggestions.exerciseId, exerciseId),
        ),
      );
    return (result.rowCount ?? 0) > 0;
  }

  async listSuggestionsForStudent(studentId: number): Promise<LoadSuggestion[]> {
    const rows = await this.db
      .select(suggestionColumns)
      .from(loadSuggestions)
      .innerJoin(users, eq(users.id, loadSuggestions.trainerUserId))
      .where(eq(loadSuggestions.studentUserId, studentId))
      .orderBy(desc(loadSuggestions.suggestedAt), desc(loadSuggestions.id));
    // numeric comes back as a string from node-postgres.
    return rows.map((row) => ({ ...row, weightKg: Number(row.weightKg) }));
  }

  async addComment(comment: { sessionId: number; trainerId: number; body: string; createdAt: Date }): Promise<WorkoutComment> {
    const [{ id }] = await this.db
      .insert(workoutComments)
      .values({ sessionId: comment.sessionId, trainerUserId: comment.trainerId, body: comment.body, createdAt: comment.createdAt })
      .returning({ id: workoutComments.id });
    const [row] = await this.commentQuery().where(eq(workoutComments.id, id));
    return row;
  }

  async deleteComment(trainerId: number, sessionId: number, commentId: number): Promise<boolean> {
    const result = await this.db
      .delete(workoutComments)
      .where(
        and(
          eq(workoutComments.id, commentId),
          eq(workoutComments.trainerUserId, trainerId),
          eq(workoutComments.sessionId, sessionId),
        ),
      );
    return (result.rowCount ?? 0) > 0;
  }

  async listComments(sessionId: number): Promise<WorkoutComment[]> {
    return this.commentQuery()
      .where(eq(workoutComments.sessionId, sessionId))
      .orderBy(asc(workoutComments.createdAt), asc(workoutComments.id));
  }

  private commentQuery() {
    return this.db
      .select(commentColumns)
      .from(workoutComments)
      .innerJoin(users, eq(users.id, workoutComments.trainerUserId))
      .$dynamic();
  }
}
