/**
 * Detection functions for handoff interception.
 *
 * Pure functions that analyze message text for plan completion
 * and execution choice signals. No side effects.
 */

/** Default glob pattern for plan file paths */
const DEFAULT_PLAN_PATTERN = "docs/superpowers/plans/*.md";

/**
 * Convert a simple glob pattern (with * wildcard) to a regex pattern.
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]+");
  return new RegExp(escaped);
}

/**
 * Check if a message indicates plan completion.
 *
 * Requires BOTH conditions (case-insensitive substring match):
 * 1. Contains a file path matching the plan pattern
 * 2. Contains "ready to execute"
 *
 * @param message - The assistant message text
 * @param planPattern - Glob pattern for plan paths (default: docs/superpowers/plans/*.md)
 * @returns true if the message is a plan completion signal
 */
export function isPlanCompletionMessage(
  message: string,
  planPattern: string = DEFAULT_PLAN_PATTERN
): boolean {
  const hasReadyToExecute = /ready to execute/i.test(message);
  const pathRegex = globToRegex(planPattern);
  const hasPlanPath = pathRegex.test(message);

  return hasReadyToExecute && hasPlanPath;
}

/**
 * Extract the plan file path from a message.
 *
 * Looks for backtick-quoted .md paths matching the plan directory pattern.
 * Falls back to any backtick-quoted .md path if no pattern match.
 *
 * @param message - The message text to search
 * @param planPattern - Glob pattern to prefer (default: docs/superpowers/plans/*.md)
 * @returns The extracted path, or null if not found
 */
export function extractPlanPath(
  message: string,
  planPattern: string = DEFAULT_PLAN_PATTERN
): string | null {
  // Find all backtick-quoted .md paths
  const backtickMatches = [...message.matchAll(/`([^`]+\.md)`/g)];

  // Prefer paths matching the plan pattern
  const patternRegex = globToRegex(planPattern);
  for (const match of backtickMatches) {
    if (match[1] && patternRegex.test(match[1])) {
      return match[1];
    }
  }

  // Fall back to first backtick-quoted .md path
  if (backtickMatches[0]?.[1]) return backtickMatches[0][1];

  return null;
}

/** The execution choices available at handoff */
export type ExecutionChoice =
  | "beads"
  | "parallel-beads"
  | "subagent"
  | "sequential";

/**
 * Detect which execution path the user/LLM chose from an assistant message.
 *
 * Detection rules (case-insensitive substring match):
 * - "parallel beads-driven" OR "parallel-beads" -> "parallel-beads"
 * - "beads-driven" OR "super-beads:beads-driven-development" OR ("beads" + "execution") -> "beads"
 * - "subagent-driven" OR "subagent-driven-development" -> "subagent"
 * - "sequential" OR "executing-plans" -> "sequential"
 * - No clear match -> null (let conversation continue naturally)
 *
 * Parallel beads takes priority over regular beads if multiple signals are present.
 *
 * @param message - The assistant message text
 * @returns The detected choice, or null if no clear signal
 */
export function detectExecutionChoice(
  message: string
): ExecutionChoice | null {
  const lower = message.toLowerCase();

  // Parallel beads detection (highest priority)
  if (lower.includes("parallel beads-driven") || lower.includes("parallel-beads")) {
    return "parallel-beads";
  }

  // Beads detection
  if (
    lower.includes("super-beads:beads-driven-development") ||
    lower.includes("beads-driven") ||
    (lower.includes("beads") && lower.includes("execution"))
  ) {
    return "beads";
  }

  // Subagent detection
  if (
    lower.includes("subagent-driven") ||
    lower.includes("subagent-driven-development")
  ) {
    return "subagent";
  }

  // Sequential detection
  if (lower.includes("sequential") || lower.includes("executing-plans")) {
    return "sequential";
  }

  return null;
}

/**
 * Detect an explicit confirmation to proceed with the inferred dependency graph.
 *
 * Requires an affirmative signal, not just any follow-up message.
 */
export function isDependencyConfirmation(message: string): boolean {
  const lower = message.toLowerCase();

  const naturalProceedPhrase =
    /\bconfirmed?,?\s+proceed\b/.test(lower) ||
    /\bapproved?,?\s+proceed\b/.test(lower) ||
    /\blooks good,?\s+proceed\b/.test(lower) ||
    /\bproceed with (this|it|the graph|the dependency graph|the dependencies)\b/.test(lower);
  const referencesGraph =
    lower.includes("dependency graph") ||
    lower.includes("dependencies") ||
    lower.includes("dependency analysis");
  const approvalSignal =
    /\b(confirm|confirmed|approve|approved)\b/.test(lower) ||
    (lower.includes("looks good") && lower.includes("dependency")) ||
    (lower.includes("proceed") && referencesGraph);
  const negated =
    lower.includes("do not confirm") ||
    lower.includes("don't confirm") ||
    lower.includes("do not approve") ||
    lower.includes("don't approve") ||
    lower.includes("not approve") ||
    lower.includes("do not proceed") ||
    lower.includes("don't proceed");

  return (naturalProceedPhrase || (referencesGraph && approvalSignal)) && !negated;
}

/**
 * Detect when the user indicates the dependency graph or plan dependencies changed
 * and should be re-analyzed.
 */
export function isDependencyGraphUpdate(message: string): boolean {
  const lower = message.toLowerCase();
  const directDependencyCorrection =
    /task\s+\d+\s+should\s+depend\s+on\s+task\s+\d+/i.test(message) ||
    /task\s+\d+\s+needs\s+to\s+depend\s+on\s+task\s+\d+/i.test(message);
  const referencesGraph =
    lower.includes("dependency graph") ||
    lower.includes("dependencies") ||
    lower.includes("depends on");
  const updateSignal =
    lower.includes("updated") ||
    lower.includes("changed") ||
    lower.includes("refresh") ||
    lower.includes("re-run") ||
    lower.includes("rerun");

  return directDependencyCorrection || (referencesGraph && updateSignal);
}
