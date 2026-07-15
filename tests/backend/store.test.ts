import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { createTask } from "@/lib/task-engine";
import {
  getTaskFilePath,
  mutateTaskStore,
  readTaskRange,
  readTaskStore,
} from "@/lib/store";

const USER_A = "google_store_test_a";
const USER_B = "google_store_test_b";
const NOW = "2026-07-15T02:30:00.000Z";
let dataRoot: string;

function addTask(title: string, id: string) {
  return (tasks: Parameters<typeof createTask>[0]) =>
    createTask(
      tasks,
      {
        title,
        description: "",
        scheduled_date: "2026-07-15",
        is_flexible: true,
      },
      NOW,
      id,
    );
}

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(os.tmpdir(), "dual-track-store-"));
  process.env.DATA_STORE_DIR = dataRoot;
});

afterEach(async () => {
  delete process.env.DATA_STORE_DIR;
  await rm(dataRoot, { recursive: true, force: true });
});

describe("task JSON store", () => {
  it("initializes a private, versioned file", async () => {
    const document = await readTaskStore(USER_A);
    const filePath = getTaskFilePath(USER_A);
    const fileStat = await stat(filePath);
    const directoryStat = await stat(path.dirname(filePath));

    expect(document).toEqual({ schema_version: 1, revision: 0, tasks: [] });
    expect(directoryStat.mode & 0o777).toBe(0o700);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it("increments revisions and rejects a stale mutation", async () => {
    const initial = await readTaskStore(USER_A);
    const first = await mutateTaskStore(
      USER_A,
      initial.revision,
      addTask("First", "0198af4b-0c00-7000-8000-000000000001"),
    );

    expect(first.document.revision).toBe(1);
    await expect(
      mutateTaskStore(
        USER_A,
        initial.revision,
        addTask("Stale", "0198af4b-0c00-7000-8000-000000000002"),
      ),
    ).rejects.toMatchObject({ code: "STALE_REVISION", status: 412 });

    const persisted = await readTaskStore(USER_A);
    expect(persisted.tasks.map(({ title }) => title)).toEqual(["First"]);
  });

  it("serializes concurrent writes so only one matching revision wins", async () => {
    await readTaskStore(USER_A);

    const writes = await Promise.allSettled([
      mutateTaskStore(
        USER_A,
        0,
        addTask("Concurrent A", "0198af4b-0c00-7000-8000-000000000001"),
      ),
      mutateTaskStore(
        USER_A,
        0,
        addTask("Concurrent B", "0198af4b-0c00-7000-8000-000000000002"),
      ),
    ]);

    expect(writes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejection = writes.find(({ status }) => status === "rejected");
    expect(
      rejection && rejection.status === "rejected" ? rejection.reason : null,
    ).toMatchObject({ code: "STALE_REVISION", status: 412 });
    expect((await readTaskStore(USER_A)).revision).toBe(1);
  });

  it("keeps authenticated users in physically separate files", async () => {
    await readTaskStore(USER_A);
    await readTaskStore(USER_B);
    await mutateTaskStore(
      USER_A,
      0,
      addTask("Private A", "0198af4b-0c00-7000-8000-000000000001"),
    );
    await mutateTaskStore(
      USER_B,
      0,
      addTask("Private B", "0198af4b-0c00-7000-8000-000000000002"),
    );

    expect((await readTaskRange(USER_A, "2026-07-15", "2026-07-15")).tasks)
      .toHaveLength(1);
    expect((await readTaskStore(USER_A)).tasks[0]?.title).toBe("Private A");
    expect((await readTaskStore(USER_B)).tasks[0]?.title).toBe("Private B");
    expect(getTaskFilePath(USER_A)).not.toBe(getTaskFilePath(USER_B));
  });

  it("refuses traversal-like identities", () => {
    expect(() => getTaskFilePath("google_../../other-user")).toThrowError(
      AppError,
    );
  });

  it("does not overwrite a malformed store", async () => {
    const filePath = getTaskFilePath(USER_A);
    const malformed = '{"schema_version":1,"revision":"wrong","tasks":[]}\n';
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, malformed, "utf8");

    await expect(readTaskStore(USER_A)).rejects.toMatchObject({
      code: "STORE_CORRUPT",
      status: 500,
    });
    expect(await readFile(filePath, "utf8")).toBe(malformed);
  });
});
