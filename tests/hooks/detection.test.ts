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
