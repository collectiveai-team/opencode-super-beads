/**
 * Handoff hook for intercepting plan completion.
 *
 * Watches assistant messages for the plan-completion signal from writing-plans,
 * then injects execution options including the beads-driven path.
 */

import type { PluginInput } from "@opencode-ai/plugin";
import type { PlanAnalysis } from "../converter/parallel-converter";
import {
  isPlanCompletionMessage,
  extractPlanPath,
  detectExecutionChoice,
  isDependencyConfirmation,
  isDependencyGraphUpdate,
} from "./detection";
import { convertPlanToBeads } from "../converter/plan-to-beads";
import { loadPrompt, loadSkillTemplate } from "../vendor";

type OpencodeClient = PluginInput["client"];

interface BeadsExecutionMessageInput {
  epicId: string;
  planPath: string;
  taskCount: number;
  skillTemplate: string | null;
  parallel?: boolean;
  depSummary?: string;
}

export function buildBeadsExecutionMessage(
  input: BeadsExecutionMessageInput
): string {
  const skillName = input.parallel
    ? "dispatch-parallel-bead-agents"
    : "beads-driven-development";
  const aliasName = input.parallel ? "parallel-execute" : "execute";
  const fallbackTemplate = input.skillTemplate
    ? `\n\n<fallback-skill-template>\n${input.skillTemplate}\n</fallback-skill-template>`
    : "";
  const depLine = input.depSummary ? `Dependencies: ${input.depSummary}` : null;

  return [
    `The user chose ${input.parallel ? "parallel " : ""}beads-driven development.`,
    `Primary path: use the \`super-beads:${skillName}\` skill.`,
    `Fallback path: use the \`super-beads:${aliasName}\` command alias if the native skill is unavailable.`,
    "",
    "<beads-execution-context>",
    `Epic: ${input.epicId}`,
    `Plan: ${input.planPath}`,
    `Tasks: ${input.taskCount} issues created in beads`,
    depLine,
    `</beads-execution-context>${fallbackTemplate}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function formatDependencyGraph(analysis: PlanAnalysis): string {
  const allTasks = analysis.plan.chunks.flatMap((chunk) => chunk.tasks);
  const lines = [
    "<parallel-dependency-graph>",
    "Inferred dependency graph for parallel execution:",
    "",
  ];

  for (const task of allTasks) {
    const deps = analysis.depResult.edges
      .filter((edge) => edge.taskNumber === task.number)
      .map((edge) => `Task ${edge.dependsOn} (${edge.source})`)
      .join(", ");
    lines.push(
      deps
        ? `Task ${task.number}: ${task.name} -> depends on ${deps}`
        : `Task ${task.number}: ${task.name} -> no deps (parallel-safe)`
    );
  }

  if (analysis.depResult.validation.orphanWarnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of analysis.depResult.validation.orphanWarnings) {
      lines.push(`! ${warning}`);
    }
  }

  lines.push(
    "",
    "Present this graph to the user and confirm before proceeding.",
    "If the user wants to adjust dependencies, update the graph accordingly.",
    "</parallel-dependency-graph>"
  );

  return lines.join("\n");
}

/** State for tracking handoff across messages within a session */
interface HandoffState {
  /** The plan file path detected from the completion message */
  planPath: string;
  /** Whether we're waiting for the user to pick an execution strategy */
  awaitingChoice: boolean;
  /** Whether we're waiting for dependency confirmation before creating beads */
  awaitingDepConfirmation?: boolean;
  /** Cached dependency analysis from phase 1 */
  cachedAnalysis?: PlanAnalysis;
}

/**
 * Create the handoff hook handler.
 *
 * @param client - OpenCode client for injecting messages
 * @param $ - Shell executor for bd commands
 * @param bdAvailable - Whether bd CLI was found at startup
 * @param planPattern - Glob pattern for plan file paths
 * @returns The chat.message hook handler
 */
export function createHandoffHook(
  client: OpencodeClient,
  $: PluginInput["$"],
  bdAvailable: boolean,
  planPattern?: string
) {
  const sessionState = new Map<string, HandoffState>();

  async function promptWithText(
    sessionID: string,
    output: {
      message: {
        agent?: string;
        model?: { providerID: string; modelID: string };
      };
    },
    text: string
  ): Promise<void> {
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        model: output.message.model,
        agent: output.message.agent,
        parts: [{ type: "text", text, synthetic: true }],
      },
    });
  }

  async function injectBeadsExecutionContext(
    sessionID: string,
    output: {
      message: {
        agent?: string;
        model?: { providerID: string; modelID: string };
      };
    },
    planPath: string
  ): Promise<void> {
    const result = await convertPlanToBeads(planPath, $);
    const skillContent = await loadSkillTemplate("beads-driven-development");
    const contextMessage = buildBeadsExecutionMessage({
      epicId: result.epicId,
      planPath,
      taskCount: result.taskMapping.size,
      skillTemplate: skillContent,
    });

    await promptWithText(sessionID, output, contextMessage);
  }

  return async (
    _input: unknown,
    output: { message: { sessionID: string; agent?: string; model?: { providerID: string; modelID: string }; parts?: Array<{ type: string; text?: string }> } }
  ) => {
    const sessionID = output.message.sessionID;

    // Extract message text from parts
    const messageText =
      output.message.parts
        ?.filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("\n") ?? "";

    if (!messageText) return;

    const state = sessionState.get(sessionID);

    // Phase 3: User confirmed dependency graph, create beads and inject context
    if (state?.awaitingDepConfirmation && state.cachedAnalysis) {
      const choice = detectExecutionChoice(messageText);

      if (choice === "beads") {
        sessionState.delete(sessionID);
        await injectBeadsExecutionContext(sessionID, output, state.planPath);
        return;
      }

      if (choice === "subagent" || choice === "sequential") {
        sessionState.delete(sessionID);
        return;
      }

      if (isDependencyGraphUpdate(messageText)) {
        const { analyzePlanDependencies } = await import(
          "../converter/parallel-converter"
        );
        const refreshedAnalysis = await analyzePlanDependencies(state.planPath);

        sessionState.set(sessionID, {
          ...state,
          cachedAnalysis: refreshedAnalysis,
        });

        await promptWithText(
          sessionID,
          output,
          formatDependencyGraph(refreshedAnalysis)
        );
        return;
      }

      if (!isDependencyConfirmation(messageText)) {
        return;
      }

      sessionState.delete(sessionID);

      const { createBeadsFromAnalysis } = await import(
        "../converter/parallel-converter"
      );
      const result = await createBeadsFromAnalysis(
        state.planPath,
        state.cachedAnalysis,
        $
      );

      const skillContent = await loadSkillTemplate("dispatch-parallel-bead-agents");
      const contextMessage = buildBeadsExecutionMessage({
        epicId: result.epicId,
        planPath: state.planPath,
        taskCount: result.taskMapping.size,
        skillTemplate: skillContent,
        parallel: true,
        depSummary: `${result.analysis.edges.length} dependency edges`,
      });

      await promptWithText(sessionID, output, contextMessage);
      return;
    }

    // Phase 2: Check for choice after we've injected options
    if (state?.awaitingChoice) {
      const choice = detectExecutionChoice(messageText);

      if (choice === "parallel-beads" && state.planPath) {
        const { analyzePlanDependencies } = await import(
          "../converter/parallel-converter"
        );
        const analysis = await analyzePlanDependencies(state.planPath);

        sessionState.set(sessionID, {
          ...state,
          awaitingChoice: false,
          awaitingDepConfirmation: true,
          cachedAnalysis: analysis,
        });

        const graphSummary = formatDependencyGraph(analysis);
        await promptWithText(sessionID, output, graphSummary);
        return;
      }

      if (choice === "beads" && state.planPath) {
        sessionState.delete(sessionID);
        await injectBeadsExecutionContext(sessionID, output, state.planPath);
        return;
      }

      if (choice === "subagent" || choice === "sequential") {
        // Not our path -- clean up and let superpowers handle it
        sessionState.delete(sessionID);
        return;
      }

      sessionState.delete(sessionID);
      return;
    }

    // Phase 1: Detect plan completion
    if (isPlanCompletionMessage(messageText, planPattern)) {
      if (!bdAvailable) return; // Don't offer beads option if bd not available

      const planPath = extractPlanPath(messageText);
      if (!planPath) return;

      // Load the execution options template
      const optionsTemplate = await loadPrompt("execution-options");
      if (!optionsTemplate) return;

      // Track state for choice detection
      sessionState.set(sessionID, {
        planPath,
        awaitingChoice: true,
      });

      // Inject the execution options
      await promptWithText(sessionID, output, optionsTemplate);
    }
  };
}
