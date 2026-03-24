/**
 * Layered dependency analyzer for parallel execution.
 *
 * Builds a fine-grained dependency graph using three additive layers:
 * 1. Explicit plan annotations
 * 2. File-based overlap inference
 * 3. Chunk ordering fallback for tasks without other deps
 *
 * Pure functions only -- no side effects.
 */

import type { ParsedChunk, ParsedTask } from "./parser";

export type DependencySource = "explicit" | "file-overlap" | "chunk-fallback";

export interface AnalyzedDependency {
  taskNumber: number;
  dependsOn: number;
  source: DependencySource;
}

export interface ValidationResult {
  hasCycles: boolean;
  cycles: number[][];
  orphanWarnings: string[];
  overConnectionWarnings: string[];
}

export interface DependencyAnalysisResult {
  edges: AnalyzedDependency[];
  validation: ValidationResult;
}

export function buildLayeredDependencyGraph(
  chunks: ParsedChunk[]
): DependencyAnalysisResult {
  const allTasks = chunks.flatMap((chunk) => chunk.tasks);
  const taskByNumber = new Map(allTasks.map((task) => [task.number, task]));
  const edges: AnalyzedDependency[] = [];
  const edgeKeys = new Set<string>();
  const tasksWithNonFallbackDeps = new Set<number>();

  for (const task of allTasks) {
    if ((task.dependsOn ?? []).length > 0) {
      tasksWithNonFallbackDeps.add(task.number);
    }

    for (const dependencyNumber of task.dependsOn ?? []) {
      if (!taskByNumber.has(dependencyNumber)) {
        continue;
      }

      addEdge(edges, edgeKeys, {
        taskNumber: task.number,
        dependsOn: dependencyNumber,
        source: "explicit",
      });
    }
  }

  for (let i = 0; i < allTasks.length; i += 1) {
    for (let j = i + 1; j < allTasks.length; j += 1) {
      const firstTask = allTasks[i]!;
      const secondTask = allTasks[j]!;
      const overlap = findFileOverlap(firstTask.filePaths ?? [], secondTask.filePaths ?? []);

      if (overlap.length === 0) {
        continue;
      }

      const producer = firstTask.number < secondTask.number ? firstTask : secondTask;
      const consumer = firstTask.number < secondTask.number ? secondTask : firstTask;

      addEdge(edges, edgeKeys, {
        taskNumber: consumer.number,
        dependsOn: producer.number,
        source: "file-overlap",
      });
      tasksWithNonFallbackDeps.add(consumer.number);
    }
  }

  for (let i = 1; i < chunks.length; i += 1) {
    const currentChunk = chunks[i]!;
    const previousChunk = chunks[i - 1]!;

    for (const task of currentChunk.tasks) {
      if (tasksWithNonFallbackDeps.has(task.number)) {
        continue;
      }

      for (const dependency of previousChunk.tasks) {
        addEdge(edges, edgeKeys, {
          taskNumber: task.number,
          dependsOn: dependency.number,
          source: "chunk-fallback",
        });
      }
    }
  }

  return {
    edges,
    validation: validateGraph(edges, allTasks, chunks),
  };
}

function addEdge(
  edges: AnalyzedDependency[],
  edgeKeys: Set<string>,
  edge: AnalyzedDependency
): void {
  const key = `${edge.taskNumber}:${edge.dependsOn}:${edge.source}`;
  if (edgeKeys.has(key)) {
    return;
  }

  edgeKeys.add(key);
  edges.push(edge);
}

function findFileOverlap(pathsA: string[], pathsB: string[]): string[] {
  const normalizedA = new Set(pathsA.filter((filePath) => !filePath.startsWith("tests/")));
  const overlap: string[] = [];

  for (const filePath of pathsB) {
    if (!filePath.startsWith("tests/") && normalizedA.has(filePath)) {
      overlap.push(filePath);
    }
  }

  return overlap;
}

function validateGraph(
  edges: AnalyzedDependency[],
  allTasks: ParsedTask[],
  chunks: ParsedChunk[]
): ValidationResult {
  const cycles = detectCycles(edges, allTasks);

  return {
    hasCycles: cycles.length > 0,
    cycles,
    orphanWarnings: detectOrphans(edges, allTasks, chunks),
    overConnectionWarnings: detectOverConnection(edges, allTasks),
  };
}

function detectCycles(edges: AnalyzedDependency[], allTasks: ParsedTask[]): number[][] {
  const dependenciesByTask = new Map<number, number[]>();

  for (const task of allTasks) {
    dependenciesByTask.set(task.number, []);
  }

  for (const edge of edges) {
    const dependencies = dependenciesByTask.get(edge.taskNumber);
    if (!dependencies) {
      continue;
    }

    if (!dependencies.includes(edge.dependsOn)) {
      dependencies.push(edge.dependsOn);
    }
  }

  const visited = new Set<number>();
  const visiting = new Set<number>();
  const cycles: number[][] = [];

  function dfs(taskNumber: number, path: number[]): void {
    if (visiting.has(taskNumber)) {
      const cycleStart = path.indexOf(taskNumber);
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart));
      }
      return;
    }

    if (visited.has(taskNumber)) {
      return;
    }

    visiting.add(taskNumber);
    visited.add(taskNumber);

    const nextPath = [...path, taskNumber];
    for (const dependency of dependenciesByTask.get(taskNumber) ?? []) {
      dfs(dependency, nextPath);
    }

    visiting.delete(taskNumber);
  }

  for (const task of allTasks) {
    if (!visited.has(task.number)) {
      dfs(task.number, []);
    }
  }

  return cycles;
}

function detectOrphans(
  edges: AnalyzedDependency[],
  allTasks: ParsedTask[],
  chunks: ParsedChunk[]
): string[] {
  if (chunks.length <= 1) {
    return [];
  }

  const firstChunkTaskNumbers = new Set(chunks[0]?.tasks.map((task) => task.number) ?? []);
  const tasksWithDependencies = new Set(edges.map((edge) => edge.taskNumber));
  const warnings: string[] = [];

  for (const task of allTasks) {
    if (firstChunkTaskNumbers.has(task.number)) {
      continue;
    }

    if (!tasksWithDependencies.has(task.number)) {
      warnings.push(
        `Task ${task.number} (${task.name}) in a later chunk has no dependencies — possible missing annotation`
      );
    }
  }

  return warnings;
}

function detectOverConnection(
  edges: AnalyzedDependency[],
  allTasks: ParsedTask[]
): string[] {
  const orderedTaskNumbers = allTasks
    .map((task) => task.number)
    .sort((left, right) => left - right);
  const warnings: string[] = [];

  for (const task of allTasks) {
    const priorCount = orderedTaskNumbers.filter((taskNumber) => taskNumber < task.number).length;
    if (priorCount < 4) {
      continue;
    }

    const dependencyCount = new Set(
      edges
        .filter((edge) => edge.taskNumber === task.number)
        .map((edge) => edge.dependsOn)
    ).size;

    if (dependencyCount > priorCount * 0.5) {
      warnings.push(
        `Task ${task.number} (${task.name}) depends on ${dependencyCount}/${priorCount} prior tasks — consider adding explicit annotations`
      );
    }
  }

  return warnings;
}
