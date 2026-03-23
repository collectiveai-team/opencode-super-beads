import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { SuperBeadsPlugin } from "../src/plugin";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalConfigDir = process.env.OPENCODE_CONFIG_DIR;

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "super-beads-plugin-"));
  tempDirs.push(dir);
  return dir;
}

async function writeFile(filePath: string, content = "test"): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

afterEach(async () => {
  process.env.HOME = originalHome;
  if (originalConfigDir === undefined) {
    delete process.env.OPENCODE_CONFIG_DIR;
  } else {
    process.env.OPENCODE_CONFIG_DIR = originalConfigDir;
  }

  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
  );
});

describe("SuperBeadsPlugin", () => {
  test("installs the native skill on startup", async () => {
    const homeDir = await makeTempDir();
    const configDir = path.join(homeDir, ".config", "opencode");
    process.env.HOME = homeDir;
    process.env.OPENCODE_CONFIG_DIR = configDir;

    const templateDir = path.join(
      homeDir,
      ".config",
      "opencode",
      "skills",
      "superpowers",
      "subagent-driven-development"
    );
    await Promise.all([
      writeFile(path.join(templateDir, "implementer-prompt.md")),
      writeFile(path.join(templateDir, "spec-reviewer-prompt.md")),
      writeFile(path.join(templateDir, "code-quality-reviewer-prompt.md")),
    ]);

    const shell = (() => ({ text: async () => "bd 1.0.0" })) as any;

    await SuperBeadsPlugin({
      client: {} as any,
      project: {} as any,
      directory: process.cwd(),
      worktree: process.cwd(),
      serverUrl: new URL("http://localhost"),
      $: shell,
    });

    const installedSkill = path.join(
      configDir,
      "skills",
      "super-beads",
      "beads-driven-development",
      "SKILL.md"
    );
    const content = await fs.readFile(installedSkill, "utf-8");

    expect(content).toContain("name: beads-driven-development");
  });
});
