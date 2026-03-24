import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildBeadsExecutionMessage,
  createHandoffHook,
  formatDependencyGraph,
} from "../../src/hooks/handoff";

describe("buildBeadsExecutionMessage", () => {
  test("includes both the native skill and command alias", () => {
    const message = buildBeadsExecutionMessage({
      epicId: "epic-123",
      planPath: "docs/superpowers/plans/example.md",
      taskCount: 4,
      skillTemplate: null,
    });

    expect(message).toContain("super-beads:beads-driven-development");
    expect(message).toContain("super-beads:execute");
  });

  test("supports parallel mode skill names and dependency summary", () => {
    const message = buildBeadsExecutionMessage({
      epicId: "epic-456",
      planPath: "docs/superpowers/plans/parallel.md",
      taskCount: 6,
      skillTemplate: null,
      parallel: true,
      depSummary: "4 dependency edges",
    });

    expect(message).toContain("parallel beads-driven development");
    expect(message).toContain("super-beads:dispatch-parallel-bead-agents");
    expect(message).toContain("super-beads:parallel-execute");
    expect(message).toContain("Dependencies: 4 dependency edges");
  });
});

describe("formatDependencyGraph", () => {
  test("summarizes inferred dependencies and parallel-safe tasks", () => {
    const message = formatDependencyGraph({
      plan: {
        title: "Example Plan",
        goal: "Test graph formatting",
        chunks: [
          {
            name: "Chunk 1",
            chunkNumber: 1,
            tasks: [
              {
                number: 1,
                name: "Base task",
                filesSection: "",
                filePaths: [],
                dependsOn: [],
                fullContent: "",
              },
              {
                number: 2,
                name: "Dependent task",
                filesSection: "",
                filePaths: [],
                dependsOn: [1],
                fullContent: "",
              },
            ],
          },
        ],
      },
      depResult: {
        edges: [{ taskNumber: 2, dependsOn: 1, source: "explicit" }],
        validation: {
          hasCycles: false,
          cycles: [],
          orphanWarnings: [],
          overConnectionWarnings: [],
        },
      },
      planPath: "docs/superpowers/plans/parallel.md",
    });

    expect(message).toContain("Task 1: Base task -> no deps (parallel-safe)");
    expect(message).toContain("Task 2: Dependent task -> depends on Task 1 (explicit)");
    expect(message).toContain("Present this graph to the user and confirm before proceeding.");
  });
});

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
        if (cmd.includes("bd list --parent")) {
          return "[]";
        }
        if (cmd.includes("bd create")) {
          issueCounter++;
          return JSON.stringify({ id: `beads-${issueCounter}` });
        }
        if (cmd.includes("bd dep add")) {
          return "ok";
        }
        return "";
      },
    };
  };

  return { $: $ as any, calls };
}

function createMockClient() {
  const prompts: string[] = [];

  return {
    client: {
      session: {
        prompt: async ({ body }: { body: { parts: Array<{ text?: string }> } }) => {
          prompts.push(body.parts[0]?.text ?? "");
        },
      },
    } as any,
    prompts,
  };
}

function createMessage(text: string) {
  return {
    message: {
      sessionID: "session-1",
      agent: "test-agent",
      model: { providerID: "test", modelID: "test-model" },
      parts: [{ type: "text", text }],
    },
  };
}

const tempFiles: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempFiles.splice(0).map(async (filePath) => {
      try {
        await fs.unlink(filePath);
      } catch {
        // ignore cleanup failures for already-removed temp files
      }
    })
  );
});

async function writeTempPlan(content: string): Promise<string> {
  const filePath = path.join(
    os.tmpdir(),
    `parallel-plan-${Date.now()}-${Math.random().toString(16).slice(2)}.md`
  );
  await fs.writeFile(filePath, content, "utf-8");
  tempFiles.push(filePath);
  return filePath;
}

const INITIAL_TEMP_PLAN = `# Temp Parallel Plan

**Goal:** Test graph refresh

---

## Chunk 1: Setup

### Task 1: Base

**Files:**
- Create: \`src/base.ts\`

- [ ] **Step 1: Implement**

## Chunk 2: Features

### Task 2: Feature

**Files:**
- Create: \`src/feature.ts\`

- [ ] **Step 1: Implement**
`;

const UPDATED_TEMP_PLAN = `# Temp Parallel Plan

**Goal:** Test graph refresh

---

## Chunk 1: Setup

### Task 1: Base

**Files:**
- Create: \`src/base.ts\`

- [ ] **Step 1: Implement**

## Chunk 2: Features

### Task 2: Feature

**Depends on:** Task 1
**Files:**
- Create: \`src/feature.ts\`

- [ ] **Step 1: Implement**
`;

