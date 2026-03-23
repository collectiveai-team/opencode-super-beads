# opencode-super-beads Design

## Overview

An OpenCode plugin that bridges superpowers' workflow engine with beads' task management. It adds a third execution path -- beads-driven development -- to the existing superpowers pipeline without modifying either upstream plugin.

**Position in the pipeline:**

```
brainstorming -> spec -> writing-plans -> [HANDOFF INTERCEPTION]
                                               |
                                  +------------+----------------+
                                  |            |                |
                           subagent-driven  executing-plans  beads-driven
                           (superpowers)    (superpowers)    (THIS PLUGIN)
```

**Design principles:**
- Zero changes to upstream plugins (superpowers, opencode-beads)
- Markdown specs and plans stay on disk for human review
- Beads is the task graph and scheduler; superpowers is the execution engine
- Dual tracking: beads for persistence, TodoWrite for session UX
- Reference upstream prompt templates by path, don't copy them

## Plugin Components

Three pieces compose the plugin:

| Component | Type | Purpose |
|---|---|---|
| `chat.message` hook | Event handler | Detects plan completion, injects execution choice with beads option |
| Plan-to-beads converter | Internal function | Parses plan markdown, creates epic + child issues via `bd` CLI |
| `beads-driven-development` skill | Skill file | Full execution engine: `bd ready` loop, subagent dispatch, two-stage review, dual tracking |

### Dependencies

