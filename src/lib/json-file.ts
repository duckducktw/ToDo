import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import lockfile from "proper-lockfile";
import type { ZodType } from "zod";

import { AppError } from "@/lib/errors";

async function setPrivateMode(
  applyMode: () => Promise<unknown>,
): Promise<void> {
  try {
    await applyMode();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "ENOSYS" && code !== "EOPNOTSUPP") {
      throw error;
    }
  }
}

export async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await setPrivateMode(() => chmod(directory, 0o700));
}

export async function readValidatedJson<T>(
  filePath: string,
  schema: ZodType<T>,
): Promise<T | null> {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  try {
    const parsed: unknown = JSON.parse(source);
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      throw validated.error;
    }
    return validated.data;
  } catch (error) {
    throw new AppError(
      "STORE_CORRUPT",
      500,
      `The data store ${path.basename(filePath)} is malformed and was not changed.`,
      error,
    );
  }
}

export async function atomicWriteJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await ensurePrivateDirectory(path.dirname(filePath));
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;

  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await setPrivateMode(() => handle!.chmod(0o600));
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => undefined);
    }
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function withFileLock<T>(
  filePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  await ensurePrivateDirectory(path.dirname(filePath));
  let release: (() => Promise<void>) | undefined;

  try {
    release = await lockfile.lock(filePath, {
      realpath: false,
      stale: 10_000,
      update: 2_000,
      retries: {
        retries: 4,
        factor: 1.5,
        minTimeout: 40,
        maxTimeout: 250,
      },
    });
  } catch (error) {
    throw new AppError(
      "STORE_BUSY",
      503,
      "The data store is busy. Please retry the request.",
      error,
    );
  }

  try {
    return await operation();
  } finally {
    await release().catch(() => undefined);
  }
}
