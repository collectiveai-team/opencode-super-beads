/**
 * Plan-to-Beads converter.
 *
 * Parses a plan markdown file and creates beads issues (epic + child tasks)
 * with dependency wiring via the bd CLI.
 */

import * as fs from "node:fs/promises";
import type { PluginInput } from "@opencode-ai/plugin";
import { parsePlan, buildDependencyGraph } from "./parser";
import type { ParsedPlan } from "./parser";

/** Shell executor type from the OpenCode plugin SDK */
type Shell = PluginInput["$"];

/** Mapping of task number to bead issue ID */
export type TaskMapping = Map<number, string>;

/** Result of the conversion process */
export interface ConversionResult {
  /** The epic issue ID */
  epicId: string;
  /** Mapping of task number to bead issue ID */
  taskMapping: TaskMapping;
  /** The parsed plan (for use by the execution engine) */
  plan: ParsedPlan;
}

/**
 * Check if beads is initialized in the project.
 * If not, run bd init with the project directory name as prefix.
 */
async function ensureBeadsInitialized($: Shell): Promise<void> {
  try {
    await $`bd version`.text();
    // Check if .beads directory exists by trying a harmless command
    await $`bd stats --json`.text();
  } catch {
    // Not initialized -- run bd init
    const dirName = process.cwd().split("/").pop() ?? "project";
    await $`bd init ${dirName}`.text();
  }
}

/**
 * Convert a plan file to beads issues.
 *
 * 1. Ensures beads is initialized
 * 2. Parses the plan markdown
 * 3. Checks for existing epic (idempotency)
 * 4. Creates epic + child task issues
 * 5. Wires cross-chunk dependencies
 * 6. Returns the task mapping
 *
 * @param planPath - Path to the plan markdown file
 * @param $ - Shell executor from OpenCode plugin SDK
 * @returns Conversion result with epic ID and task mapping
 */
export async function convertPlanToBeads(
  planPath: string,
  $: Shell
): Promise<ConversionResult> {
  // Ensure beads is initialized before creating issues
  await ensureBeadsInitialized($);

  const content = await fs.readFile(planPath, "utf-8");
  const plan = parsePlan(content);

  if (plan.chunks.length === 0) {
    throw new Error("Plan has no tasks to convert");
  }

  // Check for existing epic (idempotency)
  const existingEpicId = await findExistingEpic(planPath, $);
  if (existingEpicId) {
    const taskMapping = await rebuildMappingFromExisting(existingEpicId, $);
    return { epicId: existingEpicId, taskMapping, plan };
  }

  // Create epic
  const epicDescription = `Goal: ${plan.goal} | Plan: ${planPath}`;
  const epicId = await createIssue(
    $,
    plan.title,
    "epic",
    epicDescription
  );

  // Create child tasks
  const taskMapping: TaskMapping = new Map();

  for (const chunk of plan.chunks) {
    for (const task of chunk.tasks) {
      const taskTitle = `Task ${task.number}: ${task.name}`;
      const taskDescription = `See ${planPath}, Task ${task.number} | Files: ${task.filesSection}`;
      const taskId = await createChildIssue(
        $,
        taskTitle,
        epicId,
        taskDescription
      );
      taskMapping.set(task.number, taskId);
    }
  }

  // Wire cross-chunk dependencies
  const edges = buildDependencyGraph(plan.chunks);
  for (const edge of edges) {
    const fromId = taskMapping.get(edge.taskNumber);
    const depId = taskMapping.get(edge.dependsOn);
    if (fromId && depId) {
      await addDependency($, fromId, depId);
    }
  }

  return { epicId, taskMapping, plan };
}

async function findExistingEpic(
  planPath: string,
  $: Shell
): Promise<string | null> {
  try {
    const output = await $`bd list --type epic --json`.text();
    const issues = JSON.parse(output);
    if (!Array.isArray(issues)) return null;

    for (const issue of issues) {
      if (
        typeof issue.description === "string" &&
        issue.description.includes(`Plan: ${planPath}`)
      ) {
        return issue.id as string;
      }
    }
  } catch {
    // bd not initialized or no epics -- proceed with creation
  }
  return null;
}

async function rebuildMappingFromExisting(
  epicId: string,
  $: Shell
): Promise<TaskMapping> {
  const mapping: TaskMapping = new Map();
  try {
    const output = await $`bd list --parent ${epicId} --json`.text();
    const issues = JSON.parse(output);
    if (!Array.isArray(issues)) return mapping;

    for (const issue of issues) {
      const titleMatch = (issue.title as string)?.match(/^Task (\d+):/);
      if (titleMatch?.[1]) {
        mapping.set(parseInt(titleMatch[1], 10), issue.id as string);
      }
    }
  } catch {
    // If listing fails, return empty mapping
  }
  return mapping;
}

async function createIssue(
  $: Shell,
  title: string,
  type: string,
  description: string
): Promise<string> {
  const output = await $`bd create ${title} --type ${type} -d ${description} --json`.text();
  const result = JSON.parse(output);
  return result.id as string;
}

async function createChildIssue(
  $: Shell,
  title: string,
  parentId: string,
  description: string
): Promise<string> {
  const output = await $`bd create ${title} --parent ${parentId} -d ${description} --json`.text();
  const result = JSON.parse(output);
  return result.id as string;
}

async function addDependency(
  $: Shell,
  fromId: string,
  toId: string
): Promise<void> {
  try {
    await $`bd dep add ${fromId} ${toId} --type blocks --json`.text();
  } catch {
    // Log but don't fail -- dependency wiring is important but not critical
    console.warn(`Warning: failed to add dependency ${fromId} -> ${toId}`);
  }
}
