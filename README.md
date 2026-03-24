# opencode-super-beads

An [OpenCode](https://opencode.ai) plugin that bridges [superpowers](https://github.com/obra/superpowers)' workflow engine with [beads](https://github.com/steveyegge/beads)' task management.

Adds **beads-driven development** as a third and fourth execution path alongside superpowers' subagent-driven and sequential execution modes.

## What It Does

When superpowers' `writing-plans` skill finishes creating an implementation plan, this plugin intercepts the handoff and offers four execution strategies:

1. **Subagent-driven development** (superpowers default) -- linear plan execution with subagent dispatch
2. **Sequential execution** -- execute in the current session
3. **Beads-driven development** (this plugin) -- creates beads issues from the plan, uses `bd ready` for task selection
4. **Parallel beads-driven development** (this plugin) -- same as above, but runs up to 3 tasks concurrently in isolated git worktrees with DAG-based dependency branching

### Why Beads-Driven?

- **Persistent tracking** -- beads state survives session crashes. Resume exactly where you left off.
- **Dependency-aware scheduling** -- `bd ready` only returns unblocked tasks. Add external blockers (e.g., "wait for API key") without editing the plan.
- **Reorderable** -- change task priority in beads without touching the plan file.
- **Observable** -- `bd list`, `bd stats`, `bd list --status blocked` give you project visibility at any time.

### Why Parallel?

- **Faster execution** -- independent tasks run concurrently in isolated worktrees (up to 3 lanes)
- **DAG-aware branching** -- each task's worktree branches from its dependencies' completed work, not from base branch HEAD
- **Fine-grained dependencies** -- explicit `Depends-On:` annotations in the plan, file-overlap inference, and chunk-order fallback
- **Safe integration** -- topological merge at the end with a cross-lane integration review before touching the base branch

### What It Doesn't Change

- Superpowers' brainstorming, spec writing, and plan writing remain untouched
- Markdown spec and plan files stay on disk for human review
- The same subagent prompt templates (implementer, spec reviewer, code quality reviewer) are used
- TDD discipline, two-stage review loops, and all quality gates remain in place

## Prerequisites

### Required

- **[OpenCode](https://opencode.ai)** -- the AI coding environment
- **[beads](https://github.com/steveyegge/beads)** -- install the `bd` CLI and ensure it's in your PATH
- **[superpowers](https://github.com/obra/superpowers)** -- the skills framework (installed as an OpenCode plugin)

### Recommended

- **[opencode-beads](https://github.com/joshuadavidthomas/opencode-beads)** -- provides context injection and `/beads:*` slash commands. Not required by this plugin, but useful for manual interaction with beads.

## Installation

### 1. Install beads CLI

Follow the instructions at [steveyegge/beads](https://github.com/steveyegge/beads) to install the `bd` CLI.

Verify it's working:

```bash
bd version
```

### 2. Initialize beads in your project

```bash
cd your-project
bd init
```

### 3. Add plugins to opencode.jsonc

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "opencode-beads",
    "opencode-super-beads@git+https://github.com/collectiveai-team/opencode-super-beads.git"
  ]
}
```

Note: `opencode-beads` is optional but recommended.

### 4. Verify installation

Start OpenCode. The plugin will log warnings at startup if prerequisites are missing:

- `bd CLI not found` -- install beads
- `superpowers prompt templates not found` -- install superpowers

If startup succeeds, the plugin installs two native OpenCode skills:

- `~/.config/opencode/skills/super-beads/beads-driven-development/SKILL.md`
- `~/.config/opencode/skills/super-beads/dispatch-parallel-bead-agents/SKILL.md`

You can invoke them manually as `super-beads:execute` (sequential beads loop) or `super-beads:parallel-execute` (parallel DAG lanes).

## Usage

### Normal Workflow

Use superpowers as usual:

1. Brainstorm your idea (`/superpowers:brainstorm`)
2. Design gets written to a spec document
3. Plan gets written with tasks and chunks

At the plan completion handoff, you'll see four options:

```
Plan detected. Choose an execution strategy:

1. Subagent-driven development (superpowers default)
2. Sequential execution (no subagents)
3. Beads-driven development (requires bd CLI)
4. Parallel beads-driven development (requires bd CLI, uses git worktrees)
```

Choose option 3 for the standard beads loop, or option 4 for parallel lane execution.

### Option 3: Beads-Driven Development

1. The plugin parses the plan and creates beads issues:
   - One **epic** for the entire plan
   - One **child task** per plan task
   - **Dependencies** between chunks (tasks in chunk 2 are blocked by tasks in chunk 1)

2. The execution engine starts:
   - Picks the next task from `bd ready`
   - Dispatches an implementer subagent
   - Runs spec compliance review
   - Runs code quality review
   - Closes the bead issue
   - Repeats until all tasks are done

### Option 4: Parallel Beads-Driven Development

Before dispatching, you'll see a dependency graph and must confirm:

```
Dependency graph:
  Task 1 (no deps)
  Task 2 (no deps)
  Task 3 → depends on Task 1
  Task 4 → depends on Task 2, Task 3

Confirm parallel execution? [yes/no]
```

After confirmation:

1. The plugin creates beads issues with fine-grained dependency edges (from explicit `Depends-On:` annotations, file-overlap inference, or chunk order)
2. The parallel execution engine starts:
   - Picks up to 3 ready tasks from `bd ready`
   - Creates an isolated git worktree per task, branched from its dependencies' completed work
   - Dispatches all lanes concurrently; each runs implement → spec review → code quality review
   - Closes finished beads, unblocking downstream tasks
   - Repeats until all tasks are done
3. All lane branches are merged topologically into an integration branch
4. A cross-lane integration review checks for semantic conflicts, import issues, duplicate code, and naming inconsistencies
5. Integration branch is fast-forwarded into the base branch; worktrees and lane branches are cleaned up

#### Annotating Dependencies in Plans

For best results with option 4, add `Depends-On:` annotations to task headings:

```markdown
### Task 3: Add validation layer
Depends-On: Task 1, Task 2
File-Paths: src/validation.ts, src/types.ts
```

Without annotations, the analyzer falls back to file-overlap detection and chunk ordering.

### Between Sessions

If your session ends mid-execution, start a new session and invoke
`super-beads:execute` or `super-beads:parallel-execute`. It will:

1. Check `bd list` to see what's done, in progress, and remaining
2. Rebuild the session progress view
3. Ask about any in-progress tasks from the crashed session
4. Continue from where you left off

### Manual Intervention

You can interact with beads directly between or during sessions:

```bash
# See what's ready to work on
bd ready

# Add an external blocker
bd dep add <task-id> <blocker-id> --type blocks

# Close a task manually (e.g., already done)
bd close <task-id> --reason "Already implemented"

# Check what's blocked and why
bd list --status blocked

# View project stats
bd stats
```

The execution engine respects all manual changes on its next `bd ready` cycle.

## Architecture

```
opencode-super-beads/
+-- src/
|   +-- plugin.ts                  # Entry point: startup checks, hook/config wiring, command registration
|   +-- vendor.ts                  # Loads bundled skills/prompts, strips frontmatter for runtime use
|   +-- skills/
|   |   +-- install.ts             # Installs bundled skills into OpenCode's native skill path
|   +-- hooks/
|   |   +-- detection.ts           # Pure functions: pattern matching (plan completion, parallel detection, choice)
|   |   +-- handoff.ts             # Hook implementation: message interception, two-phase parallel confirmation
|   +-- converter/
|       +-- parser.ts              # Pure functions: plan markdown -> structured data (tasks, deps, file paths)
|       +-- plan-to-beads.ts       # Sequential path: parser output + bd CLI -> beads issues (unchanged)
|       +-- dependency-analyzer.ts # Parallel path: layered dep analysis (explicit -> file-overlap -> chunk-fallback)
|       +-- parallel-converter.ts  # Parallel path: two-phase converter (analyze then create DAG-wired beads)
+-- skills/
|   +-- beads-driven-development/
|   |   +-- SKILL.md               # Sequential execution skill (bd ready loop + subagent dispatch)
|   +-- dispatch-parallel-bead-agents/
|       +-- SKILL.md               # Parallel execution skill (DAG worktrees + up to 3 concurrent lanes)
+-- vendor/
|   +-- prompts/
|       +-- execution-options.md   # Handoff choice template (all 4 options)
|       +-- lane-prompt.md         # Lane subagent prompt template
|       +-- integration-reviewer.md # Integration reviewer prompt template
+-- tests/
    +-- converter/
    |   +-- parser.test.ts
    |   +-- dependency-analyzer.test.ts
    |   +-- parallel-converter.test.ts
    +-- hooks/
    |   +-- detection.test.ts
    |   +-- handoff.test.ts
    +-- fixtures/
        +-- sample-plan.md
        +-- sample-plan-with-deps.md
```

## License

MIT
