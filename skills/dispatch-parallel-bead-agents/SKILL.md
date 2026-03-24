---
name: dispatch-parallel-bead-agents
description: >-
  Use when executing a plan through parallel beads task scheduling with
  DAG-based worktree isolation, fine-grained dependency analysis, and
  up to 3 concurrent implementation lanes.
---

# Dispatch Parallel Bead Agents

Execute a plan using beads as the task manager with parallel lane dispatch.
Each lane runs in its own git worktree with DAG-based branching.
Up to 3 lanes run concurrently.

## Terminology

**Base branch:** The branch checked out when execution starts (typically a feature branch, not `main`). Lane branches diverge from it and merge back at the end.

## Prerequisites

- `bd` CLI installed and available in PATH
- Beads initialized in the project (`.beads/` directory exists)
- Plan converted to beads issues with fine-grained dependencies (epic + child tasks)
- Superpowers prompt templates available (implementer-prompt.md, spec-reviewer-prompt.md, code-quality-reviewer-prompt.md)

## Initialization

Before entering the execution loop, sync session state with beads:

```
bd list --parent <epic-id> --json
  -> for each issue:
      status=closed      -> TodoWrite: completed
                            PRESERVE lane branch (DAG backbone)
      status=in_progress -> TodoWrite: in_progress
                            Ask user: "Task X was in progress. Continue or restart?"
                            Only clean up branch if user chooses "restart"
      status=blocked     -> TodoWrite: pending (annotate "blocked by <dep-id>")
      status=open        -> TodoWrite: pending
                            Clean up any stale worktrees for open beads
```

Additionally:
- Verify worktree directory is set up (follow using-git-worktrees conventions)
- Build dependency graph from beads: `bd dep tree <epic-id>`
- If a completed task's lane branch is missing, reopen the bead (`bd reopen <id>`)

## Core Loop

```
Loop:
  +-> bd ready --json
  |   +- No tasks ready + all closed -> COMPLETION (below)
  |   +- No tasks ready + some open  -> BLOCKED -> show `bd list --status blocked`, report & pause
  |   +- Tasks available -> select up to 3 (MAX_LANES) ready tasks
  |
  |   For each selected task:
  |     bd update <id> --claim
  |     TodoWrite: mark in_progress
  |     Create worktree with DAG branching (see below)
  |
  |   Dispatch all lanes in parallel (each as a single Task subagent)
  |   Each lane runs: Implement -> Spec review -> Code quality review
  |   (See lane prompt template for details)
  |
  |   Wait for all lanes to complete (batch semantics)
  |
  |   For each completed lane:
  |     DONE -> bd close <id>, TodoWrite: mark completed
  |     BLOCKED -> bd update <id> --status blocked, TodoWrite: mark pending
  |     FAILED -> escalate to user, bead stays in_progress
  |     NEEDS_CONTEXT -> provide context, re-dispatch (max 3 round-trips)
  |
  |   Loop back to bd ready (newly unblocked tasks may be available)
  +---loop

Completion (after all tasks closed):
  Topological merge of all lane branches -> integration branch (from base branch HEAD)
  Final integration review (full diff)
  Final code review (advisory, follows requesting-code-review skill)
  Merge integration branch -> base branch
  bd close <epic-id> --reason "All tasks completed"
  Cleanup all worktrees, lane branches, temp-base branches
  Invoke finishing-a-development-branch
```

Graceful degradation: when only 1 task is ready, skip worktree overhead and run in-place (same as beads-driven-development). If execution starts in-place and later 2+ tasks become ready, commit in-place work and create a lane branch before branching parallel worktrees.

## DAG-Based Worktree Branching

Each task's worktree branches from the state that includes its dependencies' completed work. The base branch is NEVER touched during execution.

| Dependencies | Branch from |
|---|---|
| No deps | HEAD of base branch |
| 1 dep | That dep's completed lane branch |
| N deps | Temporary merge branch of all dep lane branches |

Creating a worktree for a task with no deps:

```bash
git worktree add <worktree-dir>/lane-<bead-id> -b lane/<bead-id>
```

Creating a worktree for a task with 1 dep (e.g., depends on Task A):

```bash
git worktree add <worktree-dir>/lane-<bead-id> -b lane/<bead-id> lane/<dep-bead-id>
```

