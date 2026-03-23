/**
 * Plan document parser.
 *
 * Parses a superpowers plan markdown file into structured data.
 * Pure functions only -- no side effects, no CLI calls.
 */

/** A single task extracted from a plan */
export interface ParsedTask {
  /** Task number (from "### Task N: Name") */
  number: number;
  /** Task name (from "### Task N: Name") */
  name: string;
  /** The **Files:** section content */
  filesSection: string;
  /** The full task content (everything from ### Task N to the next ### or ##) */
  fullContent: string;
}

/** A chunk grouping tasks */
export interface ParsedChunk {
  /** Chunk name (from "## Chunk N: Name"), or "default" if no chunks */
  name: string;
  /** Chunk number (1-indexed), or 0 for the default chunk */
  chunkNumber: number;
  /** Tasks within this chunk */
  tasks: ParsedTask[];
}

/** The parsed plan structure */
export interface ParsedPlan {
  /** Plan title (from "# Title") */
  title: string;
  /** Goal (from "**Goal:** ...") */
  goal: string;
  /** Chunks with their tasks */
  chunks: ParsedChunk[];
}

/**
 * Parse a superpowers plan markdown string into structured data.
 *
 * Handles:
 * - Plans with "## Chunk N: Name" groupings
 * - Plans without chunks (all tasks collected into a "default" chunk)
 * - Empty chunks (ignored)
 *
 * @param content - The raw markdown content of the plan file
 * @returns Parsed plan structure
 */
export function parsePlan(content: string): ParsedPlan {
  const title = extractTitle(content);
  const goal = extractGoal(content);
  const chunks = extractChunks(content);

  return { title, goal, chunks };
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function extractGoal(content: string): string {
  const match = content.match(/\*\*Goal:\*\*\s*(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function extractChunks(content: string): ParsedChunk[] {
  const chunkRegex = /^##\s+Chunk\s+(\d+):\s*(.+)$/gm;
  const chunkMatches = [...content.matchAll(chunkRegex)];

  // No chunk headings: collect all tasks into a default chunk
  if (chunkMatches.length === 0) {
    const tasks = extractTasks(content);
    if (tasks.length === 0) return [];
    return [{ name: "default", chunkNumber: 0, tasks }];
  }

  const chunks: ParsedChunk[] = [];

  for (let i = 0; i < chunkMatches.length; i++) {
    const match = chunkMatches[i]!;
    const chunkNumber = parseInt(match[1]!, 10);
    const chunkName = match[2]!.trim();

    // Get content between this chunk heading and the next chunk heading (or end)
    const startIndex = match.index! + match[0].length;
    const nextMatch = chunkMatches[i + 1];
    const endIndex = nextMatch ? nextMatch.index! : content.length;
    const chunkContent = content.slice(startIndex, endIndex);

    const tasks = extractTasks(chunkContent);
    chunks.push({ name: chunkName, chunkNumber, tasks });
  }

  // Filter out empty chunks
  return chunks.filter(c => c.tasks.length > 0);
}

function extractTasks(content: string): ParsedTask[] {
  const taskRegex = /^###\s+Task\s+(\d+):\s*(.+)$/gm;
  const taskMatches = [...content.matchAll(taskRegex)];

  if (taskMatches.length === 0) return [];

  const tasks: ParsedTask[] = [];

  for (let i = 0; i < taskMatches.length; i++) {
    const match = taskMatches[i]!;
    const number = parseInt(match[1]!, 10);
    const name = match[2]!.trim();

    // Get content between this task heading and the next task/chunk heading (or end)
    const startIndex = match.index!;
    const nextMatch = taskMatches[i + 1];
    const endIndex = nextMatch ? nextMatch.index! : content.length;
    const fullContent = content.slice(startIndex, endIndex).trim();

    const filesSection = extractFilesSection(fullContent);

    tasks.push({ number, name, filesSection, fullContent });
  }

  return tasks;
}

function extractFilesSection(taskContent: string): string {
  const filesMatch = taskContent.match(
    /\*\*Files:\*\*\s*\n((?:\s*-\s+.+\n?)+)/
  );
  return filesMatch?.[1]?.trim() ?? "";
}
