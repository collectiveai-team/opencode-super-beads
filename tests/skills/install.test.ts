import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "super-beads-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
  );
});

describe("installBundledSkills", () => {
  test("installs the bundled skill into the super-beads namespace", async () => {
    const configDir = await makeTempDir();
    const { installBundledSkills } = await import("../../src/skills/install");

    await installBundledSkills({ configDir });

    const installedPath = path.join(
      configDir,
      "skills",
      "super-beads",
      "beads-driven-development",
      "SKILL.md"
    );
    const content = await fs.readFile(installedPath, "utf-8");

    expect(content).toContain("name: beads-driven-development");
  });
});
