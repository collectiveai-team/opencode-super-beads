import { describe, expect, test } from "bun:test";
import { loadPrompt, loadSkill, loadSkillTemplate } from "../src/vendor";

describe("vendor", () => {
  describe("loadSkill", () => {
    test("loads beads-driven-development skill content", async () => {
      const content = await loadSkill("beads-driven-development");
      expect(content).not.toBeNull();
      expect(content).toContain("Beads-Driven Development");
    });

    test("loads packaged skill frontmatter", async () => {
      const content = await loadSkill("beads-driven-development");
      expect(content).not.toBeNull();
      expect(content).toContain("name: beads-driven-development");
    });

    test("loads skill template without frontmatter for runtime injection", async () => {
      const content = await loadSkillTemplate("beads-driven-development");
      expect(content).not.toBeNull();
      expect(content).toContain("# Beads-Driven Development");
      expect(content).not.toContain("name: beads-driven-development");
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
