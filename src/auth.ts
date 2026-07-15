import { timingSafeEqual } from "node:crypto";

import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { assertConfiguredAuthSecret, isTestAuthEnabled } from "@/lib/env";
import {
  hasOAuthCredentials,
  saveOAuthCredentials,
} from "@/lib/oauth-vault";
import { googleUserId, upsertUser } from "@/lib/users";

const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";

assertConfiguredAuthSecret();

function secretsMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

const providers: NextAuthConfig["providers"] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID ?? "",
    clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    authorization: {
      params: {
        scope: `openid email profile ${CALENDAR_SCOPE}`,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      },
    },
  }),
];

if (isTestAuthEnabled()) {
  providers.push(
    Credentials({
      id: "test",
      name: "Automated test session",
      credentials: {
        secret: { label: "Secret", type: "password" },
        userId: { label: "User ID", type: "text" },
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
      },
      authorize(credentials) {
        const expected = process.env.TEST_AUTH_SECRET ?? "";
        const received = String(credentials?.secret ?? "");
        if (!expected || !secretsMatch(received, expected)) {
          return null;
        }

        const requestedId = String(credentials?.userId ?? "test_user")
          .replace(/^google_/, "")
          .trim();
        const id = googleUserId(requestedId || "test_user");
        return {
          id,
          email: String(credentials?.email ?? "test@example.com"),
          name: String(credentials?.name ?? "Test User"),
          image: null,
        };
      },
    }),
  );
}

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (!account || !user.email) {
        return false;
      }
      const internalId =
        account.provider === "google"
          ? googleUserId(account.providerAccountId)
          : user.id?.startsWith("google_")
            ? user.id
            : googleUserId(account.providerAccountId);

      await upsertUser({
        id: internalId,
        email: user.email,
        name: user.name?.trim() || user.email,
        avatarUrl: user.image ?? null,
      });

      if (account.provider === "google" && account.access_token) {
        await saveOAuthCredentials(internalId, {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          tokenType: account.token_type,
          scope: account.scope,
        });
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (account) {
        const userId =
          account.provider === "google"
            ? googleUserId(account.providerAccountId)
            : user?.id?.startsWith("google_")
              ? user.id
              : googleUserId(account.providerAccountId);
        token.userId = userId;
        token.authProvider = account.provider;
        token.sub = userId;
      }
      return token;
    },
    async session({ session, token }) {
      const userId =
        typeof token.userId === "string" ? token.userId : undefined;
      if (session.user && userId) {
        session.user.id = userId;
        session.user.calendar_connected =
          token.authProvider === "test"
            ? Boolean(process.env.CALENDAR_FIXTURE_PATH)
            : await hasOAuthCredentials(userId).catch(() => false);
      }
      return session;
    },
    authorized({ auth }) {
      return Boolean(auth?.user?.id);
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
