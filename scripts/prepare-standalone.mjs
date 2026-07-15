import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

for (const entry of await readdir(standaloneRoot)) {
  if (entry === ".env" || entry.startsWith(".env.")) {
    await rm(path.join(standaloneRoot, entry), { force: true });
  }
}

async function copyDirectory(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

await copyDirectory(
  path.join(projectRoot, ".next", "static"),
  path.join(standaloneRoot, ".next", "static"),
);

try {
  await copyDirectory(
    path.join(projectRoot, "public"),
    path.join(standaloneRoot, "public"),
  );
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}
