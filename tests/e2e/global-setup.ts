import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

export default async function globalSetup() {
  const dataDirectory = path.resolve("tests/.tmp/e2e-data");
  await rm(dataDirectory, { recursive: true, force: true });
  await mkdir(dataDirectory, { recursive: true });
}

