# opencode-super-beads Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an OpenCode plugin that bridges superpowers' workflow with beads' task management, adding beads-driven development as a third execution path.

**Architecture:** An OpenCode plugin (`@opencode-ai/plugin`) with three components: a `chat.message` hook that intercepts plan completion and offers execution choices, a plan-to-beads converter that parses plan markdown and creates bead issues with dependencies, and a packaged native skill (`skills/beads-driven-development/SKILL.md`) containing the full execution engine loop.

**Tech Stack:** TypeScript, Bun runtime, `@opencode-ai/plugin` SDK, `@opencode-ai/sdk`, `bd` CLI (beads)

**Spec:** `docs/superpowers/specs/2026-03-23-opencode-super-beads-design.md`

---

## Chunk 1: Project Scaffolding & Vendor Layer

Sets up the project infrastructure and the vendor file loader. After this chunk, the project builds, tests run, and markdown files can be loaded from `vendor/`.

### Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "opencode-super-beads",
  "version": "0.1.0",
  "type": "module",
  "description": "OpenCode plugin bridging superpowers workflow with beads task management",
  "author": "",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/rbarriga/opencode-super-beads"
  },
  "keywords": [
    "opencode",
    "plugin",
    "beads",
    "superpowers",
    "agent"
  ],
  "main": "src/plugin.ts",
  "files": ["src", "vendor", "README.md"],
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "test:unit": "bun test tests/"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.0.143",
    "@opencode-ai/sdk": "^1.0.143"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/node": "^22.0.0",
    "typescript": "~5.9.3"
  },
  "engines": {
    "bun": ">=1.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  }
}
```

- [ ] **Step 3: Update .gitignore**

Append to existing `.gitignore`:

```
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 4: Install dependencies**

Run: `bun install`
Expected: Dependencies installed, `bun.lockb` created

- [ ] **Step 5: Verify typecheck passes**

Run: `bun run typecheck`
Expected: No errors (no source files yet, but config is valid)

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore bun.lockb
git commit -m "chore: initialize project with package.json and tsconfig"
```

### Task 2: Vendor File Loader

**Files:**
- Create: `src/vendor.ts`
- Create: `vendor/skills/beads-driven-development.md` (placeholder)
- Create: `vendor/prompts/execution-options.md` (placeholder)
- Test: `tests/vendor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/vendor.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { loadSkill, loadPrompt } from "../src/vendor";

