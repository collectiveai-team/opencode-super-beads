# dispatch-parallel-bead-agents Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add parallel beads-driven execution as a 4th execution option — with DAG-based worktree branching, fine-grained dependency analysis, and a new skill file.

**Architecture:** Extends the existing opencode-super-beads plugin with: (1) an enhanced parser that extracts `Depends on:` annotations and file paths, (2) a dependency analyzer that builds a layered dependency graph (explicit deps + file overlap + chunk fallback), (3) an enhanced converter that wires fine-grained beads dependencies, (4) a new skill file with the full parallel execution engine, (5) lane and integration reviewer prompt templates, and (6) handoff hook integration for the new execution option.

**Tech Stack:** TypeScript, Bun runtime, `@opencode-ai/plugin` SDK, `bd` CLI (beads)

**Spec:** `docs/superpowers/specs/2026-03-23-dispatch-parallel-bead-agents-design.md`

---

## Chunk 1: Parser Enhancement — Depends-On Parsing

Extends the existing `src/converter/parser.ts` to extract `**Depends on:**` annotations and individual file paths from task content. Pure functions, no side effects.

### Task 1: Parse Depends-On Annotations

**Files:**
- Modify: `src/converter/parser.ts`
- Modify: `tests/converter/parser.test.ts`
- Modify: `tests/fixtures/sample-plan.md`

- [ ] **Step 1: Update the test fixture with Depends-On annotations**

Append to `tests/fixtures/sample-plan.md` a third chunk with dependency annotations:

```markdown
## Chunk 3: Integration

### Task 5: Dashboard Integration

**Depends on:** Task 2, Task 3
**Files:**
- Create: `src/dashboard/integration.ts`
- Modify: `src/auth/middleware.ts:50-60`
- Test: `tests/dashboard/integration.test.ts`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Implement integration**

- [ ] **Step 3: Commit**

### Task 6: API Gateway

**Depends on:** Task 1
**Files:**
- Create: `src/gateway/api.ts`
- Test: `tests/gateway/api.test.ts`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Implement gateway**

- [ ] **Step 3: Commit**
```

- [ ] **Step 2: Update existing test assertions broken by new fixture data**

The new chunk adds 2 more tasks (5, 6) and 1 more chunk, breaking existing assertions. Update in `tests/converter/parser.test.ts`:

```typescript
// Line ~32: was toHaveLength(2), now 3 chunks
expect(result.chunks).toHaveLength(3);

// Line ~70: was toBe(4), now 6 total tasks
expect(totalTasks).toBe(6);
```

Also update any manually-constructed `ParsedTask` objects in the `buildDependencyGraph` tests to include the new required fields (`filePaths: []` and `dependsOn: []`):

```typescript
// Every manual { number: N, name: "X", filesSection: "", fullContent: "" }
// becomes: { number: N, name: "X", filesSection: "", filePaths: [], dependsOn: [], fullContent: "" }
```

There are 4 such constructions across the `buildDependencyGraph` test cases (single-chunk test and three-chunk test).

- [ ] **Step 3: Write the failing tests for dependsOn parsing**

Append to `tests/converter/parser.test.ts`:

```typescript
describe("dependsOn parsing", () => {
  test("extracts Depends on annotation from task", async () => {
    const planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    // Task 5 in Chunk 3 has "Depends on: Task 2, Task 3"
    const chunk3 = result.chunks.find(c => c.name === "Integration");
    expect(chunk3).toBeDefined();
    const task5 = chunk3!.tasks.find(t => t.number === 5);
    expect(task5).toBeDefined();
    expect(task5!.dependsOn).toEqual([2, 3]);
  });

  test("extracts single dependency", async () => {
    const planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    const chunk3 = result.chunks.find(c => c.name === "Integration");
    const task6 = chunk3!.tasks.find(t => t.number === 6);
    expect(task6).toBeDefined();
    expect(task6!.dependsOn).toEqual([1]);
  });

  test("returns empty array when no Depends on annotation", async () => {
    const planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    const task1 = result.chunks[0]!.tasks[0]!;
    expect(task1.dependsOn).toEqual([]);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bun test tests/converter/parser.test.ts`
Expected: FAIL — `dependsOn` is `undefined` (not yet parsed)

- [ ] **Step 5: Add dependsOn field to ParsedTask interface**

In `src/converter/parser.ts`, update the `ParsedTask` interface:

```typescript
/** A single task extracted from a plan */
export interface ParsedTask {
  /** Task number (from "### Task N: Name") */
  number: number;
  /** Task name (from "### Task N: Name") */
  name: string;
  /** The **Files:** section content */
  filesSection: string;
  /** Individual file paths extracted from the Files: section */
  filePaths: string[];
  /** Explicit dependency task numbers (from "**Depends on:** Task N, Task M") */
  dependsOn: number[];
  /** The full task content (everything from ### Task N to the next ### or ##) */
  fullContent: string;
}
```

- [ ] **Step 6: Add extractDependsOn function**

Add to `src/converter/parser.ts`:

```typescript
/**
 * Extract explicit dependency task numbers from task content.
 * Parses "**Depends on:** Task 2, Task 3" annotations.
 *
 * @param taskContent - The full content of a single task
 * @returns Array of task numbers this task depends on
 */
function extractDependsOn(taskContent: string): number[] {
  const match = taskContent.match(/\*\*Depends on:\*\*\s*(.+)$/m);
  if (!match?.[1]) return [];

  const deps: number[] = [];
  const refs = match[1].split(",");
  for (const ref of refs) {
    const numMatch = ref.trim().match(/Task\s+(\d+)/i);
    if (numMatch?.[1]) {
      deps.push(parseInt(numMatch[1], 10));
    }
  }
  return deps;
}
```

- [ ] **Step 7: Add extractFilePaths function**

Add to `src/converter/parser.ts`:

```typescript
/**
 * Extract individual file paths from the Files: section.
 * Parses lines like "- Create: `src/foo.ts`" or "- Modify: `src/bar.ts:10-20`"
 *
 * @param filesSection - The raw Files: section content
 * @returns Array of file paths (without line ranges)
 */
function extractFilePaths(filesSection: string): string[] {
  if (!filesSection) return [];
  const paths: string[] = [];
  const lines = filesSection.split("\n");
  for (const line of lines) {
    // Match backtick-quoted paths, strip line ranges like :10-20
    const pathMatch = line.match(/`([^`]+)`/);
    if (pathMatch?.[1]) {
      const filePath = pathMatch[1].replace(/:\d+(-\d+)?$/, "");
      paths.push(filePath);
    }
  }
  return paths;
}
```

- [ ] **Step 8: Wire new functions into extractTasks**

Update the task creation in `extractTasks` to include the new fields:

```typescript
const filesSection = extractFilesSection(fullContent);
const filePaths = extractFilePaths(filesSection);
const dependsOn = extractDependsOn(fullContent);

