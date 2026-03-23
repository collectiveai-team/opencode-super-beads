/**
 * Vendor file loaders for opencode-super-beads plugin.
 *
 * Loads skill and prompt markdown files from the vendor/ directory.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

function getVendorDir(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..", "vendor");
}

/**
 * Load a skill markdown file from vendor/skills/.
 * Returns the file content as a string, or null if not found.
 */
export async function loadSkill(name: string): Promise<string | null> {
  try {
    const filePath = path.join(getVendorDir(), "skills", `${name}.md`);
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
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
