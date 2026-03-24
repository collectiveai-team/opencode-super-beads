import * as fs from "node:fs/promises";
import type { PluginInput } from "@opencode-ai/plugin";
import {
  buildLayeredDependencyGraph,
  type DependencyAnalysisResult,
} from "./dependency-analyzer";
import { parsePlan, type ParsedPlan } from "./parser";

type Shell = PluginInput["$"];

interface ExistingChildIssue {
  id: string;
  title: string;
}

export type TaskMapping = Map<number, string>;

export interface ParallelConversionResult {
  epicId: string;
  taskMapping: TaskMapping;
  plan: ParsedPlan;
  analysis: DependencyAnalysisResult;
}

export interface PlanAnalysis {
  plan: ParsedPlan;
  depResult: DependencyAnalysisResult;
  planPath: string;
}

export async function convertPlanToBeadsParallel(
  planPath: string,
  $: Shell
): Promise<ParallelConversionResult> {
  const analysis = await analyzePlanDependencies(planPath);
  return createBeadsFromAnalysis(planPath, analysis, $);
}

export async function analyzePlanDependencies(planPath: string): Promise<PlanAnalysis> {
  const content = await fs.readFile(planPath, "utf-8");
  const plan = parsePlan(content);

  if (plan.chunks.length === 0) {
    throw new Error("Plan has no tasks to convert");
  }

  const depResult = buildLayeredDependencyGraph(plan.chunks);
  if (depResult.validation.hasCycles) {
    const cycleText = depResult.validation.cycles.map((cycle) => cycle.join(" -> ")).join("; ");
    throw new Error(`Dependency cycle detected: ${cycleText}`);
  }

  return { plan, depResult, planPath };
}

export async function createBeadsFromAnalysis(
  planPath: string,
  analysis: PlanAnalysis,
  $: Shell
): Promise<ParallelConversionResult> {
  if (planPath !== analysis.planPath) {
    throw new Error(
      `Plan path mismatch: expected ${analysis.planPath} but received ${planPath}`
    );
  }

  await ensureBeadsInitialized($);

  const { plan, depResult } = analysis;

  for (const warning of depResult.validation.orphanWarnings) {
    console.warn(`[parallel-converter] ${warning}`);
  }
  for (const warning of depResult.validation.overConnectionWarnings) {
    console.warn(`[parallel-converter] ${warning}`);
  }

  let epicId = await findExistingParallelEpic(analysis.planPath, $);
  let taskMapping: TaskMapping | null = null;

  if (epicId) {
    const existingChildren = await listExistingChildIssues(epicId, $);
    const existingMapping = rebuildMappingFromExisting(existingChildren);

    if (isReusableExistingEpic(plan, existingChildren, existingMapping)) {
      taskMapping = existingMapping;
    } else {
      epicId = null;
    }
  }

  if (!epicId) {
    epicId = await createIssue(
      $,
      plan.title,
      "epic",
      `Goal: ${plan.goal} | Plan: ${analysis.planPath} | Mode: parallel`
    );

    taskMapping = new Map();
    for (const chunk of plan.chunks) {
      for (const task of chunk.tasks) {
        const taskId = await createChildIssue(
          $,
          `Task ${task.number}: ${task.name}`,
          epicId,
          `See ${analysis.planPath}, Task ${task.number} | Files: ${task.filesSection}`
        );
        taskMapping.set(task.number, taskId);
      }
    }
  }

  await reconcileDependencies(depResult, taskMapping!, $);

  return { epicId, taskMapping: taskMapping!, plan, analysis: depResult };
}

function countTasks(plan: ParsedPlan): number {
  return plan.chunks.reduce((total, chunk) => total + chunk.tasks.length, 0);
}

async function ensureBeadsInitialized($: Shell): Promise<void> {
  try {
    await $`bd version`.text();
    await $`bd stats --json`.text();
  } catch {
    const dirName = process.cwd().split("/").pop() ?? "project";
    await $`bd init ${dirName}`.text();
  }
}

async function findExistingParallelEpic(planPath: string, $: Shell): Promise<string | null> {
  try {
    const output = await $`bd list --type epic --json`.text();
    const issues = JSON.parse(output);
    if (!Array.isArray(issues)) {
      return null;
    }

    for (const issue of issues) {
      if (
        typeof issue.description === "string" &&
        issue.description.includes(`Plan: ${planPath}`) &&
        issue.description.includes("Mode: parallel")
      ) {
        return issue.id as string;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function listExistingChildIssues(epicId: string, $: Shell): Promise<ExistingChildIssue[]> {
  try {
    const output = await $`bd list --parent ${epicId} --json`.text();
    const issues = JSON.parse(output);
    if (!Array.isArray(issues)) {
      return [];
    }

    return issues
      .filter(
        (issue): issue is ExistingChildIssue =>
          typeof issue.id === "string" && typeof issue.title === "string"
      )
      .map((issue) => ({ id: issue.id, title: issue.title }));
  } catch {
    return [];
  }
}

function rebuildMappingFromExisting(existingChildren: ExistingChildIssue[]): TaskMapping {
  const mapping: TaskMapping = new Map();

  for (const issue of existingChildren) {
    const match = issue.title.match(/^Task (\d+):/);
    if (match?.[1]) {
      mapping.set(parseInt(match[1], 10), issue.id);
    }
  }

  return mapping;
}

function isReusableExistingEpic(
  plan: ParsedPlan,
  existingChildren: ExistingChildIssue[],
  mapping: TaskMapping
): boolean {
  const expectedTaskCount = countTasks(plan);
  if (existingChildren.length !== expectedTaskCount || mapping.size !== expectedTaskCount) {
    return false;
  }

  const titlesByTaskNumber = new Map<number, string>();
  for (const issue of existingChildren) {
    const match = issue.title.match(/^Task (\d+):/);
    if (!match?.[1]) {
      return false;
    }
    titlesByTaskNumber.set(parseInt(match[1], 10), issue.title);
  }

  for (const chunk of plan.chunks) {
    for (const task of chunk.tasks) {
      if (titlesByTaskNumber.get(task.number) !== `Task ${task.number}: ${task.name}`) {
        return false;
      }
    }
  }

  return true;
}

async function reconcileDependencies(
  depResult: DependencyAnalysisResult,
  taskMapping: TaskMapping,
  $: Shell
): Promise<void> {
  const wiredPairs = new Set<string>();
  for (const edge of depResult.edges) {
    const pairKey = `${edge.taskNumber}:${edge.dependsOn}`;
    if (wiredPairs.has(pairKey)) {
      continue;
    }

    const taskId = taskMapping.get(edge.taskNumber);
    const dependencyId = taskMapping.get(edge.dependsOn);
    if (!taskId || !dependencyId) {
      continue;
    }

    wiredPairs.add(pairKey);
    await addDependency($, taskId, dependencyId);
  }
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

async function addDependency($: Shell, fromId: string, toId: string): Promise<void> {
  try {
    await $`bd dep add ${fromId} ${toId} --type blocks --json`.text();
  } catch {
    console.warn(`Warning: failed to add dependency ${fromId} -> ${toId}`);
  }
}
