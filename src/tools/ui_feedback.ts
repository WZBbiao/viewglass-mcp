import fs from "node:fs";
import path from "node:path";

export type UIFeedbackSeverity = "info" | "warning" | "error";
export type UIFeedbackOutcome = "success" | "blocked" | "partial" | "regression";

export interface UIFeedbackInput {
  /** Short title for the feedback item. */
  title: string;
  /** What the agent was trying to accomplish. */
  task?: string;
  /** What happened from the agent's perspective. */
  summary: string;
  /** Expected behavior if this is a bad case. */
  expected?: string;
  /** Actual behavior if this is a bad case. */
  actual?: string;
  /** Optional session in bundleId@port format. */
  session?: string;
  /** Optional current screen/controller hints. */
  screen?: string;
  /** Tool names or compact call sequence related to the issue. */
  tools?: string[];
  /** Local paths to screenshots/log snippets created by the agent. */
  artifacts?: string[];
  /** Any concise recommendation from the agent. */
  suggestion?: string;
  severity?: UIFeedbackSeverity;
  outcome?: UIFeedbackOutcome;
}

export interface UIFeedbackResult {
  ok: true;
  path: string;
  id: string;
}

function projectFeedbackPath(projectCwd: string): string {
  return path.join(projectCwd, ".viewglassmcp", "feedback.jsonl");
}

function feedbackFilePath(projectCwd: string): string {
  return process.env.VIEWGLASS_MCP_FEEDBACK_FILE?.trim() || projectFeedbackPath(projectCwd);
}

export function uiFeedback(input: UIFeedbackInput, projectCwd: string = process.cwd()): UIFeedbackResult {
  const title = input.title.trim();
  const summary = input.summary.trim();
  if (!title) throw new Error("ui_feedback requires a non-empty title");
  if (!summary) throw new Error("ui_feedback requires a non-empty summary");

  const filePath = feedbackFilePath(projectCwd);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const id = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    createdAt: new Date().toISOString(),
    source: "viewglass-mcp",
    severity: input.severity ?? "info",
    outcome: input.outcome ?? "partial",
    title,
    task: input.task,
    summary,
    expected: input.expected,
    actual: input.actual,
    session: input.session,
    screen: input.screen,
    tools: input.tools ?? [],
    artifacts: input.artifacts ?? [],
    suggestion: input.suggestion,
  };

  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  return { ok: true, path: filePath, id };
}