describe("createHandoffHook parallel flow", () => {
  test("awaiting choice clears after an unrelated follow-up message", async () => {
    const { $, calls } = createMockShell();
    const { client, prompts } = createMockClient();
    const hook = createHandoffHook(client, $, true, "tests/fixtures/*.md");

    await hook(
      {},
      createMessage(
        "Plan complete and saved to `tests/fixtures/sample-plan-with-deps.md`. Ready to execute?"
      )
    );

    expect(prompts).toHaveLength(1);

    await hook({}, createMessage("Can you summarize the tradeoffs first?"));
    await hook({}, createMessage("Let's use parallel-beads execution."));

    expect(prompts).toHaveLength(1);
    expect(calls.some((call) => call.includes("bd create"))).toBe(false);
  });

  test("plan completion -> options -> graph -> non-confirmation waits -> explicit confirmation creates beads", async () => {
    const { $ , calls } = createMockShell();
    const { client, prompts } = createMockClient();
    const hook = createHandoffHook(client, $, true, "tests/fixtures/*.md");

    await hook(
      {},
      createMessage(
        "Plan complete and saved to `tests/fixtures/sample-plan-with-deps.md`. Ready to execute?"
      )
    );

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Choose an execution strategy");

    await hook({}, createMessage("Let's use parallel-beads execution."));

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("<parallel-dependency-graph>");
    expect(prompts[1]).toContain("Task 4: Auth middleware");

    await hook({}, createMessage("Can you explain why Task 6 depends on Task 2?"));

    expect(prompts).toHaveLength(2);
    expect(calls.some((call) => call.includes("bd create"))).toBe(false);

    await hook({}, createMessage("I confirm the dependency graph. Proceed."));

    expect(prompts).toHaveLength(3);
    expect(prompts[2]).toContain("super-beads:dispatch-parallel-bead-agents");
    expect(prompts[2]).toContain("Dependencies:");
    expect(calls.some((call) => call.includes("bd create"))).toBe(true);
  });

  test("generic approval words without explicit dependency-graph approval do not confirm", async () => {
    const { $, calls } = createMockShell();
    const { client, prompts } = createMockClient();
    const hook = createHandoffHook(client, $, true, "tests/fixtures/*.md");

    await hook(
      {},
      createMessage(
        "Plan complete and saved to `tests/fixtures/sample-plan-with-deps.md`. Ready to execute?"
      )
    );
    await hook({}, createMessage("Let's use parallel-beads execution."));
    await hook({}, createMessage("I confirm we should move fast, but I want to discuss the graph."));

    expect(prompts).toHaveLength(2);
    expect(calls.some((call) => call.includes("bd create"))).toBe(false);
  });

  test("updated dependency graph message refreshes analysis and re-renders graph without creating beads", async () => {
    const planPath = await writeTempPlan(INITIAL_TEMP_PLAN);
    const { $, calls } = createMockShell();
    const { client, prompts } = createMockClient();
    const hook = createHandoffHook(client, $, true, "*.md");

    await hook(
      {},
      createMessage(`Plan complete and saved to \`${planPath}\`. Ready to execute?`)
    );
    await hook({}, createMessage("Let's use parallel-beads execution."));

    expect(prompts[1]).toContain("Task 2: Feature -> depends on Task 1 (chunk-fallback)");

    await fs.writeFile(planPath, UPDATED_TEMP_PLAN, "utf-8");
    await hook({}, createMessage("I updated the dependency graph in the plan. Please refresh it."));

    expect(prompts).toHaveLength(3);
    expect(prompts[2]).toContain("Task 2: Feature -> depends on Task 1 (explicit)");
    expect(calls.some((call) => call.includes("bd create"))).toBe(false);
  });

  test("strategy change while awaiting dependency confirmation switches to regular beads flow", async () => {
    const { $, calls } = createMockShell();
    const { client, prompts } = createMockClient();
    const hook = createHandoffHook(client, $, true, "tests/fixtures/*.md");

    await hook(
      {},
      createMessage(
        "Plan complete and saved to `tests/fixtures/sample-plan-with-deps.md`. Ready to execute?"
      )
    );
    await hook({}, createMessage("Let's use parallel-beads execution."));
    await hook({}, createMessage("Actually, switch to beads-driven development instead."));

    expect(prompts).toHaveLength(3);
    expect(prompts[2]).toContain("super-beads:beads-driven-development");
    expect(prompts[2]).not.toContain("super-beads:dispatch-parallel-bead-agents");
    expect(calls.some((call) => call.includes("bd create"))).toBe(true);
  });

  test("natural explicit confirmation proceeds without repeating dependency graph", async () => {
    const { $, calls } = createMockShell();
    const { client, prompts } = createMockClient();
    const hook = createHandoffHook(client, $, true, "tests/fixtures/*.md");

    await hook(
      {},
      createMessage(
        "Plan complete and saved to `tests/fixtures/sample-plan-with-deps.md`. Ready to execute?"
      )
    );
    await hook({}, createMessage("Let's use parallel-beads execution."));
    await hook({}, createMessage("Looks good, proceed."));

    expect(prompts).toHaveLength(3);
    expect(prompts[2]).toContain("super-beads:dispatch-parallel-bead-agents");
    expect(calls.some((call) => call.includes("bd create"))).toBe(true);
  });

  test("direct dependency correction phrasing refreshes the graph without creating beads", async () => {
    const planPath = await writeTempPlan(INITIAL_TEMP_PLAN);
    const { $, calls } = createMockShell();
    const { client, prompts } = createMockClient();
    const hook = createHandoffHook(client, $, true, "*.md");

    await hook(
      {},
      createMessage(`Plan complete and saved to \`${planPath}\`. Ready to execute?`)
    );
    await hook({}, createMessage("Let's use parallel-beads execution."));

    await fs.writeFile(planPath, UPDATED_TEMP_PLAN, "utf-8");
    await hook({}, createMessage("Task 2 should depend on Task 1."));

    expect(prompts).toHaveLength(3);
    expect(prompts[2]).toContain("Task 2: Feature -> depends on Task 1 (explicit)");
    expect(calls.some((call) => call.includes("bd create"))).toBe(false);
  });
});
