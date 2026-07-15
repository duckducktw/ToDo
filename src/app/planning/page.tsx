import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { PlanningView } from "@/components/planning-view";

export const metadata: Metadata = { title: "規劃" };

function PlanningFallback() {
  return (
    <div className="page-container wide planning-page" aria-label="正在載入規劃">
      <div className="page-heading loading-heading"><span /><span /></div>
      <div className="planning-skeleton"><span /><span /><span /><span /><span /><span /><span /></div>
    </div>
  );
}

export default async function PlanningPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <AppShell>
      <Suspense fallback={<PlanningFallback />}>
        <PlanningView />
      </Suspense>
    </AppShell>
  );
}
