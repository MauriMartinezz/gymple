import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseUserId } from "@/modules/admin/ui/parse-user-id";
import { CommentForm } from "@/modules/coaching/ui/comment-form";
import { CommentList } from "@/modules/coaching/ui/comment-list";
import { loadStudentWorkout } from "@/modules/coaching/ui/coaching-service";
import { loadOwnWorkoutComments } from "@/modules/coaching/ui/feedback-service";
import { ReadOnlySet } from "@/modules/coaching/ui/read-only-set";
import { parseSessionId } from "@/modules/sessions/ui/parse-session-form";
import { plural } from "@/modules/sessions/ui/session-view";

export const metadata: Metadata = { title: "Student workout · Gymple" };

export default async function StudentWorkoutPage({ params }: PageProps<"/students/[studentId]/workouts/[sessionId]">) {
  const raw = await params;
  const studentId = parseUserId(raw.studentId);
  const sessionId = parseSessionId(raw.sessionId);
  // Active, foreign, or not-coached workouts all look like a missing page.
  const [workout, comments] =
    studentId && sessionId
      ? await Promise.all([loadStudentWorkout(studentId, sessionId), loadOwnWorkoutComments(studentId, sessionId)])
      : [null, null];
  if (!workout || !comments) notFound();

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href={`/students/${workout.student.userId}`} className="text-sm font-medium text-fg-muted hover:text-fg">
          ← {workout.student.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">{workout.title}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {workout.date} · {workout.duration} · {plural(workout.setCount, "set")}
        </p>
        {workout.notes && <p className="mt-3 whitespace-pre-line text-fg">{workout.notes}</p>}
      </div>

      {workout.groups.map((group) => {
        const headingId = `exercise-${group.exerciseId}-heading`;
        return (
          <section key={group.exerciseId} aria-labelledby={headingId} className="rounded-xl border border-border bg-surface p-4">
            <h2 id={headingId} className="font-semibold text-fg">
              {group.name}
            </h2>
            <ol className="mt-2 divide-y divide-border" aria-label={`Sets of ${group.name}`}>
              {group.sets.map((set) => (
                <ReadOnlySet key={set.id} set={set} />
              ))}
            </ol>
          </section>
        );
      })}

      <section aria-labelledby="comments-heading" className="flex flex-col gap-3 border-t border-border pt-4">
        <h2 id="comments-heading" className="text-lg font-semibold text-fg">
          Your comments
        </h2>
        {comments.length > 0 && (
          <CommentList comments={comments} deletable={{ studentId: workout.student.userId, sessionId: workout.id }} />
        )}
        <CommentForm studentId={workout.student.userId} sessionId={workout.id} />
      </section>
    </section>
  );
}