describe("vendor", () => {
  describe("loadSkill", () => {
    test("loads beads-driven-development skill content", async () => {
      const content = await loadSkill("beads-driven-development");
      expect(content).not.toBeNull();
      expect(content).toContain("beads-driven-development");
    });

    test("returns null for non-existent skill", async () => {
      const content = await loadSkill("non-existent-skill");
      expect(content).toBeNull();
    });
  });

  describe("loadPrompt", () => {
    test("loads execution-options prompt", async () => {
      const content = await loadPrompt("execution-options");
      expect(content).not.toBeNull();
      expect(content).toContain("execution");
    });

    test("returns null for non-existent prompt", async () => {
      const content = await loadPrompt("non-existent");
      expect(content).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/vendor.test.ts`
Expected: FAIL -- module `../src/vendor` not found

- [ ] **Step 3: Create placeholder vendor files**

Create `vendor/skills/beads-driven-development.md`:

```markdown
# beads-driven-development

Placeholder -- full content will be added in Chunk 5.
```

Create `vendor/prompts/execution-options.md`:

```markdown
Placeholder -- full execution options template will be added in Chunk 5.
```

- [ ] **Step 4: Write minimal implementation**

Create `src/vendor.ts`:

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/vendor.test.ts`
Expected: 4 tests pass

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/vendor.ts vendor/ tests/vendor.test.ts
git commit -m "feat: add vendor file loader for skills and prompts"
```

---

## Chunk 2: Plan Parser

Pure functions that parse a superpowers plan markdown file into structured data. No side effects, no `bd` CLI calls. This is the foundation the converter builds on.

### Task 3: Plan Parser Core

**Files:**
- Create: `src/converter/parser.ts`
- Create: `tests/converter/parser.test.ts`
- Create: `tests/fixtures/sample-plan.md`

- [ ] **Step 1: Create the test fixture**

Create `tests/fixtures/sample-plan.md`:

```markdown
# Auth System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authentication system with JWT tokens

**Architecture:** Express middleware with JWT validation and role-based access control

**Tech Stack:** TypeScript, Express, jsonwebtoken

---

## Chunk 1: Core Auth

### Task 1: JWT Token Service

**Files:**
- Create: `src/auth/token.ts`
- Test: `tests/auth/token.test.ts`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Implement token service**

- [ ] **Step 3: Commit**

### Task 2: Auth Middleware

**Files:**
- Create: `src/auth/middleware.ts`
- Modify: `src/app.ts:15-20`
- Test: `tests/auth/middleware.test.ts`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Implement middleware**

- [ ] **Step 3: Commit**

## Chunk 2: Role-Based Access

### Task 3: Role Definitions

**Files:**
- Create: `src/auth/roles.ts`
- Test: `tests/auth/roles.test.ts`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Implement roles**

- [ ] **Step 3: Commit**

### Task 4: Permission Guard

**Files:**
- Create: `src/auth/guard.ts`
- Modify: `src/auth/middleware.ts:30-45`
- Test: `tests/auth/guard.test.ts`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Implement guard**

- [ ] **Step 3: Commit**
```

- [ ] **Step 2: Write the failing tests**

Create `tests/converter/parser.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parsePlan } from "../../src/converter/parser";
import type { ParsedPlan } from "../../src/converter/parser";

const FIXTURE_PATH = path.join(import.meta.dir, "..", "fixtures", "sample-plan.md");

describe("parsePlan", () => {
  let planContent: string;

  test("fixture file exists", async () => {
    planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    expect(planContent.length).toBeGreaterThan(0);
  });

  test("extracts plan title", async () => {
    planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    expect(result.title).toBe("Auth System Implementation Plan");
  });

  test("extracts goal", async () => {
    planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    expect(result.goal).toBe("Build an authentication system with JWT tokens");
  });

  test("extracts chunks", async () => {
    planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0]!.name).toBe("Core Auth");
    expect(result.chunks[1]!.name).toBe("Role-Based Access");
  });

  test("extracts tasks within chunks", async () => {
    planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    expect(result.chunks[0]!.tasks).toHaveLength(2);
    expect(result.chunks[0]!.tasks[0]!.number).toBe(1);
    expect(result.chunks[0]!.tasks[0]!.name).toBe("JWT Token Service");
    expect(result.chunks[0]!.tasks[1]!.number).toBe(2);
    expect(result.chunks[0]!.tasks[1]!.name).toBe("Auth Middleware");
    expect(result.chunks[1]!.tasks).toHaveLength(2);
    expect(result.chunks[1]!.tasks[0]!.number).toBe(3);
    expect(result.chunks[1]!.tasks[1]!.number).toBe(4);
  });

  test("extracts files section from tasks", async () => {
    planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    const task1 = result.chunks[0]!.tasks[0]!;
    expect(task1.filesSection).toContain("src/auth/token.ts");
    expect(task1.filesSection).toContain("tests/auth/token.test.ts");
  });

  test("captures full task content", async () => {
    planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    const task1 = result.chunks[0]!.tasks[0]!;
    expect(task1.fullContent).toContain("JWT Token Service");
    expect(task1.fullContent).toContain("Step 1");
    expect(task1.fullContent).toContain("Step 3: Commit");
  });

  test("returns total task count", async () => {
    planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    const totalTasks = result.chunks.reduce((sum, c) => sum + c.tasks.length, 0);
    expect(totalTasks).toBe(4);
  });

  test("handles plan with no chunks (all tasks at top level)", () => {
    const noChunkPlan = `# Simple Plan

**Goal:** Do something simple

---

### Task 1: Only Task

**Files:**
- Create: \`src/thing.ts\`

- [ ] **Step 1: Do it**
`;
    const result = parsePlan(noChunkPlan);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]!.name).toBe("default");
    expect(result.chunks[0]!.tasks).toHaveLength(1);
  });

  test("skips empty chunks (heading with no tasks)", () => {
    const emptyChunkPlan = `# Plan

**Goal:** Test empty chunks

---

## Chunk 1: Has Tasks

### Task 1: Real Task

- [ ] **Step 1: Do it**

## Chunk 2: Empty

## Chunk 3: Also Has Tasks

### Task 2: Another Task

- [ ] **Step 1: Do it**
`;
    const result = parsePlan(emptyChunkPlan);
    // Empty chunk is ignored
    const nonEmptyChunks = result.chunks.filter(c => c.tasks.length > 0);
    expect(nonEmptyChunks).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/converter/parser.test.ts`
Expected: FAIL -- module `../../src/converter/parser` not found

- [ ] **Step 4: Write the implementation**

Create `src/converter/parser.ts`:

```typescript
/**
 * Plan document parser.
 *
 * Parses a superpowers plan markdown file into structured data.
 * Pure functions only -- no side effects, no CLI calls.
 */

/** A single task extracted from a plan */
export interface ParsedTask {
  /** Task number (from "### Task N: Name") */
  number: number;
  /** Task name (from "### Task N: Name") */
  name: string;
  /** The **Files:** section content */
  filesSection: string;
  /** The full task content (everything from ### Task N to the next ### or ##) */
  fullContent: string;
}

/** A chunk grouping tasks */
export interface ParsedChunk {
  /** Chunk name (from "## Chunk N: Name"), or "default" if no chunks */
  name: string;
  /** Chunk number (1-indexed), or 0 for the default chunk */
  chunkNumber: number;
  /** Tasks within this chunk */
  tasks: ParsedTask[];
}

/** The parsed plan structure */
export interface ParsedPlan {
  /** Plan title (from "# Title") */
  title: string;
  /** Goal (from "**Goal:** ...") */
  goal: string;
  /** Chunks with their tasks */
  chunks: ParsedChunk[];
}

/**
 * Parse a superpowers plan markdown string into structured data.
 *
 * Handles:
 * - Plans with "## Chunk N: Name" groupings
 * - Plans without chunks (all tasks collected into a "default" chunk)
 * - Empty chunks (ignored)
 *
 * @param content - The raw markdown content of the plan file
 * @returns Parsed plan structure
 */
export function parsePlan(content: string): ParsedPlan {
  const title = extractTitle(content);
  const goal = extractGoal(content);
  const chunks = extractChunks(content);

  return { title, goal, chunks };
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function extractGoal(content: string): string {
  const match = content.match(/\*\*Goal:\*\*\s*(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function extractChunks(content: string): ParsedChunk[] {
  const chunkRegex = /^##\s+Chunk\s+(\d+):\s*(.+)$/gm;
  const chunkMatches = [...content.matchAll(chunkRegex)];

  // No chunk headings: collect all tasks into a default chunk
  if (chunkMatches.length === 0) {
    const tasks = extractTasks(content);
    if (tasks.length === 0) return [];
    return [{ name: "default", chunkNumber: 0, tasks }];
  }

  const chunks: ParsedChunk[] = [];

  for (let i = 0; i < chunkMatches.length; i++) {
    const match = chunkMatches[i]!;
    const chunkNumber = parseInt(match[1]!, 10);
    const chunkName = match[2]!.trim();

    // Get content between this chunk heading and the next chunk heading (or end)
    const startIndex = match.index! + match[0].length;
    const nextMatch = chunkMatches[i + 1];
    const endIndex = nextMatch ? nextMatch.index! : content.length;
    const chunkContent = content.slice(startIndex, endIndex);

    const tasks = extractTasks(chunkContent);
    chunks.push({ name: chunkName, chunkNumber, tasks });
  }

  // Filter out empty chunks
  return chunks.filter(c => c.tasks.length > 0);
}

function extractTasks(content: string): ParsedTask[] {
  const taskRegex = /^###\s+Task\s+(\d+):\s*(.+)$/gm;
  const taskMatches = [...content.matchAll(taskRegex)];

  if (taskMatches.length === 0) return [];

  const tasks: ParsedTask[] = [];

  for (let i = 0; i < taskMatches.length; i++) {
    const match = taskMatches[i]!;
    const number = parseInt(match[1]!, 10);
    const name = match[2]!.trim();

    // Get content between this task heading and the next task/chunk heading (or end)
    const startIndex = match.index!;
    const nextMatch = taskMatches[i + 1];
    const endIndex = nextMatch ? nextMatch.index! : content.length;
    const fullContent = content.slice(startIndex, endIndex).trim();

    const filesSection = extractFilesSection(fullContent);

    tasks.push({ number, name, filesSection, fullContent });
  }

  return tasks;
}

function extractFilesSection(taskContent: string): string {
  const filesMatch = taskContent.match(
    /\*\*Files:\*\*\s*\n((?:\s*-\s+.+\n?)+)/
  );
  return filesMatch?.[1]?.trim() ?? "";
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/converter/parser.test.ts`
Expected: All tests pass

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/converter/parser.ts tests/converter/parser.test.ts tests/fixtures/sample-plan.md
git commit -m "feat: add plan markdown parser with full test coverage"
```

### Task 4: Dependency Graph Builder

**Files:**
- Modify: `src/converter/parser.ts`
- Modify: `tests/converter/parser.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/converter/parser.test.ts`:

```typescript
import { buildDependencyGraph } from "../../src/converter/parser";
import type { DependencyEdge } from "../../src/converter/parser";

describe("buildDependencyGraph", () => {
  test("no dependencies within the same chunk", async () => {
    const planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(planContent);
    const edges = buildDependencyGraph(plan.chunks);

    // Tasks 1 and 2 are in Chunk 1 -- no edges between them
    const chunk1Edges = edges.filter(
      (e) =>
        (e.taskNumber === 1 && e.dependsOn === 2) ||
        (e.taskNumber === 2 && e.dependsOn === 1)
    );
    expect(chunk1Edges).toHaveLength(0);
  });

  test("cross-chunk dependencies: chunk 2 tasks depend on all chunk 1 tasks", async () => {
    const planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(planContent);
    const edges = buildDependencyGraph(plan.chunks);

    // Task 3 (chunk 2) should depend on tasks 1 and 2 (chunk 1)
    const task3Deps = edges
      .filter((e) => e.taskNumber === 3)
      .map((e) => e.dependsOn)
      .sort();
    expect(task3Deps).toEqual([1, 2]);

    // Task 4 (chunk 2) should also depend on tasks 1 and 2 (chunk 1)
    const task4Deps = edges
      .filter((e) => e.taskNumber === 4)
      .map((e) => e.dependsOn)
      .sort();
    expect(task4Deps).toEqual([1, 2]);
  });

  test("no dependencies for single-chunk plans", () => {
    const singleChunk: ParsedChunk[] = [
      {
        name: "default",
        chunkNumber: 0,
        tasks: [
          { number: 1, name: "A", filesSection: "", fullContent: "" },
          { number: 2, name: "B", filesSection: "", fullContent: "" },
        ],
      },
    ];
    const edges = buildDependencyGraph(singleChunk);
    expect(edges).toHaveLength(0);
  });

  test("three chunks create correct dependency chain", () => {
    const threeChunks: ParsedChunk[] = [
      {
        name: "Setup",
        chunkNumber: 1,
        tasks: [{ number: 1, name: "A", filesSection: "", fullContent: "" }],
      },
      {
        name: "Core",
        chunkNumber: 2,
        tasks: [{ number: 2, name: "B", filesSection: "", fullContent: "" }],
      },
      {
        name: "Polish",
        chunkNumber: 3,
        tasks: [{ number: 3, name: "C", filesSection: "", fullContent: "" }],
      },
    ];
    const edges = buildDependencyGraph(threeChunks);

    // Task 2 depends on Task 1
    expect(edges).toContainEqual({ taskNumber: 2, dependsOn: 1 });
    // Task 3 depends on Task 2 (not Task 1 -- only previous chunk)
    expect(edges).toContainEqual({ taskNumber: 3, dependsOn: 2 });
    // Task 3 does NOT depend on Task 1 directly
    // (beads resolves transitive deps: 3->2->1, so direct 3->1 edge is unnecessary)
    expect(edges).not.toContainEqual({ taskNumber: 3, dependsOn: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/converter/parser.test.ts`
Expected: FAIL -- `buildDependencyGraph` and `DependencyEdge` not found in module

- [ ] **Step 3: Write the implementation**

Add to `src/converter/parser.ts`:

```typescript
/** A dependency edge: taskNumber depends on dependsOn */
export interface DependencyEdge {
  taskNumber: number;
  dependsOn: number;
}

/**
 * Build the dependency graph between tasks based on chunk ordering.
 *
 * Rules:
 * - Tasks within the same chunk have NO dependencies (can run in parallel)
 * - Tasks in chunk N+1 depend on ALL tasks in chunk N completing
 * - Tasks do NOT transitively depend on earlier chunks (only the immediately previous chunk)
 *
 * @param chunks - Parsed chunks with their tasks
 * @returns Array of dependency edges
 */
export function buildDependencyGraph(chunks: ParsedChunk[]): DependencyEdge[] {
  const edges: DependencyEdge[] = [];

  for (let i = 1; i < chunks.length; i++) {
    const currentChunk = chunks[i]!;
    const previousChunk = chunks[i - 1]!;

    for (const task of currentChunk.tasks) {
      for (const dep of previousChunk.tasks) {
        edges.push({ taskNumber: task.number, dependsOn: dep.number });
      }
    }
  }

  return edges;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/converter/parser.test.ts`
Expected: All tests pass

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/converter/parser.ts tests/converter/parser.test.ts
git commit -m "feat: add dependency graph builder for chunk-based task ordering"
```

---

## Chunk 3: Handoff Detection

Pure functions for detecting plan completion messages and user choice signals. No OpenCode SDK calls -- those go in the hook implementation (Chunk 4).

### Task 5: Plan Completion Detection

**Files:**
- Create: `src/hooks/detection.ts`
- Create: `tests/hooks/detection.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks/detection.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  isPlanCompletionMessage,
  extractPlanPath,
} from "../../src/hooks/detection";

describe("isPlanCompletionMessage", () => {
  test("matches standard writing-plans completion message", () => {
    const msg =
      'Plan complete and saved to `docs/superpowers/plans/2026-03-23-auth-system.md`. Ready to execute?';
    expect(isPlanCompletionMessage(msg)).toBe(true);
  });

  test("matches with different plan path", () => {
    const msg =
      "Plan complete and saved to `docs/superpowers/plans/my-feature.md`. Ready to execute?";
    expect(isPlanCompletionMessage(msg)).toBe(true);
  });

  test("case-insensitive match on ready to execute", () => {
    const msg =
      "Plan complete and saved to `docs/superpowers/plans/feature.md`. READY TO EXECUTE?";
    expect(isPlanCompletionMessage(msg)).toBe(true);
  });

  test("rejects message with plan path but no ready to execute", () => {
    const msg =
      "I wrote the plan to `docs/superpowers/plans/feature.md`. Let me know what you think.";
    expect(isPlanCompletionMessage(msg)).toBe(false);
  });

  test("rejects message with ready to execute but no plan path", () => {
    const msg = "The code is ready to execute now.";
    expect(isPlanCompletionMessage(msg)).toBe(false);
  });

  test("rejects unrelated message", () => {
    const msg = "I fixed the bug in the authentication module.";
    expect(isPlanCompletionMessage(msg)).toBe(false);
  });

  test("matches with custom plan path pattern", () => {
    const msg =
      'Plan saved to `plans/my-plan.md`. Ready to execute?';
    expect(isPlanCompletionMessage(msg, "plans/*.md")).toBe(true);
  });
});

describe("extractPlanPath", () => {
  test("extracts plan path from completion message", () => {
    const msg =
      "Plan complete and saved to `docs/superpowers/plans/2026-03-23-auth.md`. Ready to execute?";
    expect(extractPlanPath(msg)).toBe(
      "docs/superpowers/plans/2026-03-23-auth.md"
    );
  });

  test("extracts first matching .md path", () => {
    const msg =
      "See `docs/superpowers/plans/feature.md` for details. Ready to execute?";
    expect(extractPlanPath(msg)).toBe("docs/superpowers/plans/feature.md");
  });

  test("returns null when no plan path found", () => {
    const msg = "No plan path here. Ready to execute?";
    expect(extractPlanPath(msg)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/hooks/detection.test.ts`
Expected: FAIL -- module not found

- [ ] **Step 3: Write the implementation**

Create `src/hooks/detection.ts`:

```typescript
/**
 * Detection functions for handoff interception.
 *
 * Pure functions that analyze message text for plan completion
 * and execution choice signals. No side effects.
 */

/** Default glob pattern for plan file paths */
const DEFAULT_PLAN_PATTERN = "docs/superpowers/plans/*.md";

/**
 * Convert a simple glob pattern (with * wildcard) to a regex pattern.
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]+");
  return new RegExp(escaped);
}

/**
 * Check if a message indicates plan completion.
 *
 * Requires BOTH conditions (case-insensitive substring match):
 * 1. Contains a file path matching the plan pattern
 * 2. Contains "ready to execute"
 *
 * @param message - The assistant message text
 * @param planPattern - Glob pattern for plan paths (default: docs/superpowers/plans/*.md)
 * @returns true if the message is a plan completion signal
 */
export function isPlanCompletionMessage(
  message: string,
  planPattern: string = DEFAULT_PLAN_PATTERN
): boolean {
  const hasReadyToExecute = /ready to execute/i.test(message);
  const pathRegex = globToRegex(planPattern);
  const hasPlanPath = pathRegex.test(message);

  return hasReadyToExecute && hasPlanPath;
}

/**
 * Extract the plan file path from a message.
 *
 * Looks for backtick-quoted .md paths matching the plan directory pattern.
 * Falls back to any backtick-quoted .md path if no pattern match.
 *
 * @param message - The message text to search
 * @param planPattern - Glob pattern to prefer (default: docs/superpowers/plans/*.md)
 * @returns The extracted path, or null if not found
 */
export function extractPlanPath(
  message: string,
  planPattern: string = DEFAULT_PLAN_PATTERN
): string | null {
  // Find all backtick-quoted .md paths
  const backtickMatches = [...message.matchAll(/`([^`]+\.md)`/g)];

  // Prefer paths matching the plan pattern
  const patternRegex = globToRegex(planPattern);
  for (const match of backtickMatches) {
    if (match[1] && patternRegex.test(match[1])) {
      return match[1];
    }
  }

  // Fall back to first backtick-quoted .md path
  if (backtickMatches[0]?.[1]) return backtickMatches[0][1];

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/hooks/detection.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/hooks/detection.ts tests/hooks/detection.test.ts
git commit -m "feat: add plan completion detection with pattern matching"
```

### Task 6: Choice Detection

**Files:**
- Modify: `src/hooks/detection.ts`
- Modify: `tests/hooks/detection.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/hooks/detection.test.ts`:

```typescript
import { detectExecutionChoice, type ExecutionChoice } from "../../src/hooks/detection";

describe("detectExecutionChoice", () => {
  test("detects beads-driven choice", () => {
    const msg =
      "I'll use beads-driven development for this. Let me start by creating the issues.";
    expect(detectExecutionChoice(msg)).toBe("beads");
  });

  test("detects beads keyword combination", () => {
    const msg = "Let's go with beads for execution of this plan.";
    expect(detectExecutionChoice(msg)).toBe("beads");
  });

  test("detects subagent-driven choice", () => {
    const msg =
      "I'll use subagent-driven development to execute this plan.";
    expect(detectExecutionChoice(msg)).toBe("subagent");
  });

  test("detects superpowers:subagent-driven-development reference", () => {
    const msg =
      "Using superpowers:subagent-driven-development as required.";
    expect(detectExecutionChoice(msg)).toBe("subagent");
  });

  test("detects sequential/executing-plans choice", () => {
    const msg =
      "I'll execute this plan sequentially using executing-plans.";
    expect(detectExecutionChoice(msg)).toBe("sequential");
  });

  test("returns null for unrelated messages", () => {
    const msg = "That sounds good. Let me start implementing the first task.";
    expect(detectExecutionChoice(msg)).toBeNull();
  });

  test("beads takes priority when multiple signals present", () => {
    const msg =
      "Instead of subagent-driven, let's use beads-driven development.";
    expect(detectExecutionChoice(msg)).toBe("beads");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/hooks/detection.test.ts`
Expected: FAIL -- `detectExecutionChoice` not found in module

- [ ] **Step 3: Write the implementation**

Add to `src/hooks/detection.ts`:

```typescript
/** The three execution choices available at handoff */
export type ExecutionChoice = "beads" | "subagent" | "sequential";

/**
 * Detect which execution path the user/LLM chose from an assistant message.
 *
 * Detection rules (case-insensitive substring match):
 * - "beads-driven" OR ("beads" + "execution") → "beads"
 * - "subagent-driven" OR "subagent-driven-development" → "subagent"
 * - "sequential" OR "executing-plans" → "sequential"
 * - No clear match → null (let conversation continue naturally)
 *
 * Beads takes priority if multiple signals are present.
 *
 * @param message - The assistant message text
 * @returns The detected choice, or null if no clear signal
 */
export function detectExecutionChoice(
  message: string
): ExecutionChoice | null {
  const lower = message.toLowerCase();

  // Beads detection (highest priority)
  if (
    lower.includes("beads-driven") ||
    (lower.includes("beads") && lower.includes("execution"))
  ) {
    return "beads";
  }

  // Subagent detection
  if (
    lower.includes("subagent-driven") ||
    lower.includes("subagent-driven-development")
  ) {
    return "subagent";
  }

  // Sequential detection
  if (lower.includes("sequential") || lower.includes("executing-plans")) {
    return "sequential";
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/hooks/detection.test.ts`
Expected: All tests pass

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/hooks/detection.ts tests/hooks/detection.test.ts
git commit -m "feat: add execution choice detection for handoff interception"
```

---

## Chunk 4: Converter, Hook, and Plugin Wiring

Integrates the pure functions from Chunks 2-3 with the OpenCode plugin SDK and `bd` CLI. These are side-effectful orchestrators.

### Task 7: Plan-to-Beads Converter

**Files:**
- Create: `src/converter/plan-to-beads.ts`

- [ ] **Step 1: Write the implementation**

Create `src/converter/plan-to-beads.ts`:

```typescript
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
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/converter/plan-to-beads.ts
git commit -m "feat: add plan-to-beads converter with idempotency support"
```

### Task 8: Handoff Hook Implementation

**Files:**
- Create: `src/hooks/handoff.ts`

- [ ] **Step 1: Write the implementation**

Create `src/hooks/handoff.ts`:

```typescript
/**
 * Handoff hook for intercepting plan completion.
 *
 * Watches assistant messages for the plan-completion signal from writing-plans,
 * then injects execution options including the beads-driven path.
 */

import type { PluginInput } from "@opencode-ai/plugin";
import {
  isPlanCompletionMessage,
  extractPlanPath,
  detectExecutionChoice,
} from "./detection";
import { convertPlanToBeads } from "../converter/plan-to-beads";
import { loadSkill, loadPrompt } from "../vendor";

type OpencodeClient = PluginInput["client"];

/** State for tracking handoff across messages within a session */
interface HandoffState {
  /** The plan file path detected from the completion message */
  planPath: string;
  /** Whether we're waiting for the user to pick an execution strategy */
  awaitingChoice: boolean;
}

/**
 * Create the handoff hook handler.
 *
 * @param client - OpenCode client for injecting messages
 * @param $ - Shell executor for bd commands
 * @param bdAvailable - Whether bd CLI was found at startup
 * @param planPattern - Glob pattern for plan file paths
 * @returns The chat.message hook handler
 */
export function createHandoffHook(
  client: OpencodeClient,
  $: PluginInput["$"],
  bdAvailable: boolean,
  planPattern?: string
) {
  const sessionState = new Map<string, HandoffState>();

  return async (
    _input: unknown,
    output: { message: { sessionID: string; agent?: string; model?: { providerID: string; modelID: string }; parts?: Array<{ type: string; text?: string }> } }
  ) => {
    const sessionID = output.message.sessionID;

    // Extract message text from parts
    const messageText =
      output.message.parts
        ?.filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("\n") ?? "";

    if (!messageText) return;

    const state = sessionState.get(sessionID);

    // Phase 2: Check for choice after we've injected options
    if (state?.awaitingChoice) {
      const choice = detectExecutionChoice(messageText);

      if (choice === "beads" && state.planPath) {
        sessionState.delete(sessionID);

        // Run converter
        const result = await convertPlanToBeads(state.planPath, $);

        // Load and inject the beads-driven-development skill
        const skillContent = await loadSkill("beads-driven-development");
        if (skillContent) {
          const contextMessage = `<beads-execution-context>
Epic: ${result.epicId}
Plan: ${state.planPath}
Tasks: ${result.taskMapping.size} issues created in beads

${skillContent}
</beads-execution-context>`;

          await client.session.prompt({
            path: { id: sessionID },
            body: {
              noReply: true,
              model: output.message.model,
              agent: output.message.agent,
              parts: [{ type: "text", text: contextMessage, synthetic: true }],
            },
          });
        }
        return;
      }

      if (choice === "subagent" || choice === "sequential") {
        // Not our path -- clean up and let superpowers handle it
        sessionState.delete(sessionID);
        return;
      }

      // No clear choice detected -- stop waiting after this message
      // (single-shot check as noted in spec review)
      sessionState.delete(sessionID);
      return;
    }

    // Phase 1: Detect plan completion
    if (isPlanCompletionMessage(messageText, planPattern)) {
      if (!bdAvailable) return; // Don't offer beads option if bd not available

      const planPath = extractPlanPath(messageText);
      if (!planPath) return;

      // Load the execution options template
      const optionsTemplate = await loadPrompt("execution-options");
      if (!optionsTemplate) return;

      // Track state for choice detection
      sessionState.set(sessionID, {
        planPath,
        awaitingChoice: true,
      });

      // Inject the execution options
      await client.session.prompt({
        path: { id: sessionID },
        body: {
          noReply: true,
          model: output.message.model,
          agent: output.message.agent,
          parts: [
            { type: "text", text: optionsTemplate, synthetic: true },
          ],
        },
      });
    }
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/handoff.ts
git commit -m "feat: add handoff hook for plan completion interception"
```

### Task 9: Plugin Entry Point

**Files:**
- Create: `src/plugin.ts`

- [ ] **Step 1: Write the implementation**

Create `src/plugin.ts`:

```typescript
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
import { loadSkill } from "./vendor";

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

  // Load skill content for config registration
  const skillContent = await loadSkill("beads-driven-development");

  // Create the handoff hook
  const handoffHook = createHandoffHook(client, $, bdAvailable);

  return {
    "chat.message": handoffHook,

    config: async (config) => {
      // Register the beads-driven-development skill as a command
      if (skillContent) {
        config.command = {
          ...config.command,
          "super-beads:execute": {
            description:
              "Execute a plan using beads-driven development (bd ready loop + subagent dispatch)",
            template: skillContent,
          },
        };
      }
    },
  };
};
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/plugin.ts
git commit -m "feat: add main plugin entry point with startup validation"
```

---

## Chunk 5: Skill Content, Prompts, and README

The actual skill and prompt markdown files, plus the README.

### Task 10: Execution Options Prompt Template

**Files:**
- Modify: `vendor/prompts/execution-options.md`

- [ ] **Step 1: Write the template**

Replace the placeholder in `vendor/prompts/execution-options.md`:

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
   Subagent dispatch with two-stage review. Dual tracking: beads for
   persistent state across sessions, TodoWrite for real-time session UI.

Which approach would you like to use?
</execution-options>
```

- [ ] **Step 2: Commit**

```bash
git add vendor/prompts/execution-options.md
git commit -m "feat: add execution options prompt template"
```

### Task 11: Beads-Driven Development Skill

**Files:**
- Modify: `vendor/skills/beads-driven-development.md`

- [ ] **Step 1: Write the skill content**

Replace the placeholder in `vendor/skills/beads-driven-development.md`:

```markdown
# Beads-Driven Development

Execute a plan using beads as the task manager. Uses `bd ready` for task selection,
subagent dispatch with two-stage review, and dual tracking (beads + TodoWrite).

## Prerequisites

- `bd` CLI installed and available in PATH
- Beads initialized in the project (`.beads/` directory exists)
- Plan file exists and has been converted to beads issues (epic + child tasks)
- Superpowers prompt templates available (implementer-prompt.md, spec-reviewer-prompt.md, code-quality-reviewer-prompt.md)

## Initialization

Before entering the execution loop, sync session state with beads:

```
bd list --parent <epic-id> --json
  -> for each issue:
      status=closed      -> TodoWrite: completed
      status=in_progress -> TodoWrite: in_progress
                            Ask user: "Task X was in progress. Continue or restart?"
      status=blocked     -> TodoWrite: pending (annotate "blocked by <dep-id>")
      status=open        -> TodoWrite: pending
```

## Core Loop

```
Loop:
  +-> bd ready --json
  |   +- No tasks ready + all closed -> DONE -> invoke superpowers:finishing-a-development-branch
  |   +- No tasks ready + some open  -> BLOCKED -> show `bd list --status blocked`, report & pause
  |   +- Tasks available -> pick first ready task
  |
  |   Task in task-number-to-bead-id mapping?
  |   +- YES -> Read full task spec from plan file (using task-number reference)
  |   +- NO  -> Ad-hoc task: use bead description directly as task spec
  |
  |   bd update <id> --claim
  |   TodoWrite: mark in_progress
  |
  |   Dispatch implementer subagent (see superpowers subagent-driven-development/implementer-prompt.md)
  |   Provide: full task text from plan file + context about where task fits
  |   +- DONE -> proceed to spec review
  |   +- DONE_WITH_CONCERNS -> read concerns, proceed to spec review
  |   +- NEEDS_CONTEXT -> provide context, re-dispatch (max 3 attempts, then escalate to user)
  |   +- BLOCKED -> bd update <id> --status blocked --reason "...", continue loop
  |
  |   Dispatch spec reviewer subagent (see superpowers subagent-driven-development/spec-reviewer-prompt.md)
  |   +- Approved -> proceed to code quality review
  |   +- Issues Found -> implementer fixes -> re-review (max 3 iterations, then escalate to user)
  |
  |   Dispatch code quality reviewer subagent (see superpowers subagent-driven-development/code-quality-reviewer-prompt.md)
  |   ONLY after spec review passes
  |   +- Approved -> proceed
  |   +- Issues Found -> implementer fixes -> re-review (max 3 iterations, then escalate to user)
  |
  |   bd close <id> --reason "Implemented and reviewed"
  |   TodoWrite: mark completed
  |
  |   Re-sync TodoWrite from bd list (catches external changes)
  +---loop

After all tasks complete:
  bd close <epic-id> --reason "All tasks completed"
  Dispatch final code reviewer subagent for entire implementation
  Invoke superpowers:finishing-a-development-branch
```

## Task Selection via bd ready

The key difference from subagent-driven-development: task order comes from `bd ready`, not from reading the plan linearly.

This means:
- External blockers (added via `bd dep add`) are automatically respected
- Tasks can be reordered without editing the plan file
- Tasks manually closed (e.g., already done) are automatically skipped
- Tasks within the same chunk can be picked in any order
- Cross-chunk dependencies are enforced by beads' dependency graph

## Dual Tracking Protocol

Every state transition updates BOTH beads and TodoWrite:

| Event | Beads | TodoWrite |
|---|---|---|
| Task picked from bd ready | `bd update <id> --claim` | Mark in_progress |
| Implementer returns BLOCKED | `bd update <id> --status blocked` | Mark pending, annotate reason |
| Code review passes | `bd close <id> --reason "..."` | Mark completed |
| All tasks closed | `bd close <epic-id>` | All completed |

If they disagree, beads wins. TodoWrite re-syncs from `bd list` each iteration.

## Model Selection

Same strategy as superpowers subagent-driven-development:
- Cheap/fast models for mechanical tasks (isolated functions, clear specs, 1-2 files)
- Standard models for integration and judgment tasks (multi-file, pattern matching)
- Most capable models for architecture, design, and review tasks

## Error Handling

- `bd ready` error: retry once, then report and pause
- `bd close` error: log warning, continue (code is done; beads state can be fixed manually)
- Implementer NEEDS_CONTEXT 3 times: escalate to user with what was requested and provided
- Spec reviewer loops 3 times: escalate to user with reviewer concerns
- Tracking failures never block code execution. Code failures always stop the loop.

## Red Flags (same as subagent-driven-development)

**Never:**
- Skip reviews (spec compliance OR code quality)
- Proceed with unfixed issues
- Dispatch multiple implementation subagents in parallel
- Make subagent read plan file (provide full text instead)
- Skip re-review after implementer fixes
- Start code quality review before spec compliance passes
- Move to next task while either review has open issues
```

- [ ] **Step 2: Commit**

```bash
git add vendor/skills/beads-driven-development.md
git commit -m "feat: add beads-driven-development skill with full execution engine"
```

### Task 12: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Create `README.md`:

```markdown
# opencode-super-beads

An [OpenCode](https://opencode.ai) plugin that bridges [superpowers](https://github.com/obra/superpowers)' workflow engine with [beads](https://github.com/steveyegge/beads)' task management.

Adds **beads-driven development** as a third execution path alongside superpowers' subagent-driven and sequential execution modes.

## What It Does

When superpowers' `writing-plans` skill finishes creating an implementation plan, this plugin intercepts the handoff and offers three execution strategies:

1. **Subagent-driven development** (superpowers default) -- linear plan execution with subagent dispatch
2. **Sequential execution** -- execute in the current session
3. **Beads-driven development** (this plugin) -- creates beads issues from the plan, uses `bd ready` for task selection

### Why Beads-Driven?

- **Persistent tracking** -- beads state survives session crashes. Resume exactly where you left off.
- **Dependency-aware scheduling** -- `bd ready` only returns unblocked tasks. Add external blockers (e.g., "wait for API key") without editing the plan.
- **Reorderable** -- change task priority in beads without touching the plan file.
- **Observable** -- `bd list`, `bd stats`, `bd blocked` give you project visibility at any time.

### What It Doesn't Change

- Superpowers' brainstorming, spec writing, and plan writing remain untouched
- Markdown spec and plan files stay on disk for human review
- The same subagent prompt templates (implementer, spec reviewer, code quality reviewer) are used
- TDD discipline, two-stage review loops, and all quality gates remain in place

## Prerequisites

### Required

- **[OpenCode](https://opencode.ai)** -- the AI coding environment
- **[beads](https://github.com/steveyegge/beads)** -- install the `bd` CLI and ensure it's in your PATH
- **[superpowers](https://github.com/obra/superpowers)** -- the skills framework (installed as an OpenCode plugin)

### Recommended

- **[opencode-beads](https://github.com/joshuadavidthomas/opencode-beads)** -- provides context injection and `/beads:*` slash commands. Not required by this plugin, but useful for manual interaction with beads.

## Installation

### 1. Install beads CLI

Follow the instructions at [steveyegge/beads](https://github.com/steveyegge/beads) to install the `bd` CLI.

Verify it's working:

```bash
bd version
```

### 2. Initialize beads in your project

```bash
cd your-project
bd init
```

### 3. Add plugins to opencode.jsonc

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "opencode-beads",
    "opencode-super-beads"
  ]
}
```

Note: `opencode-beads` is optional but recommended.

### 4. Verify installation

Start OpenCode. The plugin will log warnings at startup if prerequisites are missing:

- `bd CLI not found` -- install beads
- `superpowers prompt templates not found` -- install superpowers

## Usage

### Normal Workflow

Use superpowers as usual:

1. Brainstorm your idea (`/superpowers:brainstorm`)
2. Design gets written to a spec document
3. Plan gets written with tasks and chunks

At the plan completion handoff, you'll see three options instead of the usual two:

```
Plan detected. Choose an execution strategy:

1. Subagent-driven development (superpowers default)
2. Sequential execution (no subagents)
3. Beads-driven development (requires bd CLI)
```

Choose option 3 to use beads-driven development.

### What Happens Next

1. The plugin parses the plan and creates beads issues:
   - One **epic** for the entire plan
   - One **child task** per plan task
   - **Dependencies** between chunks (tasks in chunk 2 are blocked by tasks in chunk 1)

2. The execution engine starts:
   - Picks the next task from `bd ready`
   - Dispatches an implementer subagent
   - Runs spec compliance review
   - Runs code quality review
   - Closes the bead issue
   - Repeats until all tasks are done

### Between Sessions

If your session ends mid-execution, start a new session and invoke the execution skill. It will:

1. Check `bd list` to see what's done, in progress, and remaining
2. Rebuild the session progress view
3. Ask about any in-progress tasks from the crashed session
4. Continue from where you left off

### Manual Intervention

You can interact with beads directly between or during sessions:

```bash
# See what's ready to work on
bd ready

# Add an external blocker
bd dep add <task-id> <blocker-id> --type blocks

# Close a task manually (e.g., already done)
bd close <task-id> --reason "Already implemented"

# Check what's blocked and why
bd list --status blocked

# View project stats
bd stats
```

The execution engine respects all manual changes on its next `bd ready` cycle.

## Architecture

```
opencode-super-beads/
+-- src/
|   +-- plugin.ts              # Main entry point, startup checks, hook/config wiring
|   +-- vendor.ts              # Loads markdown files from vendor/
|   +-- hooks/
|   |   +-- detection.ts       # Pure functions: pattern matching (plan completion, choice)
|   |   +-- handoff.ts         # Hook implementation: message interception + injection
|   +-- converter/
|       +-- parser.ts          # Pure functions: plan markdown -> structured data
|       +-- plan-to-beads.ts   # Orchestrator: parser output + bd CLI -> beads issues
+-- vendor/
|   +-- skills/
|   |   +-- beads-driven-development.md   # The execution engine skill
|   +-- prompts/
|       +-- execution-options.md          # Handoff choice template
+-- tests/
    +-- converter/
    |   +-- parser.test.ts
    +-- hooks/
    |   +-- detection.test.ts
    +-- fixtures/
        +-- sample-plan.md
```

## License

MIT
```

- [ ] **Step 2: Create LICENSE file**

Create `LICENSE` with MIT license text (use the standard MIT template with current year and project author).

- [ ] **Step 3: Commit**

```bash
git add README.md LICENSE
git commit -m "docs: add README with installation guide and MIT license"
```

### Task 13: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Verify all files are committed**

Run: `git status`
Expected: Clean working tree

- [ ] **Step 4: Verify plugin structure**

Run: `ls -la src/ vendor/ tests/`
Expected: All planned files exist in correct locations
