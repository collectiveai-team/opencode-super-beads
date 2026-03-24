import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  analyzePlanDependencies,
  convertPlanToBeadsParallel,
  createBeadsFromAnalysis,
} from "../../src/converter/parallel-converter";

function createMockShell(options?: {
  epics?: Array<{ id: string; description: string }>;
  childrenByParent?: Record<string, Array<{ id: string; title: string }>>;
}) {
  const calls: string[] = [];
  let issueCounter = 0;

  const $ = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const command = strings.reduce(
      (acc, str, index) => acc + str + String(values[index] ?? ""),
      ""
    );
    calls.push(command.trim());

    return {
      text: async () => {
        if (command.includes("bd version") || command.includes("bd stats")) {
          return "ok";
        }
        if (command.includes("bd list --type epic")) {
          return JSON.stringify(options?.epics ?? []);
        }
        if (command.includes("bd list --parent")) {
          const match = command.match(/bd list --parent\s+(\S+)\s+--json/);
          const parentId = match?.[1] ?? "";
          return JSON.stringify(options?.childrenByParent?.[parentId] ?? []);
        }
        if (command.includes("bd create")) {
          issueCounter += 1;
          return JSON.stringify({ id: `beads-${issueCounter}` });
        }
        if (command.includes("bd dep add")) {
          return "ok";
        }
        if (command.includes("bd dep cycles")) {
          return "[]";
        }
        return "";
      },
    };
  };

  return { $: $ as any, calls };
}

const tempPaths: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempPaths.map((tempPath) => fs.rm(tempPath, { force: true, recursive: true }))
  );
});

async function writeTempPlanFile(content: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "parallel-converter-"));
  const tempPath = path.join(tempDir, "plan.md");
  await fs.writeFile(tempPath, content, "utf-8");
  tempPaths.push(tempPath, tempDir);
  return tempPath;
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
    expect(calls.some((call) => call.includes("--type epic"))).toBe(true);
  });

  test("wires fine-grained deps instead of chunk-based deps", async () => {
    const { $, calls } = createMockShell();

    await convertPlanToBeadsParallel("tests/fixtures/sample-plan-with-deps.md", $);

    const depCalls = calls.filter((call) => call.includes("bd dep add"));
    expect(depCalls.length).toBeGreaterThan(0);
    expect(depCalls.length).toBeLessThan(6);
  });

  test("returns dependency analysis", async () => {
    const { $ } = createMockShell();

    const result = await convertPlanToBeadsParallel(
      "tests/fixtures/sample-plan-with-deps.md",
      $
    );

    expect(result.analysis).toBeDefined();
    expect(result.analysis.validation.hasCycles).toBe(false);
  });

  test("reuses a valid existing parallel epic and still reconciles dependencies", async () => {
    const { $, calls } = createMockShell({
      epics: [
        {
          id: "beads-existing-epic",
          description:
            "Goal: Test fine-grained dependency analysis | Plan: tests/fixtures/sample-plan-with-deps.md | Mode: parallel",
        },
      ],
      childrenByParent: {
        "beads-existing-epic": [
          { id: "beads-task-1", title: "Task 1: Auth types" },
          { id: "beads-task-2", title: "Task 2: Database schema" },
          { id: "beads-task-3", title: "Task 3: Config loader" },
          { id: "beads-task-4", title: "Task 4: Auth middleware" },
          { id: "beads-task-5", title: "Task 5: User service" },
          { id: "beads-task-6", title: "Task 6: API routes" },
        ],
      },
    });

    const result = await convertPlanToBeadsParallel(
      "tests/fixtures/sample-plan-with-deps.md",
      $
    );

    expect(result.epicId).toBe("beads-existing-epic");
    expect(result.taskMapping.size).toBe(6);
    expect(calls.some((call) => call.includes("bd list --parent beads-existing-epic --json"))).toBe(true);
    expect(calls.some((call) => call.includes("bd create"))).toBe(false);
    expect(calls.filter((call) => call.includes("bd dep add")).length).toBeGreaterThan(0);
  });

  test("creates a new epic when an existing parallel epic has an incomplete mapping", async () => {
    const { $, calls } = createMockShell({
      epics: [
        {
          id: "beads-existing-epic",
          description:
            "Goal: Test fine-grained dependency analysis | Plan: tests/fixtures/sample-plan-with-deps.md | Mode: parallel",
        },
      ],
      childrenByParent: {
        "beads-existing-epic": [
          { id: "beads-task-1", title: "Task 1: Auth types" },
          { id: "beads-task-2", title: "Task 2: Database schema" },
        ],
      },
    });

    const result = await convertPlanToBeadsParallel(
      "tests/fixtures/sample-plan-with-deps.md",
      $
    );

    expect(result.epicId).not.toBe("beads-existing-epic");
    expect(result.taskMapping.size).toBe(6);
    expect(calls.filter((call) => call.includes("bd create")).length).toBeGreaterThan(0);
  });

  test("creates a new epic when an existing parallel epic has stale task titles", async () => {
    const { $, calls } = createMockShell({
      epics: [
        {
          id: "beads-existing-epic",
          description:
            "Goal: Test fine-grained dependency analysis | Plan: tests/fixtures/sample-plan-with-deps.md | Mode: parallel",
        },
      ],
      childrenByParent: {
        "beads-existing-epic": [
          { id: "beads-task-1", title: "Task 1: Auth types" },
          { id: "beads-task-2", title: "Task 2: Database schema" },
          { id: "beads-task-3", title: "Task 3: Config loader" },
          { id: "beads-task-4", title: "Task 4: Auth middleware" },
          { id: "beads-task-5", title: "Task 5: Old user service" },
          { id: "beads-task-6", title: "Task 6: API routes" },
        ],
      },
    });

    const result = await convertPlanToBeadsParallel(
      "tests/fixtures/sample-plan-with-deps.md",
      $
    );

    expect(result.epicId).not.toBe("beads-existing-epic");
    expect(calls.filter((call) => call.includes("bd create")).length).toBeGreaterThan(0);
  });

  test("rejects mismatched plan paths between analyze and create phases", async () => {
    const { $, calls } = createMockShell();
    const analysis = await analyzePlanDependencies("tests/fixtures/sample-plan-with-deps.md");

    expect(
      createBeadsFromAnalysis("tests/fixtures/other-plan.md", analysis, $)
    ).rejects.toThrow(/plan path/i);
    expect(calls.some((call) => call.includes("bd create"))).toBe(false);
  });

  test("rejects dependency cycles before any bead creation calls", async () => {
    const { $, calls } = createMockShell();
    const cyclicPlanPath = await writeTempPlanFile(`# Cyclic Plan

**Goal:** Test cycle rejection

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

    expect(convertPlanToBeadsParallel(cyclicPlanPath, $)).rejects.toThrow(/cycle/i);
    expect(calls.some((call) => call.includes("bd create"))).toBe(false);
  });
});
