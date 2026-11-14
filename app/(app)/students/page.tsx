import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { regenerateInviteCodeAction, removeStudentAction } from "@/modules/coaching/ui/actions";
import { loadTrainerDashboard } from "@/modules/coaching/ui/coaching-service";
import { InviteLink } from "@/modules/coaching/ui/invite-link";
import { buttonClass } from "@/shared/ui/styles";

export const metadata: Metadata = { title: "Students · Gymple" };

// Only active trainers: anyone else, revoked trainers included, gets not-found.
export default async function StudentsPage() {
  const dashboard = await loadTrainerDashboard();
  if (!dashboard) notFound();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Students</h1>

      <section aria-labelledby="invite-heading" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <h2 id="invite-heading" className="font-semibold text-fg">
            Your invite link
          </h2>
          <p className="mt-1 text-sm text-fg-muted">Share it with your students: opening it lets them join you.</p>
        </div>
        <InviteLink path={dashboard.invitePath} />
        <form action={regenerateInviteCodeAction}>
          <button type="submit" className={buttonClass("ghost", "sm")}>
            Get a new link
          </button>
          <span className="ml-2 text-sm text-fg-subtle">The current link will stop working.</span>
        </form>
      </section>

      {dashboard.students.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
          <p className="font-medium text-fg">No students yet</p>
          <p className="mt-1 text-sm text-fg-muted">Students appear here once they open your link and join.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {dashboard.students.map((student) => (
            <li key={student.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link href={`/students/${student.userId}`} className="min-w-0 flex-1 hover:underline">
                <p className="truncate font-medium text-fg">{student.name}</p>
                <p className="truncate text-sm text-fg-muted">{student.email}</p>
              </Link>
              <form action={removeStudentAction}>
                <input type="hidden" name="studentId" value={student.userId} />
                <button type="submit" className={buttonClass("ghost", "sm")} aria-label={`Remove ${student.name}`}>
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
