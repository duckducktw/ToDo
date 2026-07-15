import { rm } from "node:fs/promises";
import path from "node:path";

export default async function globalTeardown() {
  await rm(path.resolve("tests/.tmp"), { recursive: true, force: true });
}
