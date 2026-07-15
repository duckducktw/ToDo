import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import path from "node:path";

import { z } from "zod";

import { assertConfiguredAuthSecret, getDataStoreDir } from "@/lib/env";
import { AppError } from "@/lib/errors";
import {
  atomicWriteJson,
  readValidatedJson,
  withFileLock,
} from "@/lib/json-file";
import {
  encryptedVaultSchema,
  oauthCredentialSchema,
  type OAuthCredential,
} from "@/lib/schemas";

interface OAuthAccountInput {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  tokenType?: string | null;
  scope?: string | null;
}

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.number().int().positive().optional(),
    refresh_token: z.string().min(1).optional(),
    token_type: z.string().optional(),
    scope: z.string().optional(),
  })
  .passthrough();

function vaultPath(userId: string): string {
  if (!/^google_[A-Za-z0-9_-]{1,200}$/.test(userId)) {
    throw new AppError("UNAUTHENTICATED", 401, "Invalid session identity.");
  }
  return path.join(getDataStoreDir(), "oauth", `${userId}.json`);
}

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  assertConfiguredAuthSecret();
  if (!secret) {
    throw new AppError(
      "INTERNAL_ERROR",
      500,
      "AUTH_SECRET is required for encrypted OAuth token storage.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptCredential(credential: OAuthCredential) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(credential.user_id, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credential), "utf8"),
    cipher.final(),
  ]);
  return {
    schema_version: 1 as const,
    algorithm: "aes-256-gcm" as const,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptCredential(
  envelope: unknown,
  expectedUserId: string,
): OAuthCredential {
  try {
    const parsedEnvelope = encryptedVaultSchema.parse(envelope);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(parsedEnvelope.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(expectedUserId, "utf8"));
    decipher.setAuthTag(Buffer.from(parsedEnvelope.auth_tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(parsedEnvelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const credential = oauthCredentialSchema.parse(
      JSON.parse(plaintext) as unknown,
    );
    if (credential.user_id !== expectedUserId) {
      throw new Error("OAuth credential identity mismatch");
    }
    return credential;
  } catch (error) {
    throw new AppError(
      "STORE_CORRUPT",
      500,
      "The encrypted Google credential vault is malformed and was not changed.",
      error,
    );
  }
}

async function readCredentialUnlocked(
  filePath: string,
  userId: string,
): Promise<OAuthCredential | null> {
  const envelope = await readValidatedJson(filePath, encryptedVaultSchema);
  return envelope ? decryptCredential(envelope, userId) : null;
}

async function writeCredentialUnlocked(
  filePath: string,
  credential: OAuthCredential,
): Promise<void> {
  const validated = oauthCredentialSchema.parse(credential);
  await atomicWriteJson(filePath, encryptCredential(validated));
}

export async function saveOAuthCredentials(
  userId: string,
  input: OAuthAccountInput,
  now: string = new Date().toISOString(),
): Promise<void> {
  const filePath = vaultPath(userId);
  await withFileLock(filePath, async () => {
    let existing: OAuthCredential | null = null;
    try {
      existing = await readCredentialUnlocked(filePath, userId);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "STORE_CORRUPT") {
        throw error;
      }
      // A completed OAuth sign-in is authoritative and may replace a vault
      // made unreadable by secret rotation or interrupted local edits.
    }
    await writeCredentialUnlocked(filePath, {
      schema_version: 1,
      user_id: userId,
      access_token: input.accessToken,
      refresh_token: input.refreshToken ?? existing?.refresh_token ?? null,
      expires_at: input.expiresAt ?? existing?.expires_at ?? null,
      token_type: input.tokenType ?? existing?.token_type ?? null,
      scope: input.scope ?? existing?.scope ?? null,
      updated_at: now,
    });
  });
}

export async function hasOAuthCredentials(userId: string): Promise<boolean> {
  const filePath = vaultPath(userId);
  return withFileLock(filePath, async () => {
    const credential = await readCredentialUnlocked(filePath, userId);
    return credential !== null;
  });
}

async function refreshCredential(
  credential: OAuthCredential,
): Promise<OAuthCredential> {
  if (!credential.refresh_token) {
    throw new AppError(
      "CALENDAR_RECONNECT_REQUIRED",
      409,
      "Reconnect Google Calendar to continue.",
    );
  }
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new AppError(
      "UPSTREAM_CALENDAR_ERROR",
      502,
      "Google OAuth is not configured on this server.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: credential.refresh_token,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    throw new AppError(
      "UPSTREAM_CALENDAR_ERROR",
      502,
      "Google OAuth could not be reached.",
      error,
    );
  } finally {
    clearTimeout(timeout);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const oauthError =
      typeof body === "object" && body !== null && "error" in body
        ? String(body.error)
        : "";
    if (oauthError === "invalid_grant") {
      throw new AppError(
        "CALENDAR_RECONNECT_REQUIRED",
        409,
        "Google Calendar authorization expired. Reconnect the account.",
      );
    }
    throw new AppError(
      "UPSTREAM_CALENDAR_ERROR",
      502,
      "Google OAuth rejected the token refresh.",
    );
  }

  const refreshed = tokenResponseSchema.safeParse(body);
  if (!refreshed.success) {
    throw new AppError(
      "UPSTREAM_CALENDAR_ERROR",
      502,
      "Google OAuth returned an invalid token response.",
      refreshed.error,
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1_000);
  return {
    ...credential,
    access_token: refreshed.data.access_token,
    refresh_token:
      refreshed.data.refresh_token ?? credential.refresh_token,
    expires_at: refreshed.data.expires_in
      ? nowSeconds + refreshed.data.expires_in
      : credential.expires_at,
    token_type: refreshed.data.token_type ?? credential.token_type,
    scope: refreshed.data.scope ?? credential.scope,
    updated_at: new Date().toISOString(),
  };
}

export async function getGoogleAccessToken(
  userId: string,
  forceRefresh = false,
): Promise<string> {
  const filePath = vaultPath(userId);
  return withFileLock(filePath, async () => {
    const credential = await readCredentialUnlocked(filePath, userId);
    if (!credential) {
      throw new AppError(
        "CALENDAR_RECONNECT_REQUIRED",
        409,
        "Connect Google Calendar to continue.",
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1_000);
    const isFresh =
      credential.expires_at === null || credential.expires_at > nowSeconds + 60;
    if (!forceRefresh && isFresh) {
      return credential.access_token;
    }

    const refreshed = await refreshCredential(credential);
    await writeCredentialUnlocked(filePath, refreshed);
    return refreshed.access_token;
  });
}
