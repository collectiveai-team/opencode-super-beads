/**
 * Handoff hook for intercepting plan completion.
 *
 * Watches assistant messages for the plan-completion signal from writing-plans,
 * then injects execution options including the beads-driven path.
 */

import type { PluginInput } from "@opencode-ai/plugin";
import {
  isPlanCompletionMessage,
  extractPlanPath,
  detectExecutionChoice,
} from "./detection";
import { convertPlanToBeads } from "../converter/plan-to-beads";
import { loadSkill, loadPrompt } from "../vendor";

type OpencodeClient = PluginInput["client"];

/** State for tracking handoff across messages within a session */
interface HandoffState {
  /** The plan file path detected from the completion message */
  planPath: string;
  /** Whether we're waiting for the user to pick an execution strategy */
  awaitingChoice: boolean;
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

    // Phase 2: Check for choice after we've injected options
    if (state?.awaitingChoice) {
      const choice = detectExecutionChoice(messageText);

      if (choice === "beads" && state.planPath) {
        sessionState.delete(sessionID);

        // Run converter
        const result = await convertPlanToBeads(state.planPath, $);

        // Load and inject the beads-driven-development skill
        const skillContent = await loadSkill("beads-driven-development");
        if (skillContent) {
          const contextMessage = `<beads-execution-context>
Epic: ${result.epicId}
Plan: ${state.planPath}
Tasks: ${result.taskMapping.size} issues created in beads

${skillContent}
</beads-execution-context>`;

          await client.session.prompt({
            path: { id: sessionID },
            body: {
              noReply: true,
              model: output.message.model,
              agent: output.message.agent,
              parts: [{ type: "text", text: contextMessage, synthetic: true }],
            },
          });
        }
        return;
      }

      if (choice === "subagent" || choice === "sequential") {
        // Not our path -- clean up and let superpowers handle it
        sessionState.delete(sessionID);
        return;
      }

      // No clear choice detected -- stop waiting after this message
      // (single-shot check as noted in spec review)
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
      await client.session.prompt({
        path: { id: sessionID },
        body: {
          noReply: true,
          model: output.message.model,
          agent: output.message.agent,
          parts: [
            { type: "text", text: optionsTemplate, synthetic: true },
          ],
        },
      });
    }
  };
}
