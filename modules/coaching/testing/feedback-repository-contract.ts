import { beforeEach, describe, expect, it } from "vitest";
import type { FeedbackRepository } from "../domain/feedback-repository";

export interface FeedbackContractFixture {
  repo: FeedbackRepository;
  /** Creates a plain account and returns its id. */
  addUser(user: { name: string; email: string }): Promise<number>;
  /** Creates an exercise owned by the user and returns its id. */
  addExercise(userId: number, name: string): Promise<number>;
  /** Creates a finished workout of the user and returns its id. */
  addWorkout(userId: number): Promise<number>;
}

const T1 = new Date("2026-11-10T10:00:00.000Z");
const T2 = new Date("2026-11-11T10:00:00.000Z");
const T3 = new Date("2026-11-12T10:00:00.000Z");

/** Behavior every FeedbackRepository implementation must have. */
export function describeFeedbackRepositoryContract(name: string, setup: () => Promise<FeedbackContractFixture>) {
  describe(`FeedbackRepository contract: ${name}`, () => {
    let fixture: FeedbackContractFixture;
    let repo: FeedbackRepository;
    let ana: number;
    let bruno: number;
    let carla: number;
    let dani: number;
    let squat: number; // Bruno's
    let bench: number; // Bruno's
    let carlaSquat: number;

    beforeEach(async () => {
      fixture = await setup();
      repo = fixture.repo;
      ana = await fixture.addUser({ name: "Ana", email: "ana@example.com" });
      bruno = await fixture.addUser({ name: "Bruno", email: "bruno@example.com" });
      carla = await fixture.addUser({ name: "Carla", email: "carla@example.com" });
      dani = await fixture.addUser({ name: "Dani", email: "dani@example.com" });
      squat = await fixture.addExercise(bruno, "Squat");
      bench = await fixture.addExercise(bruno, "Bench press");
      carlaSquat = await fixture.addExercise(carla, "Squat");
    });

    const suggestion = (overrides: Partial<Parameters<FeedbackRepository["saveSuggestion"]>[0]> = {}) => ({
      trainerId: ana,
      studentId: bruno,
      exerciseId: squat,
      weightKg: 85,
      reps: 6,
      sets: null,
      note: null,
      suggestedAt: T1,
      ...overrides,
    });

    describe("suggestions", () => {
      it("has none until one is saved", async () => {
        expect(await repo.listSuggestionsForStudent(bruno)).toEqual([]);
      });

      it("saves a suggestion with the trainer's name", async () => {
        await repo.saveSuggestion(suggestion({ weightKg: 82.5, sets: 4, note: "Pause at the bottom" }));

        expect(await repo.listSuggestionsForStudent(bruno)).toEqual([
          {
            trainerId: ana,
            trainerName: "Ana",
            studentId: bruno,
            exerciseId: squat,
            weightKg: 82.5,
            reps: 6,
            sets: 4,
            note: "Pause at the bottom",
            suggestedAt: T1,
          },
        ]);
      });

      it("replaces the trainer's suggestion for the same exercise", async () => {
        await repo.saveSuggestion(suggestion({ sets: 3, note: "Old" }));
        await repo.saveSuggestion(suggestion({ weightKg: 90, reps: 5, suggestedAt: T2 }));

        expect(await repo.listSuggestionsForStudent(bruno)).toEqual([
          expect.objectContaining({ trainerId: ana, exerciseId: squat, weightKg: 90, reps: 5, sets: null, note: null, suggestedAt: T2 }),
        ]);
      });

      it("lists the most recent first, across trainers and exercises", async () => {
        await repo.saveSuggestion(suggestion({ suggestedAt: T2 }));
        await repo.saveSuggestion(suggestion({ trainerId: dani, suggestedAt: T3, weightKg: 70 }));
        await repo.saveSuggestion(suggestion({ exerciseId: bench, suggestedAt: T1, weightKg: 60 }));

        expect((await repo.listSuggestionsForStudent(bruno)).map((s) => [s.trainerName, s.exerciseId, s.weightKg])).toEqual([
          ["Dani", squat, 70],
          ["Ana", squat, 85],
          ["Ana", bench, 60],
        ]);
      });

      it("keeps each student's suggestions separate", async () => {
        await repo.saveSuggestion(suggestion());
        await repo.saveSuggestion(suggestion({ studentId: carla, exerciseId: carlaSquat, weightKg: 40 }));

        expect((await repo.listSuggestionsForStudent(bruno)).map((s) => s.weightKg)).toEqual([85]);
        expect((await repo.listSuggestionsForStudent(carla)).map((s) => s.weightKg)).toEqual([40]);
        expect(await repo.listSuggestionsForStudent(dani)).toEqual([]);
      });

      it("withdraws only that trainer's suggestion for that exercise", async () => {
        await repo.saveSuggestion(suggestion());
        await repo.saveSuggestion(suggestion({ exerciseId: bench }));
        await repo.saveSuggestion(suggestion({ trainerId: dani }));

        expect(await repo.deleteSuggestion(ana, bruno, squat)).toBe(true);
        expect(await repo.deleteSuggestion(ana, bruno, squat)).toBe(false);
        expect(await repo.deleteSuggestion(ana, carla, squat)).toBe(false);

        expect((await repo.listSuggestionsForStudent(bruno)).map((s) => [s.trainerId, s.exerciseId])).toEqual(
          expect.arrayContaining([
            [ana, bench],
            [dani, squat],
          ]),
        );
        expect(await repo.listSuggestionsForStudent(bruno)).toHaveLength(2);
      });
    });

    describe("comments", () => {
      it("has none until one is added", async () => {
        const workout = await fixture.addWorkout(bruno);
        expect(await repo.listComments(workout)).toEqual([]);
      });

      it("adds comments and lists them oldest first with the trainer's name", async () => {
        const workout = await fixture.addWorkout(bruno);
        const second = await repo.addComment({ sessionId: workout, trainerId: dani, body: "Nice", createdAt: T2 });
        const first = await repo.addComment({ sessionId: workout, trainerId: ana, body: "Great\ndepth", createdAt: T1 });

        expect(first).toEqual({ id: first.id, sessionId: workout, trainerId: ana, trainerName: "Ana", body: "Great\ndepth", createdAt: T1 });
        expect(await repo.listComments(workout)).toEqual([first, second]);
      });

      it("keeps each workout's comments separate", async () => {
        const one = await fixture.addWorkout(bruno);
        const two = await fixture.addWorkout(bruno);
        await repo.addComment({ sessionId: one, trainerId: ana, body: "One", createdAt: T1 });

        expect(await repo.listComments(two)).toEqual([]);
      });

      it("deletes only the trainer's own comment on that workout", async () => {
        const workout = await fixture.addWorkout(bruno);
        const other = await fixture.addWorkout(bruno);
        const own = await repo.addComment({ sessionId: workout, trainerId: ana, body: "Mine", createdAt: T1 });
        const daniComment = await repo.addComment({ sessionId: workout, trainerId: dani, body: "Dani's", createdAt: T2 });

        expect(await repo.deleteComment(ana, workout, daniComment.id)).toBe(false);
        expect(await repo.deleteComment(ana, other, own.id)).toBe(false);
        expect(await repo.deleteComment(ana, workout, own.id)).toBe(true);
        expect(await repo.deleteComment(ana, workout, own.id)).toBe(false);

        expect(await repo.listComments(workout)).toEqual([daniComment]);
      });
    });
  });
}
