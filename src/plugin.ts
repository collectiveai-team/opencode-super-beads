/**
 * OpenCode Super-Beads Plugin
 *
 * Bridges superpowers' workflow engine with beads' task management.
 * Adds beads-driven development as a third execution path.
 *
 * Components:
 * - chat.message hook: intercepts plan completion, offers execution choices
 * - Plan-to-beads converter: creates epic + child issues from plan markdown
 * - beads-driven-development skill: full execution engine with bd ready loop
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { createHandoffHook } from "./hooks/handoff";
import { installBundledSkills } from "./skills/install";
import { loadSkillTemplate } from "./vendor";

/**
 * Check if bd CLI is available.
 */
async function checkBdAvailable(
  $: PluginInput["$"]
): Promise<boolean> {
  try {
    await $`bd version`.text();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if superpowers prompt templates exist at expected paths.
 */
async function checkSuperpowersTemplates(): Promise<{
  available: boolean;
  missing: string[];
}> {
  const { stat } = await import("node:fs/promises");

  const templates = [
    "implementer-prompt.md",
    "spec-reviewer-prompt.md",
    "code-quality-reviewer-prompt.md",
  ];

  // Superpowers skill files can be in multiple locations depending on installation
  const possibleBasePaths = [
    `${process.env.HOME}/.config/opencode/skills/superpowers/subagent-driven-development`,
    `${process.env.HOME}/.config/claude/skills/superpowers/subagent-driven-development`,
  ];

  const missing: string[] = [];

  for (const template of templates) {
    let found = false;
    for (const basePath of possibleBasePaths) {
      try {
        await stat(`${basePath}/${template}`);
        found = true;
        break;
      } catch {
        // Try next path
      }
    }
    if (!found) {
      missing.push(template);
    }
  }

  return { available: missing.length === 0, missing };
}

export const SuperBeadsPlugin: Plugin = async ({ client, $ }) => {
  // Startup checks
  const bdAvailable = await checkBdAvailable($);

  if (!bdAvailable) {
    console.warn(
      "[opencode-super-beads] bd CLI not found -- beads-driven execution disabled. " +
        "Install beads: https://github.com/steveyegge/beads"
    );
  }

  const templateCheck = await checkSuperpowersTemplates();
  if (!templateCheck.available) {
    console.warn(
      `[opencode-super-beads] Superpowers prompt templates not found: ${templateCheck.missing.join(", ")}. ` +
        "Install superpowers plugin. Plugin disabled."
    );
    // Self-disable: return empty hooks/config per spec
    return {};
  }

  try {
    await installBundledSkills();
  } catch (error) {
    console.warn(
      `[opencode-super-beads] Failed to install bundled skills: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Load skill content for config registration
  const skillContent = await loadSkillTemplate("beads-driven-development");

  // Create the handoff hook
  const handoffHook = createHandoffHook(client, $, bdAvailable);

  return {
    "chat.message": handoffHook,

    config: async (config) => {
      // Register the bundled skill as a manual command alias
      if (skillContent) {
        config.command = {
          ...config.command,
          "super-beads:execute": {
            description:
              "Manual alias for super-beads:beads-driven-development",
            template: skillContent,
          },
        };
      }
    },
  };
};
