<execution-options>
Plan detected. Choose an execution strategy:

1. **Subagent-driven development** (superpowers default)
   Fresh subagent per task, two-stage review (spec compliance + code quality).
   Uses plan file for linear task ordering. Tracks progress via TodoWrite.

2. **Sequential execution** (no subagents)
   Execute all tasks in the current session using superpowers:executing-plans.
   Good for simpler plans or environments without subagent support.

3. **Beads-driven development** (requires bd CLI)
    Creates an epic + task issues in beads from the plan. Uses `bd ready` for
    task selection (respects external blockers and manual reordering).
    Primary path: native skill `super-beads:beads-driven-development`.
    Secondary path: manual alias `super-beads:execute`.
    Subagent dispatch with two-stage review. Dual tracking: beads for
    persistent state across sessions, TodoWrite for real-time session UI.

4. **Parallel beads-driven development** (requires bd CLI)
    Creates an epic + task issues in beads with fine-grained dependency
    analysis. Dispatches up to 3 tasks in parallel, each in its own git
    worktree. Tasks start as soon as their specific dependencies complete.
    Uses DAG-based branching for isolation, with a single final merge to
    the base branch after all tasks pass review.
    Skill: `super-beads:dispatch-parallel-bead-agents`.

Which approach would you like to use?
</execution-options>