tasks.push({ number, name, filesSection, filePaths, dependsOn, fullContent });
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `bun test tests/converter/parser.test.ts`
Expected: All tests pass

- [ ] **Step 10: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/converter/parser.ts tests/converter/parser.test.ts tests/fixtures/sample-plan.md
git commit -m "feat: add Depends-On annotation parsing and file path extraction to parser"
```

---

## Chunk 2: Dependency Analyzer

New pure-function module that builds a layered dependency graph: explicit deps + file overlap inference + chunk ordering fallback. Includes validation (cycle detection, orphan warnings, over-connection warnings).

### Task 2: Layered Dependency Graph Builder

**Depends on:** Task 1
**Files:**
- Create: `src/converter/dependency-analyzer.ts`
- Create: `tests/converter/dependency-analyzer.test.ts`
- Create: `tests/fixtures/sample-plan-with-deps.md`

- [ ] **Step 1: Create test fixture with explicit deps and overlapping files**

Create `tests/fixtures/sample-plan-with-deps.md`:

```markdown
# Parallel Test Plan

**Goal:** Test fine-grained dependency analysis

---

## Chunk 1: Foundation

### Task 1: Auth types

**Files:**
- Create: `src/auth/types.ts`
- Test: `tests/auth/types.test.ts`

- [ ] **Step 1: Implement**

### Task 2: Database schema

**Files:**
- Create: `src/db/schema.ts`
- Test: `tests/db/schema.test.ts`

- [ ] **Step 1: Implement**

### Task 3: Config loader

**Files:**
- Create: `src/config/loader.ts`
- Test: `tests/config/loader.test.ts`

- [ ] **Step 1: Implement**

## Chunk 2: Features

### Task 4: Auth middleware

**Depends on:** Task 1
**Files:**
- Create: `src/auth/middleware.ts`
- Modify: `src/auth/types.ts`
- Test: `tests/auth/middleware.test.ts`

- [ ] **Step 1: Implement**

### Task 5: User service

**Depends on:** Task 1, Task 2
**Files:**
- Create: `src/services/user.ts`
- Test: `tests/services/user.test.ts`

- [ ] **Step 1: Implement**

### Task 6: API routes

**Files:**
- Create: `src/routes/api.ts`
- Modify: `src/db/schema.ts`
- Test: `tests/routes/api.test.ts`

- [ ] **Step 1: Implement**
```

- [ ] **Step 2: Write the failing tests**

Create `tests/converter/dependency-analyzer.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parsePlan } from "../../src/converter/parser";
import {
  buildLayeredDependencyGraph,
  type AnalyzedDependency,
  type DependencyAnalysisResult,
} from "../../src/converter/dependency-analyzer";

const FIXTURE_PATH = path.join(
  import.meta.dir,
  "..",
  "fixtures",
  "sample-plan-with-deps.md"
);

describe("buildLayeredDependencyGraph", () => {
  test("includes explicit Depends-On edges", async () => {
    const content = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(content);
    const result = buildLayeredDependencyGraph(plan.chunks);

    // Task 4 explicitly depends on Task 1
    const task4Deps = result.edges.filter((e) => e.taskNumber === 4);
    expect(task4Deps.some((e) => e.dependsOn === 1 && e.source === "explicit")).toBe(true);

    // Task 5 explicitly depends on Task 1 and Task 2
    const task5Deps = result.edges.filter((e) => e.taskNumber === 5);
    expect(task5Deps.some((e) => e.dependsOn === 1 && e.source === "explicit")).toBe(true);
    expect(task5Deps.some((e) => e.dependsOn === 2 && e.source === "explicit")).toBe(true);
  });

  test("infers file-overlap edges as safety net", async () => {
    const content = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(content);
    const result = buildLayeredDependencyGraph(plan.chunks);

    // Task 4 modifies src/auth/types.ts which Task 1 creates → overlap edge
    // (explicit dep already exists, but overlap edge added too)
    const task4Overlap = result.edges.filter(
      (e) => e.taskNumber === 4 && e.dependsOn === 1 && e.source === "file-overlap"
    );
    expect(task4Overlap.length).toBe(1);

    // Task 6 modifies src/db/schema.ts which Task 2 creates → overlap edge
    // (no explicit dep — this is caught by file overlap)
    const task6Deps = result.edges.filter(
      (e) => e.taskNumber === 6 && e.dependsOn === 2
    );
    expect(task6Deps.some((e) => e.source === "file-overlap")).toBe(true);
  });

  test("falls back to chunk ordering for tasks with no other deps", async () => {
    const content = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(content);
    const result = buildLayeredDependencyGraph(plan.chunks);

    // Task 6 has no explicit deps. It has file overlap with Task 2 (schema.ts).
    // It does NOT get chunk-fallback edges because it has at least one dep from overlap.
    const task6ChunkFallback = result.edges.filter(
      (e) => e.taskNumber === 6 && e.source === "chunk-fallback"
    );
    expect(task6ChunkFallback.length).toBe(0);
  });

  test("chunk fallback applies when no explicit deps and no file overlap", () => {
    const plan = parsePlan(`# Plan

**Goal:** Test chunk fallback

---

## Chunk 1: Setup

### Task 1: A

**Files:**
- Create: \`src/a.ts\`

- [ ] **Step 1: Do it**

## Chunk 2: Build

### Task 2: B

**Files:**
- Create: \`src/b.ts\`

- [ ] **Step 1: Do it**
`);
    const result = buildLayeredDependencyGraph(plan.chunks);

    // Task 2 has no explicit deps and no file overlap with Task 1
    // → falls back to chunk ordering: Task 2 depends on Task 1
    const task2Deps = result.edges.filter((e) => e.taskNumber === 2);
    expect(task2Deps.some((e) => e.dependsOn === 1 && e.source === "chunk-fallback")).toBe(true);
  });

  test("deduplicates edges from multiple sources", async () => {
    const content = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(content);
    const result = buildLayeredDependencyGraph(plan.chunks);

    // Task 4 → Task 1 exists from both explicit and file-overlap
    // Both should be in edges (different source) but unique pairs tracked
    const task4to1 = result.edges.filter(
      (e) => e.taskNumber === 4 && e.dependsOn === 1
    );
    // Should have both explicit and file-overlap edges
    const sources = task4to1.map((e) => e.source);
    expect(sources).toContain("explicit");
    expect(sources).toContain("file-overlap");
  });

  test("reports no cycles for valid graph", async () => {
    const content = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(content);
    const result = buildLayeredDependencyGraph(plan.chunks);
    expect(result.validation.hasCycles).toBe(false);
    expect(result.validation.cycles).toEqual([]);
  });
});

