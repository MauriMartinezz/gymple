import { requireUser } from "@/modules/auth/infrastructure/session";

export default async function HomePage() {
  const user = await requireUser();

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Hi, {user.name}</h1>
      <p className="text-fg-muted">Your routines and progress will show up here.</p>
    </section>
  );
}
