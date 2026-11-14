import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseUserId } from "@/modules/admin/ui/parse-user-id";
import { loadStudentHistory } from "@/modules/coaching/ui/coaching-service";
import { plural } from "@/modules/sessions/ui/session-view";

export const metadata: Metadata = { title: "Student · Gymple" };

export default async function StudentPage({ params }: PageProps<"/students/[studentId]">) {
  const studentId = parseUserId((await params).studentId);
  // A non-student, or any student while the trainer is revoked, looks like a missing page.
  const history = studentId ? await loadStudentHistory(studentId) : null;
  if (!history) notFound();

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/students" className="text-sm font-medium text-fg-muted hover:text-fg">
          ← Students
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">{history.student.name}</h1>
        <p className="mt-1 text-fg-muted">Finished workouts</p>
      </div>

      {history.entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
          <p className="font-medium text-fg">No finished workouts yet</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {history.entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/students/${history.student.userId}/workouts/${entry.id}`}
                className="block px-4 py-3 hover:bg-surface-sunken"
              >
                <p className="truncate font-medium text-fg">{entry.title}</p>
                <p className="mt-0.5 text-sm text-fg-subtle">
                  {entry.date} · {plural(entry.exerciseCount, "exercise")} · {plural(entry.setCount, "set")} ·{" "}
                  {entry.duration}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
