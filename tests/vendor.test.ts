import { describe, expect, test } from "bun:test";
import { loadSkill, loadPrompt } from "../src/vendor";

describe("vendor", () => {
  describe("loadSkill", () => {
    test("loads beads-driven-development skill content", async () => {
      const content = await loadSkill("beads-driven-development");
      expect(content).not.toBeNull();
      expect(content).toContain("Beads-Driven Development");
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
