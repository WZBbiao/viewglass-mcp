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

const DEFAULT_AGENT_TRACE_FILE = "/tmp/viewglass-agent-trace.jsonl";

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

function envFlag(name: string): boolean {
  return process.env[name] === "1" || process.env[name] === "true";
}

export function agentTraceEnabled(): boolean {
  return envFlag("VIEWGLASS_MCP_AGENT_TRACE");
}

function agentTraceFullEnabled(): boolean {
  return envFlag("VIEWGLASS_MCP_AGENT_TRACE_FULL");
}

export interface AgentTraceEvent {
  event: string;
  traceId?: string;
  tool?: string;
  session?: string;
  durationMs?: number;
  args?: unknown;
  isError?: boolean;
  response?: unknown;
  error?: unknown;
}

export function logAgentTrace(event: AgentTraceEvent) {
  if (!agentTraceEnabled()) return;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    pid: process.pid,
    ...event,
  });
  const filePath = process.env.VIEWGLASS_MCP_AGENT_TRACE_FILE ?? DEFAULT_AGENT_TRACE_FILE;
  appendFileSync(filePath, `${line}\n`, "utf8");
}

interface ToolTextContent {
  type: string;
  text?: string;
}

interface ToolTraceResponse {
  content: ToolTextContent[];
  isError?: boolean;
}

interface SnapshotNodeLike {
  oid?: number | string;
  id?: string;
  className?: string;
  role?: string;
  text?: string;
  searchableText?: string[];
  accessibilityIdentifier?: string | null;
  visible?: boolean;
  interactive?: boolean;
  actionTargetOid?: number | string;
  groupId?: string;
  frame?: unknown;
}

interface SnapshotLike {
  app?: unknown;
  snapshot?: {
    snapshotId?: string;
    fetchedAt?: string;
    screenScale?: number;
    screenSize?: unknown;
    totalNodeCount?: number;
    returnedNodeCount?: number;
    nodeLimit?: number;
    truncated?: boolean;
  };
  summary?: {
    visibleText?: string[];
    interactiveNodeCount?: number;
    controllerHints?: string[];
    navigationCandidates?: unknown[];
    bottomBarCandidates?: unknown[];
    groupCount?: number;
  };
  groups?: Array<{
    id?: string;
    role?: string;
    itemLabels?: string[];
    selectedOid?: number | string | null;
    selectedReason?: string;
  }>;
  nodes?: SnapshotNodeLike[];
  matchedRecipes?: unknown[];
}

function tryParseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function limitArray<T>(values: T[] | undefined, limit: number): T[] | undefined {
  if (!Array.isArray(values)) return undefined;
  if (values.length <= limit) return values;
  return [...values.slice(0, limit), `... ${values.length - limit} more` as T];
}

function summarizeSnapshot(parsed: SnapshotLike) {
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const nodeSample = nodes.slice(0, 20).map((node) => ({
    oid: node.oid,
    id: node.id,
    className: node.className,
    role: node.role,
    text: node.text,
    searchableText: node.searchableText,
    accessibilityIdentifier: node.accessibilityIdentifier,
    visible: node.visible,
    interactive: node.interactive,
    actionTargetOid: node.actionTargetOid,
    groupId: node.groupId,
    frame: node.frame,
  }));

  return {
    app: parsed.app,
    snapshot: parsed.snapshot,
    summary: parsed.summary
      ? {
          visibleText: limitArray(parsed.summary.visibleText, 40),
          interactiveNodeCount: parsed.summary.interactiveNodeCount,
          controllerHints: parsed.summary.controllerHints,
          navigationCandidates: limitArray(parsed.summary.navigationCandidates, 20),
          bottomBarCandidates: limitArray(parsed.summary.bottomBarCandidates, 12),
          groupCount: parsed.summary.groupCount,
        }
      : undefined,
    groups: parsed.groups?.slice(0, 12).map((group) => ({
      id: group.id,
      role: group.role,
      itemLabels: limitArray(group.itemLabels, 20),
      selectedOid: group.selectedOid,
      selectedReason: group.selectedReason,
    })),
    nodes: nodeSample,
    nodesOmitted: Math.max(0, nodes.length - nodeSample.length),
    matchedRecipeCount: Array.isArray(parsed.matchedRecipes) ? parsed.matchedRecipes.length : undefined,
  };
}

function summarizeGenericObject(parsed: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      out[key] = truncate(value, 500);
    } else if (Array.isArray(value)) {
      out[key] = value.length > 20 ? [...value.slice(0, 20), `... ${value.length - 20} more`] : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function summarizeParsedToolResult(toolName: string, parsed: unknown): unknown {
  if (!isRecord(parsed)) return parsed;
  if (toolName === "ui_snapshot") return summarizeSnapshot(parsed as SnapshotLike);
  if (toolName === "ui_screenshot") {
    return {
      path: parsed.path,
      locator: parsed.locator,
      width: parsed.width,
      height: parsed.height,
      dataSize: parsed.dataSize,
      screenshotType: parsed.screenshotType,
    };
  }
  if (toolName === "ui_tap") {
    return {
      ok: parsed.ok,
      oid: parsed.oid,
      strategyUsed: parsed.strategyUsed,
      fallbackReason: parsed.fallbackReason,
      point: parsed.point,
      hitOid: parsed.hitOid,
      hitClass: parsed.hitClass,
    };
  }
  if (toolName === "ui_invoke") {
    return {
      target: parsed.target,
      selector: parsed.selector,
      args: parsed.args,
      returnValue: typeof parsed.returnValue === "string" ? truncate(parsed.returnValue, 500) : parsed.returnValue,
    };
  }
  return summarizeGenericObject(parsed);
}

export function summarizeAgentToolResponse(toolName: string, response: ToolTraceResponse) {
  const firstText = response.content[0]?.text;
  const parsed = firstText ? tryParseJSON(firstText) : undefined;
  return {
    isError: response.isError === true,
    contentTypes: response.content.map((item) => item.type),
    firstTextBytes: firstText ? Buffer.byteLength(firstText, "utf8") : 0,
    firstTextPreview:
      firstText && (parsed === undefined || response.isError === true)
        ? truncate(firstText, response.isError === true ? 1200 : 500)
        : undefined,
    parsed: parsed !== undefined ? summarizeParsedToolResult(toolName, parsed) : undefined,
    fullText: agentTraceFullEnabled() ? firstText : undefined,
  };
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
