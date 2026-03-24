import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parsePlan, type ParsedChunk } from "../../src/converter/parser";
import {
  buildLayeredDependencyGraph,
  type DependencyAnalysisResult,
  type AnalyzedDependency,
} from "../../src/converter/dependency-analyzer";

const FIXTURE_PATH = path.join(
  import.meta.dir,
  "..",
  "fixtures",
  "sample-plan-with-deps.md"
);

function sortEdges(edges: AnalyzedDependency[]): AnalyzedDependency[] {
  return [...edges].sort((a, b) => {
    return (
      a.taskNumber - b.taskNumber ||
      a.dependsOn - b.dependsOn ||
      a.source.localeCompare(b.source)
    );
  });
}

describe("buildLayeredDependencyGraph", () => {
  test("includes explicit dependency edges", async () => {
    const content = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(content);

    const result = buildLayeredDependencyGraph(plan.chunks);

    const task4Deps = result.edges.filter((edge) => edge.taskNumber === 4);
    expect(task4Deps).toContainEqual({
      taskNumber: 4,
      dependsOn: 1,
      source: "explicit",
    });

    const task5Deps = result.edges.filter((edge) => edge.taskNumber === 5);
    expect(task5Deps).toContainEqual({
      taskNumber: 5,
      dependsOn: 1,
      source: "explicit",
    });
    expect(task5Deps).toContainEqual({
      taskNumber: 5,
      dependsOn: 2,
      source: "explicit",
    });
  });

  test("adds file-overlap safety-net edges", async () => {
    const content = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(content);

    const result = buildLayeredDependencyGraph(plan.chunks);

    expect(result.edges).toContainEqual({
      taskNumber: 4,
      dependsOn: 1,
      source: "file-overlap",
    });
    expect(result.edges).toContainEqual({
      taskNumber: 6,
      dependsOn: 2,
      source: "file-overlap",
    });
  });

  test("uses chunk fallback when no explicit or file-overlap deps exist", () => {
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

    expect(result.edges).toContainEqual({
      taskNumber: 2,
      dependsOn: 1,
      source: "chunk-fallback",
    });
  });

  test("does not add chunk fallback when file overlap already exists", async () => {
    const content = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(content);

    const result = buildLayeredDependencyGraph(plan.chunks);

    const task6Edges = result.edges.filter((edge) => edge.taskNumber === 6);
    expect(task6Edges).toContainEqual({
      taskNumber: 6,
      dependsOn: 2,
      source: "file-overlap",
    });
    expect(task6Edges.some((edge) => edge.source === "chunk-fallback")).toBe(false);
  });

  test("does not fall back to chunk ordering when explicit deps reference missing tasks", () => {
    const chunks: ParsedChunk[] = [
      {
        name: "Setup",
        chunkNumber: 1,
        tasks: [
          {
            number: 1,
            name: "A",
            filesSection: "",
            filePaths: ["src/a.ts"],
            dependsOn: [],
            fullContent: "",
          },
        ],
      },
      {
        name: "Build",
        chunkNumber: 2,
        tasks: [
          {
            number: 2,
            name: "B",
            filesSection: "",
            filePaths: ["src/b.ts"],
            dependsOn: [999],
            fullContent: "",
          },
        ],
      },
    ];

    const result = buildLayeredDependencyGraph(chunks);

    expect(result.edges).toEqual([]);
    expect(result.validation.orphanWarnings).toEqual([
      "Task 2 (B) in a later chunk has no dependencies — possible missing annotation",
    ]);
  });

  test("retains duplicate provenance per source", async () => {
    const content = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(content);

    const result = buildLayeredDependencyGraph(plan.chunks);

    expect(
      sortEdges(result.edges.filter((edge) => edge.taskNumber === 4 && edge.dependsOn === 1))
    ).toEqual([
      { taskNumber: 4, dependsOn: 1, source: "explicit" },
      { taskNumber: 4, dependsOn: 1, source: "file-overlap" },
    ]);
  });

  test("returns a valid graph with no cycles for the fixture", async () => {
    const content = await fs.readFile(FIXTURE_PATH, "utf-8");
    const plan = parsePlan(content);

    const result: DependencyAnalysisResult = buildLayeredDependencyGraph(plan.chunks);

    expect(result.validation.hasCycles).toBe(false);
    expect(result.validation.cycles).toEqual([]);
  });
});

describe("validation", () => {
  test("detects cycles", () => {
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

  test("warns about orphan tasks in later chunks", () => {
    const chunks: ParsedChunk[] = [
      {
        name: "Setup",
        chunkNumber: 1,
        tasks: [
          {
            number: 1,
            name: "A",
            filesSection: "",
            filePaths: ["src/a.ts"],
            dependsOn: [],
            fullContent: "",
          },
        ],
      },
      {
        name: "Empty Handoff",
        chunkNumber: 2,
        tasks: [],
      },
      {
        name: "Build",
        chunkNumber: 3,
        tasks: [
          {
            number: 2,
            name: "B",
            filesSection: "",
            filePaths: ["src/b.ts"],
            dependsOn: [],
            fullContent: "",
          },
        ],
      },
    ];

    const result = buildLayeredDependencyGraph(chunks);

    expect(result.edges).toEqual([]);
    expect(result.validation.orphanWarnings).toEqual([
      "Task 2 (B) in a later chunk has no dependencies — possible missing annotation",
    ]);
  });

  test("warns when a task depends on more than half of prior tasks", () => {
    const chunks: ParsedChunk[] = [
      {
        name: "Foundation",
        chunkNumber: 1,
        tasks: [
          { number: 1, name: "A", filesSection: "", filePaths: ["src/a.ts"], dependsOn: [], fullContent: "" },
          { number: 2, name: "B", filesSection: "", filePaths: ["src/b.ts"], dependsOn: [], fullContent: "" },
          { number: 3, name: "C", filesSection: "", filePaths: ["src/c.ts"], dependsOn: [], fullContent: "" },
          { number: 4, name: "D", filesSection: "", filePaths: ["src/d.ts"], dependsOn: [], fullContent: "" },
        ],
      },
      {
        name: "Feature",
        chunkNumber: 2,
        tasks: [
          { number: 5, name: "E", filesSection: "", filePaths: ["src/e.ts"], dependsOn: [], fullContent: "" },
        ],
      },
    ];

    const result = buildLayeredDependencyGraph(chunks);

    expect(result.validation.overConnectionWarnings).toEqual([
      "Task 5 (E) depends on 4/4 prior tasks — consider adding explicit annotations",
    ]);
  });
});
