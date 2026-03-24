import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parsePlan, buildDependencyGraph } from "../../src/converter/parser";
import type { ParsedPlan, DependencyEdge, ParsedChunk } from "../../src/converter/parser";

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
    expect(result.chunks).toHaveLength(3);
    expect(result.chunks[0]!.name).toBe("Core Auth");
    expect(result.chunks[1]!.name).toBe("Role-Based Access");
    expect(result.chunks[2]!.name).toBe("Integration");
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
    expect(task1.filesSection).not.toContain("Step 1: Write the failing test");
  });

  test("extracts file paths and strips trailing line ranges", async () => {
    planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    const task5 = result.chunks[2]!.tasks.find((task) => task.number === 5)!;

    expect(task5.filePaths).toEqual([
      "src/dashboard/integration.ts",
      "src/auth/middleware.ts",
      "tests/dashboard/integration.test.ts",
    ]);
  });

  test("keeps file bullets with trailing text after the backticked path", () => {
    const plan = parsePlan(`# Plan

**Goal:** Test files parsing

---

### Task 1: Prompt Template

**Files:**
- Create: \`vendor/prompts/execution-options.md\` (placeholder)

- [ ] **Step 1: Do it**
`);
    const task1 = plan.chunks[0]!.tasks[0]!;

    expect(task1.filesSection).toContain("vendor/prompts/execution-options.md");
    expect(task1.filesSection).toContain("(placeholder)");
    expect(task1.filesSection).not.toContain("Step 1: Do it");
    expect(task1.filePaths).toEqual(["vendor/prompts/execution-options.md"]);
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
    expect(totalTasks).toBe(6);
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
    const nonEmptyChunks = result.chunks.filter(c => c.tasks.length > 0);
    expect(nonEmptyChunks).toHaveLength(2);
  });
});

describe("buildDependencyGraph", () => {
  test("no dependencies within the same chunk", async () => {
    const planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(planContent);
    const edges = buildDependencyGraph(plan.chunks);

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

    const task3Deps = edges
      .filter((e) => e.taskNumber === 3)
      .map((e) => e.dependsOn)
      .sort();
    expect(task3Deps).toEqual([1, 2]);

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

    expect(edges).toContainEqual({ taskNumber: 2, dependsOn: 1 });
    expect(edges).toContainEqual({ taskNumber: 3, dependsOn: 2 });
    // Task 3 does NOT depend on Task 1 directly
    // (beads resolves transitive deps: 3->2->1, so direct 3->1 edge is unnecessary)
    expect(edges).not.toContainEqual({ taskNumber: 3, dependsOn: 1 });
  });
});

describe("dependsOn parsing", () => {
  test("extracts Depends on annotation from task", async () => {
    const planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    const chunk3 = result.chunks.find((c) => c.name === "Integration");

    expect(chunk3).toBeDefined();

    const task5 = chunk3!.tasks.find((t) => t.number === 5);
    expect(task5).toBeDefined();
    expect(task5!.dependsOn).toEqual([2, 3]);
  });

  test("extracts single dependency", async () => {
    const planContent = await fs.readFile(FIXTURE_PATH, "utf-8");
    const result = parsePlan(planContent);
    const chunk3 = result.chunks.find((c) => c.name === "Integration");

    expect(chunk3).toBeDefined();

    const task6 = chunk3!.tasks.find((t) => t.number === 6);
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
