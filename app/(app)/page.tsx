import Link from "next/link";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { buttonClass } from "@/shared/ui/styles";

export default async function HomePage() {
  const user = await requireUser();

  return (
    <section className="flex flex-col items-start gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Hi, {user.name}</h1>
        <p className="mt-1 text-fg-muted">Start by adding the exercises you train.</p>
      </div>
      <Link href="/exercises" className={buttonClass("primary")}>
        Go to exercises
      </Link>
    </section>
  );
}
