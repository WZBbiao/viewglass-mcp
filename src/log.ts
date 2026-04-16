import { appendFileSync } from "node:fs";

const LOG_ENABLED =
  process.env.VIEWGLASS_MCP_LOG === "1" ||
  process.env.VIEWGLASS_MCP_LOG === "true" ||
  process.env.VIEWGLASS_MCP_LOG_CLI === "1" ||
  process.env.VIEWGLASS_MCP_LOG_TOOL === "1";

const CLI_LOG_ENABLED =
  process.env.VIEWGLASS_MCP_LOG === "1" ||
  process.env.VIEWGLASS_MCP_LOG === "true" ||
  process.env.VIEWGLASS_MCP_LOG_CLI === "1";

const TOOL_LOG_ENABLED =
  process.env.VIEWGLASS_MCP_LOG === "1" ||
  process.env.VIEWGLASS_MCP_LOG === "true" ||
  process.env.VIEWGLASS_MCP_LOG_TOOL === "1";

const RESOLVE_LOG_ENABLED =
  process.env.VIEWGLASS_MCP_LOG === "1" ||
  process.env.VIEWGLASS_MCP_LOG === "true" ||
  process.env.VIEWGLASS_MCP_LOG_RESOLVE === "1";

const LOG_FILE = process.env.VIEWGLASS_MCP_LOG_FILE;
const SPLIT_BY_SESSION =
  process.env.VIEWGLASS_MCP_LOG_SPLIT_BY_SESSION === "1" ||
  process.env.VIEWGLASS_MCP_LOG_SPLIT_BY_SESSION === "true";

function sanitizeSessionForFile(session: string): string {
  return session.replace(/[^\w.@-]+/g, "_");
}

function writeLine(line: string, session?: string) {
  const text = `${new Date().toISOString()} ${line}\n`;
  if (LOG_FILE) {
    const filePath =
      session && SPLIT_BY_SESSION ? `${LOG_FILE}.${sanitizeSessionForFile(session)}.log` : LOG_FILE;
    appendFileSync(filePath, text, "utf8");
    return;
  }
  process.stderr.write(text);
}

export function truncate(value: string, limit = 300): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}...`;
}

export function safeStringify(value: unknown, limit = 500): string {
  try {
    return truncate(JSON.stringify(value), limit);
  } catch {
    return truncate(String(value), limit);
  }
}

export function quoteArg(value: string): string {
  return /[\s"]/u.test(value) ? JSON.stringify(value) : value;
}

export function cliLoggingEnabled(): boolean {
  return CLI_LOG_ENABLED;
}

export function toolLoggingEnabled(): boolean {
  return TOOL_LOG_ENABLED;
}

export function logCliStart(file: string, args: string[], timeoutMs: number) {
  if (!CLI_LOG_ENABLED) return;
  const session = extractSessionFromArgs(args);
  writeLine(
    `[cli:start]${session ? ` session=${session}` : ""} timeout=${timeoutMs} cmd=${[file, ...args]
      .map(quoteArg)
      .join(" ")}`,
    session
  );
}

export function logCliFinish(meta: {
  file: string;
  args: string[];
  durationMs: number;
  exitStatus: number | string;
  stdout?: string;
  stderr?: string;
}) {
  if (!CLI_LOG_ENABLED) return;
  const session = extractSessionFromArgs(meta.args);
  const parts = [
    `[cli:end]${session ? ` session=${session}` : ""} exit=${meta.exitStatus}`,
    `durationMs=${meta.durationMs}`,
    `cmd=${[meta.file, ...meta.args].map(quoteArg).join(" ")}`,
  ];
  if (meta.stdout) parts.push(`stdout=${JSON.stringify(truncate(meta.stdout))}`);
  if (meta.stderr) parts.push(`stderr=${JSON.stringify(truncate(meta.stderr))}`);
  writeLine(parts.join(" "), session);
}

function extractSessionFromArgs(args: string[]): string | undefined {
  const idx = args.indexOf("--session");
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

function inferSessionFromToolArgs(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const maybe = (args as { session?: unknown }).session;
  return typeof maybe === "string" && maybe.trim() !== "" ? maybe : undefined;
}

export function logToolStart(name: string, args: unknown) {
  if (!TOOL_LOG_ENABLED) return;
  const session = inferSessionFromToolArgs(args);
  writeLine(`[tool:start] name=${name}${session ? ` session=${session}` : ""} args=${safeStringify(args)}`, session);
}

export function logToolFinish(name: string, result: unknown, durationMs: number, session?: string) {
  if (!TOOL_LOG_ENABLED) return;
  writeLine(
    `[tool:end] name=${name}${session ? ` session=${session}` : ""} durationMs=${durationMs} result=${safeStringify(result)}`,
    session
  );
}

export function logToolThrow(name: string, error: unknown, durationMs: number, session?: string) {
  if (!TOOL_LOG_ENABLED) return;
  writeLine(
    `[tool:error] name=${name}${session ? ` session=${session}` : ""} durationMs=${durationMs} error=${safeStringify(error)}`,
    session
  );
}

export function mcpLoggingEnabled(): boolean {
  return LOG_ENABLED;
}

export function logResolveDecision(
  session: string | undefined,
  phase: string,
  locator: string,
  details: unknown
) {
  if (!RESOLVE_LOG_ENABLED) return;
  writeLine(
    `[resolve]${session ? ` session=${session}` : ""} phase=${phase} locator=${JSON.stringify(locator)} details=${safeStringify(details, 800)}`,
    session
  );
}
