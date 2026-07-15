import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginView } from "@/components/login-view";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const { error } = await searchParams;
  return <LoginView authError={Boolean(error)} />;
}
