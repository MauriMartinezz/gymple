import type { Metadata } from "next";
import Link from "next/link";
import { loadTrainers } from "@/modules/admin/ui/admin-service";
import { TrainerList } from "@/modules/admin/ui/trainer-list";
import { buttonClass } from "@/shared/ui/styles";

export const metadata: Metadata = { title: "Trainers · Admin · Gymple" };

// loadTrainers() checks the admin flag: anyone else gets the not-found page.
export default async function AdminPage() {
  const trainers = await loadTrainers();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Trainers</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/trainers/certify" className={buttonClass("secondary", "sm")}>
            Certify existing account
          </Link>
          <Link href="/admin/trainers/new" className={buttonClass("primary", "sm")}>
            New trainer
          </Link>
        </div>
      </div>
      <TrainerList trainers={trainers} />
    </section>
  );
}
