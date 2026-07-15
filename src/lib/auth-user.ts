import { auth } from "@/auth";
import { AppError } from "@/lib/errors";
import { getUser } from "@/lib/users";
import type { UserProfile } from "@/types/domain";

export async function requireApiUser(): Promise<UserProfile> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new AppError("UNAUTHENTICATED", 401, "Sign in is required.");
  }

  const user = await getUser(userId);
  if (!user) {
    throw new AppError(
      "UNAUTHENTICATED",
      401,
      "The signed-in user profile is unavailable.",
    );
  }
  return user;
}

