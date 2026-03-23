---
name: beads-driven-development
description: Use when executing a superpowers implementation plan through beads task scheduling without modifying the superpowers skill tree.
---

# Beads-Driven Development

Execute a plan using beads as the task manager. Uses `bd ready` for task selection,
subagent dispatch with two-stage review, and dual tracking (beads + TodoWrite).

## Prerequisites

For the normal plugin handoff flow, the plugin prepares beads initialization and
plan-to-beads conversion before invoking this skill.

- `bd` CLI installed and available in PATH
- Superpowers prompt templates available (implementer-prompt.md, spec-reviewer-prompt.md, code-quality-reviewer-prompt.md)

If invoking this skill manually, also ensure:

- Beads is initialized in the project (`.beads/` directory exists)
- The plan has already been converted to beads issues (epic + child tasks)

## Initialization

Before entering the execution loop, sync session state with beads:

```
bd list --parent <epic-id> --json
  -> for each issue:
      status=closed      -> TodoWrite: completed
      status=in_progress -> TodoWrite: in_progress
                            Ask user: "Task X was in progress. Continue or restart?"
      status=blocked     -> TodoWrite: pending (annotate "blocked by <dep-id>")
      status=open        -> TodoWrite: pending
```

## Core Loop

```
Loop:
  +-> bd ready --json
  |   +- No tasks ready + all closed -> DONE -> invoke superpowers:finishing-a-development-branch
  |   +- No tasks ready + some open  -> BLOCKED -> show `bd list --status blocked`, report & pause
  |   +- Tasks available -> pick first ready task
  |
  |   Task in task-number-to-bead-id mapping?
  |   +- YES -> Read full task spec from plan file (using task-number reference)
  |   +- NO  -> Ad-hoc task: use bead description directly as task spec
  |
  |   bd update <id> --claim
  |   TodoWrite: mark in_progress
  |
  |   Dispatch implementer subagent (see superpowers subagent-driven-development/implementer-prompt.md)
  |   Provide: full task text from plan file + context about where task fits
  |   +- DONE -> proceed to spec review
  |   +- DONE_WITH_CONCERNS -> read concerns, proceed to spec review
  |   +- NEEDS_CONTEXT -> provide context, re-dispatch (max 3 attempts, then escalate to user)
  |   +- BLOCKED -> bd update <id> --status blocked --reason "...", continue loop
  |
  |   Dispatch spec reviewer subagent (see superpowers subagent-driven-development/spec-reviewer-prompt.md)
  |   +- Approved -> proceed to code quality review
  |   +- Issues Found -> implementer fixes -> re-review (max 3 iterations, then escalate to user)
  |
  |   Dispatch code quality reviewer subagent (see superpowers subagent-driven-development/code-quality-reviewer-prompt.md)
  |   ONLY after spec review passes
  |   +- Approved -> proceed
  |   +- Issues Found -> implementer fixes -> re-review (max 3 iterations, then escalate to user)
  |
  |   bd close <id> --reason "Implemented and reviewed"
  |   TodoWrite: mark completed
  |
  |   Re-sync TodoWrite from bd list (catches external changes)
  +---loop

After all tasks complete:
  bd close <epic-id> --reason "All tasks completed"
  Dispatch final code reviewer subagent for entire implementation
  Invoke superpowers:finishing-a-development-branch
```

## Task Selection via bd ready

The key difference from subagent-driven-development: task order comes from `bd ready`, not from reading the plan linearly.

This means:
- External blockers (added via `bd dep add`) are automatically respected
- Tasks can be reordered without editing the plan file
- Tasks manually closed (e.g., already done) are automatically skipped
- Tasks within the same chunk can be picked in any order
- Cross-chunk dependencies are enforced by beads' dependency graph

## Dual Tracking Protocol

Every state transition updates BOTH beads and TodoWrite:

| Event | Beads | TodoWrite |
|---|---|---|
| Task picked from bd ready | `bd update <id> --claim` | Mark in_progress |
| Implementer returns BLOCKED | `bd update <id> --status blocked` | Mark pending, annotate reason |
| Code review passes | `bd close <id> --reason "..."` | Mark completed |
| All tasks closed | `bd close <epic-id>` | All completed |

If they disagree, beads wins. TodoWrite re-syncs from `bd list` each iteration.

## Model Selection

Same strategy as superpowers subagent-driven-development:
- Cheap/fast models for mechanical tasks (isolated functions, clear specs, 1-2 files)
- Standard models for integration and judgment tasks (multi-file, pattern matching)
- Most capable models for architecture, design, and review tasks

## Error Handling

- `bd ready` error: retry once, then report and pause
- `bd close` error: log warning, continue (code is done; beads state can be fixed manually)
- Implementer NEEDS_CONTEXT 3 times: escalate to user with what was requested and provided
- Spec reviewer loops 3 times: escalate to user with reviewer concerns
- Tracking failures never block code execution. Code failures always stop the loop.

## Red Flags (same as subagent-driven-development)

**Never:**
- Skip reviews (spec compliance OR code quality)
- Proceed with unfixed issues
- Dispatch multiple implementation subagents in parallel
- Make subagent read plan file (provide full text instead)
- Skip re-review after implementer fixes
- Start code quality review before spec compliance passes
- Move to next task while either review has open issues
