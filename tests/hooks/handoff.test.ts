import { describe, expect, test } from "bun:test";
import { buildBeadsExecutionMessage } from "../../src/hooks/handoff";

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
});