describe("validation", () => {
  test("detects cycles", () => {
    // Manually construct chunks where Task 1 depends on Task 2 and Task 2 depends on Task 1
    const plan = parsePlan(`# Cyclic Plan

**Goal:** Test cycle detection

---

### Task 1: A

**Depends on:** Task 2
**Files:**
- Create: \`src/a.ts\`

- [ ] **Step 1: Do it**

### Task 2: B

**Depends on:** Task 1
**Files:**
- Create: \`src/b.ts\`

- [ ] **Step 1: Do it**
`);
    const result = buildLayeredDependencyGraph(plan.chunks);
    expect(result.validation.hasCycles).toBe(true);
    expect(result.validation.cycles.length).toBeGreaterThan(0);
  });

  test("warns about orphan tasks in later chunks", async () => {
    const content = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(content);
    const result = buildLayeredDependencyGraph(plan.chunks);
    // No orphans in our fixture — all chunk 2 tasks have deps
    expect(result.validation.orphanWarnings).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/converter/dependency-analyzer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Write the implementation**

Create `src/converter/dependency-analyzer.ts`:

```typescript
/**
 * Layered dependency analyzer for parallel execution.
 *
 * Builds a fine-grained dependency graph using three additive layers:
 * 1. Explicit plan annotations (Depends on: Task N)
 * 2. File-based overlap inference (shared file paths)
 * 3. Chunk ordering fallback (for tasks with no other deps)
 *
 * Pure functions only -- no side effects, no CLI calls.
 */

import type { ParsedChunk, ParsedTask } from "./parser";

/** Source that produced a dependency edge */
export type DependencySource = "explicit" | "file-overlap" | "chunk-fallback";

/** A dependency edge with provenance tracking */
export interface AnalyzedDependency {
  taskNumber: number;
  dependsOn: number;
  source: DependencySource;
}

/** Validation result */
export interface ValidationResult {
  hasCycles: boolean;
  cycles: number[][];
  orphanWarnings: string[];
  overConnectionWarnings: string[];
}

/** Full result of dependency analysis */
export interface DependencyAnalysisResult {
  edges: AnalyzedDependency[];
  validation: ValidationResult;
}

/**
 * Build a layered dependency graph from parsed plan chunks.
 *
 * Layers are additive (union), not exclusive:
 * 1. Explicit deps from Depends-On annotations (always included)
 * 2. File overlap edges (always runs as safety net)
 * 3. Chunk fallback (only for tasks with no deps from layers 1 or 2)
 */
export function buildLayeredDependencyGraph(
  chunks: ParsedChunk[]
): DependencyAnalysisResult {
  const allTasks = chunks.flatMap((c) => c.tasks);
  const taskByNumber = new Map<number, ParsedTask>();
  for (const task of allTasks) {
    taskByNumber.set(task.number, task);
  }

  const edges: AnalyzedDependency[] = [];

  // Track which tasks have at least one dep from explicit or file-overlap
  const tasksWithDeps = new Set<number>();

  // Layer 1: Explicit deps
  for (const task of allTasks) {
    for (const depNum of task.dependsOn) {
      if (taskByNumber.has(depNum)) {
        edges.push({ taskNumber: task.number, dependsOn: depNum, source: "explicit" });
        tasksWithDeps.add(task.number);
      }
    }
  }

  // Layer 2: File overlap inference (always runs)
  for (let i = 0; i < allTasks.length; i++) {
    for (let j = i + 1; j < allTasks.length; j++) {
      const taskA = allTasks[i]!;
      const taskB = allTasks[j]!;
      const overlap = findFileOverlap(taskA.filePaths, taskB.filePaths);
      if (overlap.length > 0) {
        // Lower task number is the "producer"
        const [producer, consumer] =
          taskA.number < taskB.number ? [taskA, taskB] : [taskB, taskA];
        edges.push({
          taskNumber: consumer.number,
          dependsOn: producer.number,
          source: "file-overlap",
        });
        tasksWithDeps.add(consumer.number);
      }
    }
  }

  // Layer 3: Chunk fallback (only for tasks with no deps from layers 1-2)
  for (let i = 1; i < chunks.length; i++) {
    const currentChunk = chunks[i]!;
    const previousChunk = chunks[i - 1]!;

    for (const task of currentChunk.tasks) {
      if (!tasksWithDeps.has(task.number)) {
        // No deps from explicit or file-overlap — fall back to chunk ordering
        for (const dep of previousChunk.tasks) {
          edges.push({
            taskNumber: task.number,
            dependsOn: dep.number,
            source: "chunk-fallback",
          });
        }
        tasksWithDeps.add(task.number);
      }
    }
  }

  // Validation
  const validation = validateGraph(edges, allTasks, chunks);

  return { edges, validation };
}

/**
 * Find overlapping file paths between two tasks.
 * Paths are compared after stripping test file prefixes
 * (e.g., tests/foo.test.ts and src/foo.ts are NOT considered overlapping).
 */
function findFileOverlap(pathsA: string[], pathsB: string[]): string[] {
  const setA = new Set(pathsA.filter((p) => !p.startsWith("tests/")));
  const overlap: string[] = [];
  for (const p of pathsB) {
    if (!p.startsWith("tests/") && setA.has(p)) {
      overlap.push(p);
    }
  }
  return overlap;
}

/**
 * Validate the dependency graph for cycles, orphans, and over-connection.
 */
function validateGraph(
  edges: AnalyzedDependency[],
  allTasks: ParsedTask[],
  chunks: ParsedChunk[]
): ValidationResult {
  const cycles = detectCycles(edges, allTasks);
  const orphanWarnings = detectOrphans(edges, allTasks, chunks);
  const overConnectionWarnings = detectOverConnection(edges, allTasks);

  return {
    hasCycles: cycles.length > 0,
    cycles,
    orphanWarnings,
    overConnectionWarnings,
  };
}

/**
 * Detect cycles using DFS-based topological sort.
 */
function detectCycles(
  edges: AnalyzedDependency[],
  allTasks: ParsedTask[]
): number[][] {
  // Build adjacency list (task → tasks it depends on)
  const adj = new Map<number, number[]>();
  for (const task of allTasks) {
    adj.set(task.number, []);
  }
  for (const edge of edges) {
    const deps = adj.get(edge.taskNumber) ?? [];
    if (!deps.includes(edge.dependsOn)) {
      deps.push(edge.dependsOn);
      adj.set(edge.taskNumber, deps);
    }
  }

  const visited = new Set<number>();
  const inStack = new Set<number>();
  const cycles: number[][] = [];

  function dfs(node: number, path: number[]): void {
    if (inStack.has(node)) {
      // Found a cycle — extract it from the path
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart));
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const dep of adj.get(node) ?? []) {
      dfs(dep, [...path]);
    }

    inStack.delete(node);
  }

  for (const task of allTasks) {
    if (!visited.has(task.number)) {
      dfs(task.number, []);
    }
  }

  return cycles;
}

/**
 * Detect orphan tasks in later chunks (tasks with no dependencies at all).
 */
function detectOrphans(
  edges: AnalyzedDependency[],
  allTasks: ParsedTask[],
  chunks: ParsedChunk[]
): string[] {
  if (chunks.length <= 1) return [];

  const warnings: string[] = [];
  const tasksWithDeps = new Set(edges.map((e) => e.taskNumber));

  // Only check tasks in chunk 2+ (chunk 1 tasks naturally have no deps)
  const firstChunkTasks = new Set(chunks[0]?.tasks.map((t) => t.number) ?? []);

  for (const task of allTasks) {
    if (!firstChunkTasks.has(task.number) && !tasksWithDeps.has(task.number)) {
      warnings.push(
        `Task ${task.number} (${task.name}) in a later chunk has no dependencies — possible missing annotation`
      );
    }
  }

  return warnings;
}

/**
 * Detect tasks that depend on more than 50% of prior tasks (likely chunk fallback).
 */
function detectOverConnection(
  edges: AnalyzedDependency[],
  allTasks: ParsedTask[]
): string[] {
  const warnings: string[] = [];
  const taskNumbers = allTasks.map((t) => t.number).sort((a, b) => a - b);

  for (const task of allTasks) {
    const priorCount = taskNumbers.filter((n) => n < task.number).length;
    if (priorCount === 0) continue;

    const depCount = new Set(
      edges.filter((e) => e.taskNumber === task.number).map((e) => e.dependsOn)
    ).size;

    if (depCount > priorCount * 0.5 && priorCount >= 4) {
      warnings.push(
        `Task ${task.number} (${task.name}) depends on ${depCount}/${priorCount} prior tasks — consider adding explicit annotations`
      );
    }
  }

  return warnings;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/converter/dependency-analyzer.test.ts`
Expected: All tests pass

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/converter/dependency-analyzer.ts tests/converter/dependency-analyzer.test.ts tests/fixtures/sample-plan-with-deps.md
git commit -m "feat: add layered dependency analyzer with cycle detection and validation"
```

---

## Chunk 3: Enhanced Converter and Handoff Integration

Extends the existing converter and handoff hook to support the parallel beads-driven execution path. Side-effectful code that calls `bd` CLI.

### Task 3: Extract Shared Beads Helpers and Build Parallel Converter

**Depends on:** Task 2
**Files:**
- Create: `src/converter/beads-helpers.ts`
- Modify: `src/converter/plan-to-beads.ts`
- Create: `src/converter/parallel-converter.ts`
- Create: `tests/converter/parallel-converter.test.ts`

Before creating the parallel converter, extract the 6 shared helper functions (`ensureBeadsInitialized`, `findExistingEpic`, `rebuildMappingFromExisting`, `createIssue`, `createChildIssue`, `addDependency`) from `src/converter/plan-to-beads.ts` into a new `src/converter/beads-helpers.ts`. Update `plan-to-beads.ts` to import from the helpers module. Then build the parallel converter on top of the same helpers.

- [ ] **Step 0a: Extract beads-helpers.ts from plan-to-beads.ts**

Create `src/converter/beads-helpers.ts` by moving the following functions from `plan-to-beads.ts`: `ensureBeadsInitialized`, `findExistingEpic`, `rebuildMappingFromExisting`, `createIssue`, `createChildIssue`, `addDependency`. Export all of them. Also export the `TaskMapping` type.

- [ ] **Step 0b: Update plan-to-beads.ts to import from beads-helpers.ts**

Replace the moved functions with imports:

```typescript
import {
  ensureBeadsInitialized,
  findExistingEpic,
  rebuildMappingFromExisting,
  createIssue,
  createChildIssue,
  addDependency,
  type TaskMapping,
} from "./beads-helpers";
```

- [ ] **Step 0c: Verify existing tests still pass**

Run: `bun test`
Expected: All existing tests pass (refactoring only, no behavior change)

- [ ] **Step 0d: Commit the extraction**

```bash
git add src/converter/beads-helpers.ts src/converter/plan-to-beads.ts
git commit -m "refactor: extract shared beads helpers into beads-helpers.ts"
```

- [ ] **Step 1: Write the failing tests**

Create `tests/converter/parallel-converter.test.ts`:

```typescript
import { describe, expect, test, mock, beforeEach } from "bun:test";
import { convertPlanToBeadsParallel } from "../../src/converter/parallel-converter";
import type { ParallelConversionResult } from "../../src/converter/parallel-converter";

// Mock shell executor that records bd commands
function createMockShell() {
  const calls: string[] = [];
  let issueCounter = 0;

  const $ = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const cmd = strings.reduce(
      (acc, str, i) => acc + str + (values[i] ?? ""),
      ""
    );
    calls.push(cmd.trim());

    return {
      text: async () => {
        if (cmd.includes("bd version") || cmd.includes("bd stats")) {
          return "ok";
        }
        if (cmd.includes("bd list --type epic")) {
          return "[]";
        }
        if (cmd.includes("bd create")) {
          issueCounter++;
          return JSON.stringify({ id: `beads-${issueCounter}` });
        }
        if (cmd.includes("bd dep add")) {
          return "ok";
        }
        if (cmd.includes("bd dep cycles")) {
          return "[]";
        }
        return "";
      },
    };
  };

  return { $: $ as any, calls };
}

describe("convertPlanToBeadsParallel", () => {
  test("creates epic and child tasks", async () => {
    const { $, calls } = createMockShell();
    const result = await convertPlanToBeadsParallel(
      "tests/fixtures/sample-plan-with-deps.md",
      $
    );

    expect(result.epicId).toBeDefined();
    expect(result.taskMapping.size).toBe(6);
    expect(calls.some((c) => c.includes("--type epic"))).toBe(true);
  });

  test("wires fine-grained dependencies instead of chunk-based", async () => {
    const { $, calls } = createMockShell();
    await convertPlanToBeadsParallel(
      "tests/fixtures/sample-plan-with-deps.md",
      $
    );

    // Should have dep add calls — but NOT all-to-all chunk deps
    const depCalls = calls.filter((c) => c.includes("bd dep add"));
    expect(depCalls.length).toBeGreaterThan(0);

    // Should NOT have 6 dep calls (which all-to-all chunk 1→2 would produce: 3 tasks × 2 = 6)
    // Instead should have fine-grained: Task4→1, Task5→1, Task5→2, Task6→2 (from overlap)
    // Plus possible file overlap edges
    expect(depCalls.length).toBeLessThan(6);
  });

  test("returns dependency analysis result", async () => {
    const { $ } = createMockShell();
    const result = await convertPlanToBeadsParallel(
      "tests/fixtures/sample-plan-with-deps.md",
      $
    );

    expect(result.analysis).toBeDefined();
    expect(result.analysis.validation.hasCycles).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/converter/parallel-converter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/converter/parallel-converter.ts`:

```typescript
/**
 * Enhanced plan-to-beads converter for parallel execution.
 *
 * Uses the layered dependency analyzer instead of chunk-based ordering.
 * Creates beads issues with fine-grained dependency edges.
 */

import * as fs from "node:fs/promises";
import type { PluginInput } from "@opencode-ai/plugin";
import { parsePlan } from "./parser";
import type { ParsedPlan } from "./parser";
import { buildLayeredDependencyGraph } from "./dependency-analyzer";
import type { DependencyAnalysisResult } from "./dependency-analyzer";
import {
  ensureBeadsInitialized,
  rebuildMappingFromExisting,
  createIssue,
  createChildIssue,
  addDependency,
  type TaskMapping,
} from "./beads-helpers";

type Shell = PluginInput["$"];

/** Result of the parallel conversion process */
export interface ParallelConversionResult {
  epicId: string;
  taskMapping: TaskMapping;
  plan: ParsedPlan;
  analysis: DependencyAnalysisResult;
}

/**
 * Convert a plan file to beads issues with fine-grained dependencies.
 *
 * Differs from the basic convertPlanToBeads:
 * - Uses layered dependency analysis (explicit + file overlap + chunk fallback)
 * - Aborts if dependency cycles are detected
 * - Returns the full analysis result for the orchestrator
 */
export async function convertPlanToBeadsParallel(
  planPath: string,
  $: Shell
): Promise<ParallelConversionResult> {
  await ensureBeadsInitialized($);

  const content = await fs.readFile(planPath, "utf-8");
  const plan = parsePlan(content);

  if (plan.chunks.length === 0) {
    throw new Error("Plan has no tasks to convert");
  }

  // Build fine-grained dependency graph
  const analysis = buildLayeredDependencyGraph(plan.chunks);

  // Abort on cycles
  if (analysis.validation.hasCycles) {
    const cycleStr = analysis.validation.cycles
      .map((c) => c.join(" → "))
      .join("; ");
    throw new Error(
      `Dependency cycle detected: ${cycleStr}. Fix the plan's Depends-On annotations.`
    );
  }

  // Log warnings
  for (const warn of analysis.validation.orphanWarnings) {
    console.warn(`[parallel-converter] ${warn}`);
  }
  for (const warn of analysis.validation.overConnectionWarnings) {
    console.warn(`[parallel-converter] ${warn}`);
  }

  // Check for existing parallel epic (idempotency — search for Mode: parallel to avoid
  // cross-contamination with sequential epics for the same plan path)
  const existingEpicId = await findExistingParallelEpic(planPath, $);
  if (existingEpicId) {
    const taskMapping = await rebuildMappingFromExisting(existingEpicId, $);
    return { epicId: existingEpicId, taskMapping, plan, analysis };
  }

  // Create epic
  const epicDescription = `Goal: ${plan.goal} | Plan: ${planPath} | Mode: parallel`;
  const epicId = await createIssue($, plan.title, "epic", epicDescription);

  // Create child tasks
  const taskMapping: TaskMapping = new Map();
  for (const chunk of plan.chunks) {
    for (const task of chunk.tasks) {
      const taskTitle = `Task ${task.number}: ${task.name}`;
      const taskDescription = `See ${planPath}, Task ${task.number} | Files: ${task.filesSection}`;
      const taskId = await createChildIssue($, taskTitle, epicId, taskDescription);
      taskMapping.set(task.number, taskId);
    }
  }

  // Wire fine-grained dependencies (deduplicate by unique pair)
  const wiredPairs = new Set<string>();
  for (const edge of analysis.edges) {
    const pairKey = `${edge.taskNumber}:${edge.dependsOn}`;
    if (wiredPairs.has(pairKey)) continue;
    wiredPairs.add(pairKey);

    const fromId = taskMapping.get(edge.taskNumber);
    const depId = taskMapping.get(edge.dependsOn);
    if (fromId && depId) {
      await addDependency($, fromId, depId);
    }
  }

  return { epicId, taskMapping, plan, analysis };
}

/**
 * Find existing parallel epic for idempotency.
 * Searches for "Mode: parallel" in the description to avoid matching
 * sequential epics for the same plan path.
 */
async function findExistingParallelEpic(planPath: string, $: Shell): Promise<string | null> {
  try {
    const output = await $`bd list --type epic --json`.text();
    const issues = JSON.parse(output);
    if (!Array.isArray(issues)) return null;
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
    // proceed with creation
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/converter/parallel-converter.test.ts`
Expected: All tests pass

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/converter/parallel-converter.ts tests/converter/parallel-converter.test.ts
git commit -m "feat: add parallel plan-to-beads converter with fine-grained dependencies"
```

### Task 4: Handoff Hook — Parallel Beads Option

**Depends on:** Task 3
**Files:**
- Modify: `src/hooks/detection.ts`
- Modify: `src/hooks/handoff.ts`
- Modify: `tests/hooks/detection.test.ts`
- Modify: `vendor/prompts/execution-options.md`

- [ ] **Step 1: Write the failing tests for parallel-beads detection**

Append to `tests/hooks/detection.test.ts`:

```typescript
describe("detectExecutionChoice — parallel beads", () => {
  test("detects parallel beads-driven choice", () => {
    const msg = "I'll use parallel beads-driven development for maximum throughput.";
    expect(detectExecutionChoice(msg)).toBe("parallel-beads");
  });

  test("detects parallel-beads keyword", () => {
    const msg = "Let's go with parallel-beads execution.";
    expect(detectExecutionChoice(msg)).toBe("parallel-beads");
  });

  test("parallel-beads takes priority over regular beads", () => {
    const msg = "Instead of beads-driven, let's use parallel beads-driven development.";
    expect(detectExecutionChoice(msg)).toBe("parallel-beads");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/hooks/detection.test.ts`
Expected: FAIL — "parallel-beads" not a valid ExecutionChoice

- [ ] **Step 3: Update ExecutionChoice type and detection function**

In `src/hooks/detection.ts`, update:

```typescript
/** The execution choices available at handoff */
export type ExecutionChoice = "beads" | "parallel-beads" | "subagent" | "sequential";
```

And add parallel-beads detection at the top of `detectExecutionChoice` (before regular beads):

```typescript
// Parallel beads detection (highest priority)
if (
  lower.includes("parallel beads-driven") ||
  lower.includes("parallel-beads")
) {
  return "parallel-beads";
}
```

- [ ] **Step 4: Run detection tests to verify they pass**

Run: `bun test tests/hooks/detection.test.ts`
Expected: All tests pass

- [ ] **Step 5: Update execution options template**

Replace `vendor/prompts/execution-options.md`:

```markdown
<execution-options>
Plan detected. Choose an execution strategy:

1. **Subagent-driven development** (superpowers default)
   Fresh subagent per task, two-stage review (spec compliance + code quality).
   Uses plan file for linear task ordering. Tracks progress via TodoWrite.

2. **Sequential execution** (no subagents)
   Execute all tasks in the current session using superpowers:executing-plans.
   Good for simpler plans or environments without subagent support.

3. **Beads-driven development** (requires bd CLI)
    Creates an epic + task issues in beads from the plan. Uses `bd ready` for
    task selection (respects external blockers and manual reordering).
    Primary path: native skill `super-beads:beads-driven-development`.
    Secondary path: manual alias `super-beads:execute`.
    Subagent dispatch with two-stage review. Dual tracking: beads for
    persistent state across sessions, TodoWrite for real-time session UI.

4. **Parallel beads-driven development** (requires bd CLI)
    Creates an epic + task issues in beads with fine-grained dependency
    analysis. Dispatches up to 3 tasks in parallel, each in its own git
    worktree. Tasks start as soon as their specific dependencies complete.
    Uses DAG-based branching for isolation, with a single final merge to
    the base branch after all tasks pass review.
    Skill: `super-beads:dispatch-parallel-bead-agents`.

Which approach would you like to use?
</execution-options>
```

- [ ] **Step 6: Update handoff hook for parallel-beads choice**

In `src/hooks/handoff.ts`, add the parallel-beads handling. After the existing `choice === "beads"` block (around line 93), add:

```typescript
if (choice === "parallel-beads" && state.planPath) {
  sessionState.delete(sessionID);

  // Run enhanced converter with fine-grained dependencies
  const { convertPlanToBeadsParallel } = await import(
    "../converter/parallel-converter"
  );
  const result = await convertPlanToBeadsParallel(state.planPath, $);

  const skillContent = await loadSkillTemplate(
    "dispatch-parallel-bead-agents"
  );
  const contextMessage = buildBeadsExecutionMessage({
    epicId: result.epicId,
    planPath: state.planPath,
    taskCount: result.taskMapping.size,
    skillTemplate: skillContent,
    parallel: true,
    depSummary: `${result.analysis.edges.length} dependency edges (${result.analysis.edges.filter((e) => e.source === "explicit").length} explicit, ${result.analysis.edges.filter((e) => e.source === "file-overlap").length} file-overlap, ${result.analysis.edges.filter((e) => e.source === "chunk-fallback").length} chunk-fallback)`,
  });

  await client.session.prompt({
    path: { id: sessionID },
    body: {
      noReply: true,
      model: output.message.model,
      agent: output.message.agent,
      parts: [{ type: "text", text: contextMessage, synthetic: true }],
    },
  });
  return;
}
```

- [ ] **Step 7: Update buildBeadsExecutionMessage for parallel support**

Update the `BeadsExecutionMessageInput` interface and `buildBeadsExecutionMessage` function in `src/hooks/handoff.ts`:

```typescript
interface BeadsExecutionMessageInput {
  epicId: string;
  planPath: string;
  taskCount: number;
  skillTemplate: string | null;
  parallel?: boolean;
  depSummary?: string;
}

export function buildBeadsExecutionMessage(
  input: BeadsExecutionMessageInput
): string {
  const skillName = input.parallel
    ? "dispatch-parallel-bead-agents"
    : "beads-driven-development";
  const fallbackTemplate = input.skillTemplate
    ? `\n\n<fallback-skill-template>\n${input.skillTemplate}\n</fallback-skill-template>`
    : "";
  const depLine = input.depSummary ? `Dependencies: ${input.depSummary}` : "";

  return [
    `The user chose ${input.parallel ? "parallel " : ""}beads-driven development.`,
    `Primary path: use the \`super-beads:${skillName}\` skill.`,
    `Fallback path: use the \`super-beads:${input.parallel ? "parallel-execute" : "execute"}\` command alias if the native skill is unavailable.`,
    "",
    "<beads-execution-context>",
    `Epic: ${input.epicId}`,
    `Plan: ${input.planPath}`,
    `Tasks: ${input.taskCount} issues created in beads`,
    depLine,
    `</beads-execution-context>${fallbackTemplate}`,
  ].join("\n");
}
```

- [ ] **Step 8: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 9: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/hooks/detection.ts src/hooks/handoff.ts tests/hooks/detection.test.ts vendor/prompts/execution-options.md
git commit -m "feat: add parallel beads-driven execution option to handoff hook"
```

---

## Chunk 4: Skill Content, Prompt Templates, and Plugin Wiring

Creates the dispatch-parallel-bead-agents skill file, lane and integration reviewer prompt templates, and wires everything into the plugin.

### Task 5: Dispatch-Parallel-Bead-Agents Skill File

**Depends on:** Task 4
**Files:**
- Create: `skills/dispatch-parallel-bead-agents/SKILL.md`

- [ ] **Step 1: Write the skill content**

Create `skills/dispatch-parallel-bead-agents/SKILL.md` with the following content:

````markdown
---
name: dispatch-parallel-bead-agents
description: >-
  Use when executing a plan through parallel beads task scheduling with
  DAG-based worktree isolation, fine-grained dependency analysis, and
  up to 3 concurrent implementation lanes.
---

# Dispatch Parallel Bead Agents

Execute a plan using beads as the task manager with parallel lane dispatch.
Each lane runs in its own git worktree with DAG-based branching.
Up to 3 lanes run concurrently.

## Terminology

**Base branch:** The branch checked out when execution starts (typically a feature branch, not `main`). Lane branches diverge from it and merge back at the end.

## Prerequisites

- `bd` CLI installed and available in PATH
- Beads initialized in the project (`.beads/` directory exists)
- Plan converted to beads issues with fine-grained dependencies (epic + child tasks)
- Superpowers prompt templates available (implementer-prompt.md, spec-reviewer-prompt.md, code-quality-reviewer-prompt.md)

## Initialization

Before entering the execution loop, sync session state with beads:

```
bd list --parent <epic-id> --json
  -> for each issue:
      status=closed      -> TodoWrite: completed
                            PRESERVE lane branch (DAG backbone)
      status=in_progress -> TodoWrite: in_progress
                            Ask user: "Task X was in progress. Continue or restart?"
                            Only clean up branch if user chooses "restart"
      status=blocked     -> TodoWrite: pending (annotate "blocked by <dep-id>")
      status=open        -> TodoWrite: pending
                            Clean up any stale worktrees for open beads
```

Additionally:
- Verify worktree directory is set up (follow using-git-worktrees conventions)
- Build dependency graph from beads: `bd dep tree <epic-id>`
- If a completed task's lane branch is missing, reopen the bead (`bd reopen <id>`)

## Core Loop

```
Loop:
  +-> bd ready --json
  |   +- No tasks ready + all closed -> COMPLETION (below)
  |   +- No tasks ready + some open  -> BLOCKED -> show `bd list --status blocked`, report & pause
  |   +- Tasks available -> select up to 3 (MAX_LANES) ready tasks
  |
  |   For each selected task:
  |     bd update <id> --claim
  |     TodoWrite: mark in_progress
  |     Create worktree with DAG branching (see below)
  |
  |   Dispatch all lanes in parallel (each as a single Task subagent)
  |   Each lane runs: Implement → Spec review → Code quality review
  |   (See lane prompt template for details)
  |
  |   Wait for all lanes to complete (batch semantics)
  |
  |   For each completed lane:
  |     DONE -> bd close <id>, TodoWrite: mark completed
  |     BLOCKED -> bd update <id> --status blocked, TodoWrite: mark pending
  |     FAILED -> escalate to user, bead stays in_progress
  |     NEEDS_CONTEXT -> provide context, re-dispatch (max 3 round-trips)
  |
  |   Loop back to bd ready (newly unblocked tasks may be available)
  +---loop

Completion (after all tasks closed):
  Topological merge of all lane branches → integration branch (from base branch HEAD)
  Final integration review (full diff)
  Final code review (advisory, follows requesting-code-review skill)
  Merge integration branch → base branch
  bd close <epic-id> --reason "All tasks completed"
  Cleanup all worktrees, lane branches, temp-base branches
  Invoke finishing-a-development-branch
```

Graceful degradation: when only 1 task is ready, skip worktree overhead and run in-place (same as beads-driven-development). If execution starts in-place and later 2+ tasks become ready, commit in-place work and create a lane branch before branching parallel worktrees.

## DAG-Based Worktree Branching

Each task's worktree branches from the state that includes its dependencies' completed work. The base branch is NEVER touched during execution.

| Dependencies | Branch from |
|---|---|
| No deps | HEAD of base branch |
| 1 dep | That dep's completed lane branch |
| N deps | Temporary merge branch of all dep lane branches |

Creating a worktree for a task with no deps:

```bash
git worktree add <worktree-dir>/lane-<bead-id> -b lane/<bead-id>
```

Creating a worktree for a task with 1 dep (e.g., depends on Task A):

```bash
git worktree add <worktree-dir>/lane-<bead-id> -b lane/<bead-id> lane/<dep-bead-id>
```

Creating a worktree for a task with N deps (e.g., depends on Tasks B and C):

```bash
git checkout -b temp-base/<bead-id> lane/<dep-B-bead-id>
git merge lane/<dep-C-bead-id> --no-ff -m "Merge deps for task (B+C)"
git worktree add <worktree-dir>/lane-<bead-id> -b lane/<bead-id> temp-base/<bead-id>
```

If the dependency merge conflicts, dispatch a conflict resolution agent. If unresolvable after 3 attempts, escalate to user. This usually indicates a missing dependency edge.

After creating each worktree, run project setup (auto-detect: npm install, cargo build, etc.) and verify clean baseline (tests pass) before dispatching the lane.

## Lane Execution

Each lane is dispatched as a single Task subagent running all three pipeline stages within one session:

1. **Implement** using implementer-prompt.md criteria
2. **Spec review** using spec-reviewer-prompt.md criteria (max 3 fix/re-review iterations)
3. **Code quality review** using code-quality-reviewer-prompt.md criteria (max 3 iterations)

The lane prompt provides: full task spec text (inline, never make subagent read plan file), context about where the task fits, worktree path, review criteria.

### NEEDS_CONTEXT Handling

- Attempt 1-2: Lane subagent self-resolves by reading files in its worktree
- Attempt 3: Returns NEEDS_CONTEXT with: what it needs, pipeline stage reached, work summary
- Orchestrator re-dispatches with: requested context, previous status, stage to resume, note about partial work in worktree
- After 3 orchestrator-level round-trips: mark FAILED, escalate to user

## Task Spec Provisioning

Before dispatching, resolve each task's full text:
1. Check task-number-to-bead-id mapping (from plan conversion)
2. If mapped: read full spec from plan file by task number, provide inline
3. If ad-hoc: use bead description directly

## Final Merge to Base Branch

After ALL tasks complete, merge everything via an integration branch:

1. Create integration branch from base branch HEAD
2. Merge each lane branch in topological order (deps before dependents)
3. Run final integration review on full diff (integration vs HEAD)
4. If issues: fix agent → re-review (max 3 iterations, then escalate)
5. Fast-forward base branch to integration (or merge if base has diverged — escalate to user for external changes)
6. Cleanup: remove all worktrees, lane branches, temp-base branches

## Dual Tracking Protocol

| Event | Beads | TodoWrite |
|---|---|---|
| Task dispatched to lane | `bd update <id> --claim` | Mark in_progress |
| Lane returns BLOCKED | `bd update <id> --status blocked` | Mark pending + reason |
| Lane returns FAILED | Stays `in_progress` (user decides) | Mark pending + "FAILED: reason" |
| Lane passes all reviews | `bd close <id>` | Mark completed |
| All tasks closed | (proceed to final merge) | All completed |
| Final merge passes | `bd close <epic-id>` | (all already completed) |

If beads and TodoWrite disagree, beads wins. TodoWrite re-syncs from `bd list` periodically.

## Model Selection

- Cheap/fast: Mechanical tasks (isolated functions, clear specs, 1-2 files)
- Standard: Integration tasks (multi-file, pattern matching)
- Most capable: Architecture, design, review, integration review, merge conflict resolution

## Error Handling

- `bd ready` error: retry once, then report and pause
- `bd close` error: log warning, continue
- Lane BLOCKED: update bead, continue with remaining lanes
- Lane FAILED: escalate to user
- Dependency merge conflict: resolution agent, max 3 attempts, then escalate
- Final merge conflict: resolution agent per step, escalate if unresolvable
- Worktree creation failure: fall back to sequential for this task
- Dependency cycle during conversion: abort, report to user
- Tracking failures never block code. Code failures always stop the lane.
- Cleanup failures: log warning, continue (stale worktrees cleaned manually)

## Red Flags

**Never:**
- Merge anything into the base branch during execution (only at the very end)
- Skip reviews (spec or code quality) in any lane
- Skip the final integration review
- Proceed with unfixed merge or integration issues
- Dispatch more than MAX_LANES (3) concurrent lanes
- Make subagents read the plan file (provide full text)
- Create a task's worktree from base branch HEAD when it has dependencies
- Run lane subagents in the base branch worktree when parallel lanes are active
- Delete a completed task's lane branch before the final merge
- Skip dependency cycle validation during conversion
````

- [ ] **Step 2: Commit**

```bash
git add skills/dispatch-parallel-bead-agents/SKILL.md
git commit -m "feat: add dispatch-parallel-bead-agents skill with DAG-based parallel execution engine"
```

### Task 6: Lane Prompt Template

**Files:**
- Create: `vendor/prompts/lane-prompt.md`

- [ ] **Step 1: Write the lane prompt template**

Create `vendor/prompts/lane-prompt.md`:

```markdown
# Lane Subagent Prompt

You are a lane subagent executing a single task within a parallel execution pipeline.
You are working in your own isolated git worktree — commit freely to your branch.

## Your Task

[TASK_SPEC]

## Context

[TASK_CONTEXT]

Working in worktree: [WORKTREE_PATH]
Branch: [BRANCH_NAME]

## Pipeline

Execute these three stages in order within this session:

### Stage 1: Implement

Follow the task spec exactly. Write tests first (TDD). Commit after each meaningful unit.

If you encounter ambiguity:
- Attempt 1-2: Self-resolve by reading relevant source files, tests, and docs in the codebase.
- Attempt 3: Return NEEDS_CONTEXT with what you need.

### Stage 2: Spec Compliance Review

After implementation, review your own work against the task spec:

[SPEC_REVIEW_CRITERIA]

If issues found: fix and re-review (max 3 iterations).

### Stage 3: Code Quality Review

Only after spec compliance passes:

[CODE_QUALITY_CRITERIA]

If issues found: fix and re-review (max 3 iterations).

## Report Format

Return a structured report:

**Status:** DONE / DONE_WITH_CONCERNS / BLOCKED / FAILED / NEEDS_CONTEXT

**Pipeline stage reached:** implement / spec-review / code-quality-review

**Files changed:**
- [list all modified/created files]

**Test results:** [pass/fail summary]

**Spec review:** [verdict]

**Code quality review:** [verdict]

**Concerns:** [any issues noted]

**If NEEDS_CONTEXT:** [what you need and why]
```

- [ ] **Step 2: Commit**

```bash
git add vendor/prompts/lane-prompt.md
git commit -m "feat: add lane subagent prompt template for parallel execution"
```

### Task 7: Integration Reviewer Prompt Template

**Files:**
- Create: `vendor/prompts/integration-reviewer.md`

- [ ] **Step 1: Write the integration reviewer template**

Create `vendor/prompts/integration-reviewer.md`:

```markdown
# Integration Reviewer Prompt

You are reviewing the merged result of multiple parallel implementation lanes.
Each lane was implemented and reviewed independently. Your job is to catch
cross-lane issues that individual reviews couldn't see.

## What Was Implemented

[LANE_SUMMARIES]

## Merged Diff

[MERGED_DIFF_OR_INSTRUCTIONS]

## Check For

1. **Semantic conflicts:** Did two lanes modify related interfaces in incompatible ways?
2. **Import/dependency issues:** Did one lane add a dependency another removed?
3. **Duplicate code:** Did two lanes implement similar utilities independently?
4. **Test interference:** Do tests from one lane break assumptions of another?
5. **Merge conflict residue:** Are there any leftover conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)?
6. **Inconsistent naming:** Did lanes use different conventions for the same concept?

## Report Format

**Status:** Approved / Issues Found

**Issues (if any):**
- [file:line]: [specific issue] - [which lanes are involved] - [suggested fix]

**Recommendations (advisory):**
- [suggestions that don't block approval]
```

- [ ] **Step 2: Commit**

```bash
git add vendor/prompts/integration-reviewer.md
git commit -m "feat: add integration reviewer prompt template for post-merge review"
```

### Task 8: Plugin Wiring and Skill Installation

**Depends on:** Task 5, Task 6, Task 7
**Files:**
- Modify: `src/skills/install.ts`
- Modify: `src/plugin.ts`

- [ ] **Step 1: Add new skill to BUNDLED_SKILLS**

In `src/skills/install.ts`, update:

```typescript
const BUNDLED_SKILLS: string[] = [
  "beads-driven-development",
  "dispatch-parallel-bead-agents",
];
```

- [ ] **Step 2: Register new command alias in plugin.ts**

In `src/plugin.ts`, after loading the existing skill template, load the parallel skill:

```typescript
const parallelSkillContent = await loadSkillTemplate("dispatch-parallel-bead-agents");
```

And in the config callback, register the additional command (preserving existing null guards):

```typescript
const commands: Record<string, { description: string; template: string }> = {
  ...config.command,
};

if (skillContent) {
  commands["super-beads:execute"] = {
    description: "Execute a plan using beads-driven development (bd ready loop + subagent dispatch)",
    template: skillContent,
  };
}

if (parallelSkillContent) {
  commands["super-beads:parallel-execute"] = {
    description: "Execute a plan using parallel beads-driven development (DAG worktrees + parallel lanes)",
    template: parallelSkillContent,
  };
}

config.command = commands;
```

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/skills/install.ts src/plugin.ts
git commit -m "feat: wire dispatch-parallel-bead-agents into plugin and skill installation"
```

---

## Chunk 5: Final Verification

### Task 9: Full Verification

**Depends on:** Task 8
**Files:** (none — verification only)

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass, zero failures

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Verify clean git status**

Run: `git status`
Expected: Clean working tree, all changes committed

- [ ] **Step 4: Verify file structure**

Run: `ls -la src/converter/ skills/ vendor/prompts/`
Expected:
- `src/converter/` has: `parser.ts`, `plan-to-beads.ts`, `dependency-analyzer.ts`, `parallel-converter.ts`
- `skills/` has: `beads-driven-development/SKILL.md`, `dispatch-parallel-bead-agents/SKILL.md`
- `vendor/prompts/` has: `execution-options.md`, `lane-prompt.md`, `integration-reviewer.md`
