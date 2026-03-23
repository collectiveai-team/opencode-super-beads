# Native Skill Install Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make beads-driven development discoverable as a real OpenCode skill without modifying the superpowers tree, while keeping the plugin handoff and command alias.

**Architecture:** Move the bundled workflow instructions into a real `skills/` tree, add plugin startup logic that installs that skill into OpenCode's native personal skills directory under a `super-beads` namespace, and update handoff/alias code to use the same bundled source. Keep the current handoff interception behavior, but make the native skill the primary surface.

**Tech Stack:** TypeScript, Bun, OpenCode plugin SDK, Node fs/path APIs

---

## Chunk 1: Native Skill Packaging

### Task 1: Define the bundled skill layout

**Files:**
- Create: `skills/beads-driven-development/SKILL.md`
- Modify: `package.json`
- Test: `tests/vendor.test.ts`

- [ ] **Step 1: Update tests to expect the bundled skill from the new `skills/` layout**
- [ ] **Step 2: Run the vendor tests and verify they fail for the missing new layout**
- [ ] **Step 3: Move the bundled workflow content into `skills/beads-driven-development/SKILL.md` with skill frontmatter**
- [ ] **Step 4: Update package contents so the published plugin includes `skills/`**
- [ ] **Step 5: Re-run the vendor tests and verify they pass**

### Task 2: Install the native skill on plugin startup

**Files:**
- Create: `src/skills/install.ts`
- Modify: `src/plugin.ts`
- Test: `tests/skills/install.test.ts`

- [ ] **Step 1: Write failing tests for installing the bundled skill into `OPENCODE_CONFIG_DIR`/`~/.config/opencode/skills/super-beads/`**
- [ ] **Step 2: Run the new installer tests and verify they fail because the installer does not exist yet**
- [ ] **Step 3: Implement the installer with idempotent directory creation and file copy**
- [ ] **Step 4: Call the installer from plugin startup and warn if installation fails**
- [ ] **Step 5: Re-run installer tests and verify they pass**

## Chunk 2: Primary Skill UX

### Task 3: Make handoff point at the native skill surface

**Files:**
- Modify: `src/hooks/handoff.ts`
- Modify: `src/hooks/detection.ts`
- Modify: `vendor/prompts/execution-options.md`
- Test: `tests/hooks/detection.test.ts`

- [ ] **Step 1: Add a failing detection test for `super-beads:beads-driven-development` references**
- [ ] **Step 2: Run the detection tests and verify they fail**
- [ ] **Step 3: Update handoff messaging to direct execution through the native skill while preserving execution context injection**
- [ ] **Step 4: Update choice detection and prompt copy to use skill-first language**
- [ ] **Step 5: Re-run detection tests and verify they pass**

### Task 4: Keep the command as a secondary alias

**Files:**
- Modify: `src/plugin.ts`
- Modify: `README.md`

- [ ] **Step 1: Keep `super-beads:execute` registered as a manual alias backed by the same bundled skill content**
- [ ] **Step 2: Document the native skill as the default and the command as a fallback/manual entrypoint**
- [ ] **Step 3: Run the full test suite and typecheck**

Plan complete and saved to `docs/superpowers/plans/2026-03-23-native-skill-install.md`. Ready to execute?