Creating a worktree for a task with N deps (e.g., depends on Tasks B and C):

```bash
git checkout -b temp-base/<bead-id> lane/<dep-B-bead-id>
git merge lane/<dep-C-bead-id> --no-ff -m "Merge deps for task (B+C)"
git worktree add <worktree-dir>/lane-<bead-id> -b lane/<bead-id> temp-base/<bead-id>
```

If the dependency merge conflicts, dispatch a conflict resolution agent. If unresolvable after 3 attempts, escalate to user. This usually indicates a missing dependency edge.

After creating each worktree, run project setup (auto-detect: npm install, cargo build, etc.) and verify clean baseline (tests pass) before dispatching the lane.

## Lane Execution

Each lane is dispatched as a single Task subagent running all three pipeline stages within one session:

1. **Implement** using implementer-prompt.md criteria
2. **Spec review** using spec-reviewer-prompt.md criteria (max 3 fix/re-review iterations)
3. **Code quality review** using code-quality-reviewer-prompt.md criteria (max 3 iterations)

The lane prompt provides: full task spec text (inline, never make subagent read plan file), context about where the task fits, worktree path, review criteria.

### NEEDS_CONTEXT Handling

- Attempt 1-2: Lane subagent self-resolves by reading files in its worktree
- Attempt 3: Returns NEEDS_CONTEXT with: what it needs, pipeline stage reached, work summary
- Orchestrator re-dispatches with: requested context, previous status, stage to resume, note about partial work in worktree
- After 3 orchestrator-level round-trips: mark FAILED, escalate to user

## Task Spec Provisioning

Before dispatching, resolve each task's full text:
1. Check task-number-to-bead-id mapping (from plan conversion)
2. If mapped: read full spec from plan file by task number, provide inline
3. If ad-hoc: use bead description directly

## Final Merge to Base Branch

After ALL tasks complete, merge everything via an integration branch:

1. Create integration branch from base branch HEAD
2. Merge each lane branch in topological order (deps before dependents)
3. Run final integration review on full diff (integration vs HEAD)
4. If issues: fix agent -> re-review (max 3 iterations, then escalate)
5. Fast-forward base branch to integration (or merge if base has diverged - escalate to user for external changes)
6. Cleanup: remove all worktrees, lane branches, temp-base branches

## Dual Tracking Protocol

| Event | Beads | TodoWrite |
|---|---|---|
| Task dispatched to lane | `bd update <id> --claim` | Mark in_progress |
| Lane returns BLOCKED | `bd update <id> --status blocked` | Mark pending + reason |
| Lane returns FAILED | Stays `in_progress` (user decides) | Mark pending + "FAILED: reason" |
| Lane passes all reviews | `bd close <id>` | Mark completed |
| All tasks closed | (proceed to final merge) | All completed |
| Final merge passes | `bd close <epic-id>` | (all already completed) |

If beads and TodoWrite disagree, beads wins. TodoWrite re-syncs from `bd list` periodically.

## Model Selection

- Cheap/fast: Mechanical tasks (isolated functions, clear specs, 1-2 files)
- Standard: Integration tasks (multi-file, pattern matching)
- Most capable: Architecture, design, review, integration review, merge conflict resolution

## Error Handling

- `bd ready` error: retry once, then report and pause
- `bd close` error: log warning, continue
- Lane BLOCKED: update bead, continue with remaining lanes
- Lane FAILED: escalate to user
- Dependency merge conflict: resolution agent, max 3 attempts, then escalate
- Final merge conflict: resolution agent per step, escalate if unresolvable
- Worktree creation failure: fall back to sequential for this task
- Dependency cycle during conversion: abort, report to user
- Tracking failures never block code. Code failures always stop the lane.
- Cleanup failures: log warning, continue (stale worktrees cleaned manually)

## Red Flags

**Never:**
- Merge anything into the base branch during execution (only at the very end)
- Skip reviews (spec or code quality) in any lane
- Skip the final integration review
- Proceed with unfixed merge or integration issues
- Dispatch more than MAX_LANES (3) concurrent lanes
- Make subagents read the plan file (provide full text)
- Create a task's worktree from base branch HEAD when it has dependencies
- Run lane subagents in the base branch worktree when parallel lanes are active
- Delete a completed task's lane branch before the final merge
- Skip dependency cycle validation during conversion
