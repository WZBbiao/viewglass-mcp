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

const LOG_FILE = process.env.VIEWGLASS_MCP_LOG_FILE;

function writeLine(line: string) {
  const text = `${new Date().toISOString()} ${line}\n`;
  if (LOG_FILE) {
    appendFileSync(LOG_FILE, text, "utf8");
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
  writeLine(`[cli:start] timeout=${timeoutMs} cmd=${[file, ...args].map(quoteArg).join(" ")}`);
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
  const parts = [
    `[cli:end] exit=${meta.exitStatus}`,
    `durationMs=${meta.durationMs}`,
    `cmd=${[meta.file, ...meta.args].map(quoteArg).join(" ")}`,
  ];
  if (meta.stdout) parts.push(`stdout=${JSON.stringify(truncate(meta.stdout))}`);
  if (meta.stderr) parts.push(`stderr=${JSON.stringify(truncate(meta.stderr))}`);
  writeLine(parts.join(" "));
}

export function logToolStart(name: string, args: unknown) {
  if (!TOOL_LOG_ENABLED) return;
  writeLine(`[tool:start] name=${name} args=${safeStringify(args)}`);
}

export function logToolFinish(name: string, result: unknown, durationMs: number) {
  if (!TOOL_LOG_ENABLED) return;
  writeLine(`[tool:end] name=${name} durationMs=${durationMs} result=${safeStringify(result)}`);
}

export function logToolThrow(name: string, error: unknown, durationMs: number) {
  if (!TOOL_LOG_ENABLED) return;
  writeLine(`[tool:error] name=${name} durationMs=${durationMs} error=${safeStringify(error)}`);
}

export function mcpLoggingEnabled(): boolean {
  return LOG_ENABLED;
}
