import type { SuggestionInput } from "./feedback";

/** A trainer's current load suggestion for one of a student's exercises. */
export interface LoadSuggestion extends SuggestionInput {
  trainerId: number;
  trainerName: string;
  studentId: number;
  exerciseId: number;
  /** When it was last saved; the most recent one wins among several trainers. */
  suggestedAt: Date;
}

export interface WorkoutComment {
  id: number;
  sessionId: number;
  trainerId: number;
  trainerName: string;
  body: string;
  createdAt: Date;
}

/**
 * Persistence port for trainer feedback. It stores what it is given: callers
 * check the coaching link, the trainer status, and that the exercise or
 * workout belongs to the student (S7, S10, S12).
 */
export interface FeedbackRepository {
  /** One suggestion per (trainer, student, exercise): saving again replaces it. */
  saveSuggestion(suggestion: Omit<LoadSuggestion, "trainerName">): Promise<void>;
  /** Returns false when there was no such suggestion. */
  deleteSuggestion(trainerId: number, studentId: number, exerciseId: number): Promise<boolean>;
  /** Every trainer's suggestions for the student, most recent first (then newest row). */
  listSuggestionsForStudent(studentId: number): Promise<LoadSuggestion[]>;
  addComment(comment: { sessionId: number; trainerId: number; body: string; createdAt: Date }): Promise<WorkoutComment>;
  /** Only the trainer's own comment on that workout; false otherwise. */
  deleteComment(trainerId: number, sessionId: number, commentId: number): Promise<boolean>;
  /** Oldest first (creation time, then id). */
  listComments(sessionId: number): Promise<WorkoutComment[]>;
}
