import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { TodayView } from "@/components/today-view";

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <AppShell>
      <TodayView />
    </AppShell>
  );
}
