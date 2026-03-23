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
    const nonEmptyChunks = result.chunks.filter(c => c.tasks.length > 0);
    expect(nonEmptyChunks).toHaveLength(2);
  });
});
