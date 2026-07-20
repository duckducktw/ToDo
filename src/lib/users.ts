import path from "node:path";

import { DEFAULT_TIMEZONE, getDataStoreDir } from "@/lib/env";
import { AppError } from "@/lib/errors";
import {
  atomicWriteJson,
  readValidatedJson,
  withFileLock,
} from "@/lib/json-file";
import {
  defaultNotificationSettings,
  usersFileSchema,
  type UsersFile,
} from "@/lib/schemas";
import type { UserProfile } from "@/types/domain";
import { publishSyncEvent } from "@/lib/sync-events";

const PROVIDER_ACCOUNT_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export interface UpsertUserInput {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export function googleUserId(providerAccountId: string): string {
  if (!PROVIDER_ACCOUNT_PATTERN.test(providerAccountId)) {
    throw new AppError("UNAUTHENTICATED", 401, "Invalid Google account ID.");
  }
  return `google_${providerAccountId}`;
}

function usersPath(): string {
  return path.join(getDataStoreDir(), "users.json");
}

function emptyUsersFile(): UsersFile {
  return { schema_version: 1, revision: 0, users: [] };
}

async function readOrInitializeUnlocked(filePath: string): Promise<UsersFile> {
  const existing = await readValidatedJson(filePath, usersFileSchema);
  if (existing) {
    return existing;
  }
  const initial = emptyUsersFile();
  await atomicWriteJson(filePath, initial);
  return initial;
}

export async function upsertUser(
  input: UpsertUserInput,
  now: string = new Date().toISOString(),
): Promise<UserProfile> {
  const filePath = usersPath();
  return withFileLock(filePath, async () => {
    const document = await readOrInitializeUnlocked(filePath);
    const index = document.users.findIndex((user) => user.id === input.id);
    const existing = index >= 0 ? document.users[index] : null;
    const user: UserProfile = {
      id: input.id,
      email: input.email,
      name: input.name,
      avatar_url: input.avatarUrl,
      timezone: existing?.timezone ?? DEFAULT_TIMEZONE,
      notification_settings: existing?.notification_settings ?? defaultNotificationSettings,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    const users = [...document.users];
    if (index >= 0) {
      users[index] = user;
    } else {
      users.push(user);
    }
    users.sort((left, right) => left.id.localeCompare(right.id));

    const candidate: UsersFile = {
      schema_version: 1,
      revision: document.revision + 1,
      users,
    };
    const validated = usersFileSchema.safeParse(candidate);
    if (!validated.success) {
      throw new AppError(
        "INTERNAL_ERROR",
        500,
        "The Google profile could not be stored.",
        validated.error,
      );
    }
    await atomicWriteJson(filePath, validated.data);
    return user;
  });
}

export async function getUser(userId: string): Promise<UserProfile | null> {
  const filePath = usersPath();
  return withFileLock(filePath, async () => {
    const document = await readOrInitializeUnlocked(filePath);
    return document.users.find((user) => user.id === userId) ?? null;
  });
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const filePath = usersPath();
  return withFileLock(filePath, async () => (await readOrInitializeUnlocked(filePath)).users);
}

export async function updateUserTimezone(
  userId: string,
  timezone: string,
  now: string = new Date().toISOString(),
): Promise<UserProfile> {
  const filePath = usersPath();
  return withFileLock(filePath, async () => {
    const document = await readOrInitializeUnlocked(filePath);
    const index = document.users.findIndex((user) => user.id === userId);
    if (index < 0) {
      throw new AppError("NOT_FOUND", 404, "User profile not found.");
    }

    const existing = document.users[index];
    if (existing.timezone === timezone) {
      return existing;
    }
    const user: UserProfile = { ...existing, timezone, updated_at: now };
    const users = [...document.users];
    users[index] = user;
    const candidate: UsersFile = {
      schema_version: 1,
      revision: document.revision + 1,
      users,
    };
    const validated = usersFileSchema.safeParse(candidate);
    if (!validated.success) {
      throw new AppError(
        "INTERNAL_ERROR",
        500,
        "The timezone could not be stored.",
        validated.error,
      );
    }
    await atomicWriteJson(filePath, validated.data);
    publishSyncEvent(userId, "settings");
    return user;
  });
}

export async function updateUserNotificationSettings(
  userId: string,
  notificationSettings: UserProfile["notification_settings"],
  now: string = new Date().toISOString(),
): Promise<UserProfile> {
  const filePath = usersPath();
  return withFileLock(filePath, async () => {
    const document = await readOrInitializeUnlocked(filePath);
    const index = document.users.findIndex((user) => user.id === userId);
    if (index < 0) throw new AppError("NOT_FOUND", 404, "User profile not found.");

    const user: UserProfile = {
      ...document.users[index],
      notification_settings: notificationSettings,
      updated_at: now,
    };
    const users = [...document.users];
    users[index] = user;
    const candidate: UsersFile = { schema_version: 1, revision: document.revision + 1, users };
    const validated = usersFileSchema.safeParse(candidate);
    if (!validated.success) {
      throw new AppError("INTERNAL_ERROR", 500, "The notification settings could not be stored.", validated.error);
    }
    await atomicWriteJson(filePath, validated.data);
    publishSyncEvent(userId, "settings");
    return validated.data.users[index];
  });
}
