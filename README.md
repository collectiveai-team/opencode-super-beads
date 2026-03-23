# opencode-super-beads

An [OpenCode](https://opencode.ai) plugin that bridges [superpowers](https://github.com/obra/superpowers)' workflow engine with [beads](https://github.com/steveyegge/beads)' task management.

Adds **beads-driven development** as a third execution path alongside superpowers' subagent-driven and sequential execution modes.

## What It Does

When superpowers' `writing-plans` skill finishes creating an implementation plan, this plugin intercepts the handoff and offers three execution strategies:

1. **Subagent-driven development** (superpowers default) -- linear plan execution with subagent dispatch
2. **Sequential execution** -- execute in the current session
3. **Beads-driven development** (this plugin) -- creates beads issues from the plan, uses `bd ready` for task selection

### Why Beads-Driven?

- **Persistent tracking** -- beads state survives session crashes. Resume exactly where you left off.
- **Dependency-aware scheduling** -- `bd ready` only returns unblocked tasks. Add external blockers (e.g., "wait for API key") without editing the plan.
- **Reorderable** -- change task priority in beads without touching the plan file.
- **Observable** -- `bd list`, `bd stats`, `bd list --status blocked` give you project visibility at any time.

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

## Usage

### Normal Workflow

Use superpowers as usual:

1. Brainstorm your idea (`/superpowers:brainstorm`)
2. Design gets written to a spec document
3. Plan gets written with tasks and chunks

At the plan completion handoff, you'll see three options instead of the usual two:

```
Plan detected. Choose an execution strategy:

1. Subagent-driven development (superpowers default)
2. Sequential execution (no subagents)
3. Beads-driven development (requires bd CLI)
```

Choose option 3 to use beads-driven development.

### What Happens Next

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

### Between Sessions

If your session ends mid-execution, start a new session and invoke the execution skill. It will:

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
|   +-- plugin.ts              # Main entry point, startup checks, hook/config wiring
|   +-- vendor.ts              # Loads markdown files from vendor/
|   +-- hooks/
|   |   +-- detection.ts       # Pure functions: pattern matching (plan completion, choice)
|   |   +-- handoff.ts         # Hook implementation: message interception + injection
|   +-- converter/
|       +-- parser.ts          # Pure functions: plan markdown -> structured data
|       +-- plan-to-beads.ts   # Orchestrator: parser output + bd CLI -> beads issues
+-- vendor/
|   +-- skills/
|   |   +-- beads-driven-development.md   # The execution engine skill
|   +-- prompts/
|       +-- execution-options.md          # Handoff choice template
+-- tests/
    +-- converter/
    |   +-- parser.test.ts
    +-- hooks/
    |   +-- detection.test.ts
    +-- fixtures/
        +-- sample-plan.md
```

## License

MIT