**Runtime (required):**
- `bd` CLI (upstream [steveyegge/beads](https://github.com/steveyegge/beads)) -- validated at startup via `bd version`
- Superpowers skill files on disk -- prompt templates validated at startup by checking file existence

**Recommended (optional):**
- `opencode-beads` plugin -- provides context injection (`bd prime` on session start) and `/beads:*` slash commands for manual interaction. Not required for this plugin to function.

**Build-time:**
- `@opencode-ai/plugin` -- plugin type definitions
- `@opencode-ai/sdk` -- client API types

No npm peer dependencies. Both runtime dependencies are validated at startup with clear error messages on failure.

## Handoff Interception

### Trigger

The plugin's `chat.message` hook watches assistant messages for the plan-completion signal. Writing-plans always ends with a message matching both:
1. A path matching `docs/superpowers/plans/*.md` (or user-configured plan location)
2. The phrase "ready to execute" (case-insensitive)

Both must be present (case-insensitive substring match) to avoid false positives.

### Injection

A synthetic `noReply` message (same pattern opencode-beads uses for context injection) presents three execution options:

```
<execution-options>
Plan detected. Choose an execution strategy:

1. Subagent-driven development (superpowers default)
   Fresh subagent per task, two-stage review. Uses plan file for task order.

2. Sequential execution (no subagents)
   Execute in current session using superpowers:executing-plans.

3. Beads-driven development (requires bd)
   Creates epic + task beads from the plan. Uses bd ready for task selection,
   subagent dispatch with two-stage review, persistent tracking across sessions.
</execution-options>
```

### Prerequisite check

Before showing option 3, the hook runs `bd version`. If `bd` is not installed, option 3 is omitted and the injection degrades to the standard superpowers two-option handoff.

### Choice detection

The injected `<execution-options>` message is a `noReply` system message -- the LLM reads it and responds to the user. The user's next message (or the LLM's interpretation of it) determines the path. The hook watches the next assistant message for choice signals:

- Contains "beads-driven" or "beads" + "execution" (case-insensitive substring) → beads path
- Contains "subagent-driven" or references superpowers:subagent-driven-development → superpowers subagent path (plugin does nothing, superpowers handles it)
- Contains "sequential" or "executing-plans" → superpowers sequential path (plugin does nothing)
- No clear match → plugin does nothing (lets the conversation continue naturally)

The hook only needs to detect the beads path. For the other two options, the existing superpowers skills handle execution without intervention.

### After beads-driven is selected

Two actions in sequence:
1. Run the plan-to-beads converter
2. Inject the `beads-driven-development` skill content as a follow-up system message, which instructs the LLM to begin the execution loop

## Plan-to-Beads Converter

### Input

Path to the plan file (captured from the handoff message).

### Parsing

The plan file has a well-defined structure enforced by the writing-plans skill:

```
# Feature Name Implementation Plan    -> epic title
**Goal:** ...                          -> epic description
---
## Chunk 1: Name                       -> grouping context
### Task 1: Component Name             -> child issue title
**Files:** ...                         -> included in issue description
- [ ] Step 1...                        -> referenced, not copied
### Task 2: ...
## Chunk 2: ...
### Task 3: ...
```

### Issue creation

| Plan element | Bead issue | Command |
|---|---|---|
| Plan header | Epic | `bd create "Feature Name" --type epic -d "Goal: ... \| Plan: <path>"` |
| Each `### Task N` | Child task | `bd create "Task N: Component" --parent <epic-id> -d "See plan.md, Task N \| Files: ..."` |

Task descriptions are lightweight. The full task spec (code snippets, exact commands, expected output) stays in the plan file. The bead description contains:
- A reference to the plan file and task number
- The `**Files:**` section (so `bd ready` output is informative)
- The task title

### Dependency wiring

Tasks within a chunk are independent (can run in parallel). Tasks in chunk N+1 depend on all tasks in chunk N completing:

```
Chunk 1: Task 1 --+
          Task 2 --+  (no deps between them)
                   |
Chunk 2: Task 3 ---- blocks: [Task 1, Task 2]
          Task 4 ---- blocks: [Task 1, Task 2]
```

Wired via `bd dep add <task-id> <dependency-id> --type blocks` for each cross-chunk edge.

### Output

A mapping of `{ taskNumber -> beadId }` used by the execution skill.

### Idempotency

Before creating, the converter checks `bd list --type epic` for an existing epic referencing the same plan file. If found, it skips creation and rebuilds the mapping from existing issues. This handles session resume.

## Beads-Driven Execution Engine

### Core Loop

```
Initialize:
  bd ready -> get available tasks
  Build TodoWrite from bd list (sync session UI with beads state)

Loop:
  +-> bd ready
  |   +- No tasks ready + all closed -> DONE -> finishing-a-development-branch
  |   +- No tasks ready + some open  -> BLOCKED -> report & pause
  |   +- Tasks available -> pick first ready task
  |
  |   Task in mapping? -> Read full task spec from plan file (using task-number reference)
  |   Task NOT in mapping? -> Ad-hoc task: use bead description directly as task spec
  |
  |   bd update <id> --claim
  |   TodoWrite: mark in_progress
  |
  |   Dispatch implementer subagent
  |   +- DONE -> proceed to review
  |   +- DONE_WITH_CONCERNS -> read concerns, proceed to review
  |   +- NEEDS_CONTEXT -> provide context, re-dispatch (max 3 attempts, then escalate to user)
  |   +- BLOCKED -> bd update <id> --status blocked, continue loop
  |
  |   Dispatch spec reviewer subagent
  |   +- Approved -> proceed
  |   +- Issues Found -> implementer fixes -> re-review (loop max 3)
  |
  |   Dispatch code quality reviewer subagent
  |   +- Approved -> proceed
  |   +- Issues Found -> implementer fixes -> re-review (loop max 3)
  |
  |   bd close <id> --reason "Implemented and reviewed"
  |   TodoWrite: mark completed
  +---loop
```

### Subagent prompt templates

The skill reuses superpowers' existing prompt templates by reference (filesystem path):
- `implementer-prompt.md` from subagent-driven-development
- `spec-reviewer-prompt.md` from subagent-driven-development
- `code-quality-reviewer-prompt.md` from subagent-driven-development

The implementer prompt includes the full task text extracted from the plan file. The subagent never reads the plan file itself.

### Task selection

The key difference from subagent-driven-development: task selection uses `bd ready` instead of reading the plan linearly. This means:
- External blockers (manually added via `bd dep add`) are respected
- Tasks can be reordered without touching the plan file
- If someone closes a task manually, the skill skips it
- Tasks within the same chunk can be picked in any order

### Session resume

On start, the skill checks `bd list --parent <epic-id>`:
- Closed tasks: skip (mark completed in TodoWrite)
- Open tasks: available for selection
- In-progress tasks (from a crashed session): ask user whether to continue or restart

TodoWrite is rebuilt from beads state, not from session memory.

### Model selection

Same strategy as subagent-driven-development:
- Cheap models for mechanical tasks (file creation, boilerplate)
- Standard models for implementation
- Capable models for design decisions and reviews

## Dual Tracking Protocol

Every task state transition updates both beads and TodoWrite. Beads is the source of truth; TodoWrite is rebuilt from it.

### Initialization

```
bd list --parent <epic-id> --json
  -> for each issue:
      status=closed      -> TodoWrite: completed
      status=in_progress -> TodoWrite: in_progress (ask user about resume)
      status=blocked     -> TodoWrite: pending (annotate "blocked by X")
      status=open        -> TodoWrite: pending
```

### State transitions during execution

| Event | Beads | TodoWrite |
|---|---|---|
| Task picked from `bd ready` | `bd update <id> --claim` | Mark `in_progress` |
| Implementer returns BLOCKED | `bd update <id> --status blocked` | Mark `pending`, annotate reason |
| Code review passes | `bd close <id> --reason "..."` | Mark `completed` |
| All tasks in epic closed | Plugin explicitly runs `bd close <epic-id>` | All items completed |
| External blocker resolved | User ran `bd update`, status -> open | Detected on next `bd ready`, added back |

### Conflict resolution

TodoWrite re-syncs from `bd list` at the start of each loop iteration. If they disagree, beads wins.

## Error Handling

### Startup failures

| Check | Failure | Behavior |
|---|---|---|
| `bd version` | `bd` not installed | Plugin disables beads features. Handoff hook omits beads option. Logs: "bd CLI not found -- beads-driven execution disabled" |
| Superpowers prompt templates | Files not at expected paths | Plugin disables itself. Logs: "superpowers prompt templates not found at [paths] -- install superpowers plugin" |
| `.beads/` directory | Not initialized in project | Converter runs `bd init` with project name as prefix. Prompts user for confirmation. |

### Plan parsing failures

| Situation | Behavior |
|---|---|
| Plan doesn't match expected structure | Abort conversion, show expected vs. found, suggest re-running writing-plans |
| Plan has no `### Task` headings | Abort -- a plan with no tasks isn't executable |
| Plan has tasks but no `## Chunk` headings | Treat all tasks as one chunk (no dependencies, all immediately ready) |
| Empty chunk (heading with no tasks) | Ignored -- no issues created, no dependency edges |

### Execution loop failures

| Situation | Behavior |
|---|---|
| `bd ready` returns error | Retry once. If still failing, report and pause. |
| `bd close` fails | Log error, continue. Code was completed; beads state can be fixed manually. |
| Implementer returns BLOCKED | `bd update <id> --status blocked`, log reason, continue to next ready task. If nothing ready, report and pause. |
| Implementer returns NEEDS_CONTEXT 3 times | Escalate to user: show what context was requested and what was provided. Let user supply missing context or skip task. |
| Spec reviewer loops 3 times | Escalate to user: show concerns and attempts. Let user override or intervene. |
| Session crash mid-task | On resume: detect in_progress task, ask user to continue or restart. |

### Divergence between beads and plan file

| Situation | Behavior |
|---|---|
| User manually closes a bead | Skill skips it. TodoWrite shows completed. |
| User adds a new bead under epic | No plan reference. Treat as ad-hoc: show description to implementer directly. |
| User adds external dependency | Task drops from `bd ready` until resolved. No special handling needed. |
| Plan file edited after beads created | Implementer gets updated content (reads at execution time, not conversion time). If tasks added/removed, mapping breaks -- skill detects mismatch and asks user to re-run converter. |

### Guiding principle

Tracking failures (beads state) never block code execution. Code execution failures always stop the loop. The code is the product; beads is the bookkeeping.

## Source Structure

```
opencode-super-beads/
+-- src/
|   +-- plugin.ts              # Main entry point (exports SuperBeadsPlugin)
|   +-- hooks/
|   |   +-- handoff.ts         # chat.message hook: detect plan completion, inject options
|   +-- converter/
|   |   +-- plan-to-beads.ts   # Parse plan markdown -> bd create calls -> task mapping
|   +-- vendor.ts              # Load skill + prompt files from vendor/
+-- vendor/
|   +-- skills/
|   |   +-- beads-driven-development.md   # The execution skill content
|   +-- prompts/
|       +-- execution-options.md          # Handoff injection template
+-- package.json
+-- tsconfig.json
+-- README.md
+-- LICENSE
```

| File | Responsibility |
|---|---|
| `plugin.ts` | Wire hooks + config. Export `Plugin` function. Check `bd` availability on init. |
| `hooks/handoff.ts` | Pattern match plan completion, check `bd` exists, inject execution options. On beads selection, call converter then signal skill invocation. |
| `converter/plan-to-beads.ts` | Pure function: plan file path -> parse markdown -> `bd create` commands -> wire dependencies -> return `taskNumber -> beadId` mapping. Handle idempotency. |
| `vendor.ts` | Load markdown files from `vendor/` at startup. |
| `beads-driven-development.md` | Skill content for the execution engine. References superpowers prompt templates by path. |
| `execution-options.md` | Template for handoff injection message. Separated from code for easy editing. |

## Testing Strategy

### Layer 1: Unit tests (no external dependencies)

- **Plan parser:** Given plan markdown string, correctly extract title, goal, chunks, tasks, task-to-chunk mapping. Pure function, fixture strings.
- **Dependency wiring:** Given chunks with tasks, produce correct dependency graph.
- **Handoff detection:** Given message string, correctly identify plan-completion messages. Positive cases, near-misses, edge cases.
- **TodoWrite sync:** Given `bd list --json` output, produce correct TodoWrite state.

### Layer 2: Integration tests (requires `bd` CLI)

- **Converter end-to-end:** Fixture plan file -> `bd` commands -> verify epic/tasks exist with correct fields and dependencies.
- **Idempotency:** Run converter twice -> no duplicate issues.
- **Session resume:** Create issues, close some, run initialization -> verify TodoWrite state matches.
- Runs against temp `.beads/` directory, cleaned up after.

### Layer 3: Smoke test (requires `bd` + superpowers)

- **Full loop:** Plan file -> converter -> one task cycle (pick -> implement -> review -> close).
- Expensive (token cost). Run manually, not in CI.
- Verifies prompt template paths resolve and skill produces valid agent behavior.

### What we don't test

- Superpowers behavior (their responsibility)
- `bd` CLI correctness (upstream's responsibility)
- OpenCode plugin loading mechanics (SDK's responsibility)

## Configuration

### Installation

```jsonc
// opencode.jsonc
{
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "opencode-beads",
    "opencode-super-beads"
  ]
}
```

### Prerequisites

- `bd` CLI installed and in PATH
- Superpowers plugin installed
- `opencode-beads` recommended but optional

### Plugin settings

Zero-config by default. Optional overrides:

| Setting | Default | Description |
|---|---|---|
| Plan path pattern | `docs/superpowers/plans/*.md` | Where to look for plan files |
| Handoff detection | `true` | Enable/disable chat.message interception |

No global config changes. The plugin only reads, never modifies external configuration.
