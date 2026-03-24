import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_NAMESPACE = "super-beads";
const BUNDLED_SKILLS = ["beads-driven-development", "dispatch-parallel-bead-agents"] as const;

function getProjectRoot(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..", "..");
}

function getDefaultConfigDir(): string {
  return process.env.OPENCODE_CONFIG_DIR || path.join(os.homedir(), ".config", "opencode");
}

export async function installBundledSkills(options?: { configDir?: string }): Promise<string[]> {
  const configDir = options?.configDir || getDefaultConfigDir();
  const installedPaths: string[] = [];

  for (const skillName of BUNDLED_SKILLS) {
    const sourcePath = path.join(getProjectRoot(), "skills", skillName, "SKILL.md");
    const targetPath = path.join(
      configDir,
      "skills",
      SKILL_NAMESPACE,
      skillName,
      "SKILL.md"
    );

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    installedPaths.push(targetPath);
  }

  return installedPaths;
}
