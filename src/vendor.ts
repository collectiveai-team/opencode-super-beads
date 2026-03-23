/**
 * Vendor file loaders for opencode-super-beads plugin.
 *
 * Loads bundled skill and prompt markdown files.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

function getVendorDir(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..", "vendor");
}

function getSkillsDir(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..", "skills");
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

/**
 * Load a skill markdown file from skills/<name>/SKILL.md.
 * Returns the file content as a string, or null if not found.
 */
export async function loadSkill(name: string): Promise<string | null> {
  try {
    const filePath = path.join(getSkillsDir(), name, "SKILL.md");
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Load a skill markdown file without frontmatter for runtime injection.
 * Returns the body content as a string, or null if not found.
 */
export async function loadSkillTemplate(name: string): Promise<string | null> {
  const content = await loadSkill(name);
  if (!content) return null;
  return stripFrontmatter(content);
}

/**
 * Load a prompt template from vendor/prompts/.
 * Returns the file content as a string, or null if not found.
 */
export async function loadPrompt(name: string): Promise<string | null> {
  try {
    const filePath = path.join(getVendorDir(), "prompts", `${name}.md`);
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}
