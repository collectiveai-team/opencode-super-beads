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

/** The three execution choices available at handoff */
export type ExecutionChoice = "beads" | "subagent" | "sequential";

/**
 * Detect which execution path the user/LLM chose from an assistant message.
 *
 * Detection rules (case-insensitive substring match):
 * - "beads-driven" OR ("beads" + "execution") -> "beads"
 * - "subagent-driven" OR "subagent-driven-development" -> "subagent"
 * - "sequential" OR "executing-plans" -> "sequential"
 * - No clear match -> null (let conversation continue naturally)
 *
 * Beads takes priority if multiple signals are present.
 *
 * @param message - The assistant message text
 * @returns The detected choice, or null if no clear signal
 */
export function detectExecutionChoice(
  message: string
): ExecutionChoice | null {
  const lower = message.toLowerCase();

  // Beads detection (highest priority)
  if (
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
