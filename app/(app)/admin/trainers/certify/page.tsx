import type { Metadata } from "next";
import { requireAdmin } from "@/modules/auth/infrastructure/session";
import { CertifyForm } from "@/modules/admin/ui/certify-form";

export const metadata: Metadata = { title: "Certify trainer · Admin · Gymple" };

export default async function CertifyTrainerPage({ searchParams }: PageProps<"/admin/trainers/certify">) {
  await requireAdmin();
  const { email } = await searchParams;

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Certify trainer</h1>
        <p className="text-sm text-fg-muted">Makes an existing account a trainer. The account keeps its own data.</p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6">
        <CertifyForm initialEmail={typeof email === "string" ? email : ""} />
      </div>
    </section>
  );
}
