/**
 * E2E test: calls the MCP server process with real tool calls against ViewglassDemo.
 * Requires ViewglassDemo to be running on simulator with Viewglass enabled.
 *
 * Usage: VIEWGLASS_BIN=<path> npx tsx src/__tests__/e2e.ts
 */

import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = join(__dirname, "../../dist/index.js");
const LOCAL_DEV_VIEWGLASS_BIN = join(__dirname, "../../../lookin/.build/debug/viewglass");
const E2E_FEEDBACK_FILE = "/tmp/viewglass-mcp-e2e-feedback.jsonl";
const E2E_BUNDLE_ID = process.env.VIEWGLASS_E2E_BUNDLE_ID ?? "com.wzb.ViewglassDemo";
const E2E_DEVICE_NAME = process.env.VIEWGLASS_E2E_DEVICE_NAME?.trim();
const E2E_DEVICE_IDENTIFIER = process.env.VIEWGLASS_E2E_DEVICE_IDENTIFIER?.trim();
const E2E_PORT = parseOptionalPort(process.env.VIEWGLASS_E2E_PORT);
const VIEWGLASS_BIN =
  process.env.VIEWGLASS_BIN ??
  (existsSync(LOCAL_DEV_VIEWGLASS_BIN) ? LOCAL_DEV_VIEWGLASS_BIN : undefined);

// ─── MCP Client helpers ───────────────────────────────────────────────────────

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
};

/** Tool call result shape from MCP SDK */
type ToolResult = {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
};

type SnapshotNode = {
  oid?: number | string;
  actionTargetOid?: number | string;
  className?: string;
  controllerClass?: string | null;
  controllerOid?: number | string | null;
  actions?: unknown[];
  text?: string;
  searchableText?: unknown[];
  accessibilityIdentifier?: string | null;
  recommendedLocator?: string;
  locatorSource?: string;
  lastKnownOid?: number | string;
};

type SnapshotGroupItem = {
  oid?: number | string;
  label?: string;
  selected?: boolean;
  recommendedLocator?: string;
  locatorSource?: string;
  lastKnownOid?: number | string;
};

type SnapshotGroup = {
  role?: string;
  items?: SnapshotGroupItem[];
};

type SnapshotResult = {
  groups?: SnapshotGroup[];
  nodes?: SnapshotNode[];
};

type SnapshotMode = "actionIndex" | "fullIndex";

class MCPClient {
  private proc: ReturnType<typeof spawn>;
  private pendingCalls = new Map<number, (r: JsonRpcResponse) => void>();
  private nextId = 1;
  private initialized = false;

  constructor() {
    this.proc = spawn("node", [SERVER_ENTRY], {
      env: { ...process.env, VIEWGLASS_BIN, VIEWGLASS_MCP_FEEDBACK_FILE: process.env.VIEWGLASS_MCP_FEEDBACK_FILE ?? E2E_FEEDBACK_FILE },
      stdio: ["pipe", "pipe", "inherit"],
    });

    const rl = createInterface({ input: this.proc.stdout! });
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        if (msg.id != null) {
          this.pendingCalls.get(msg.id)?.(msg);
          this.pendingCalls.delete(msg.id);
        }
      } catch {
        // ignore non-JSON lines
      }
    });
  }

  private send(method: string, params: unknown): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pendingCalls.set(id, resolve);
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      this.proc.stdin!.write(msg + "\n");
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "e2e-test", version: "0.0.1" },
    });
    this.initialized = true;
  }

  /** Call a tool and return the ToolResult. Throws on JSON-RPC protocol error only. */
  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    await this.initialize();
    const resp = await this.send("tools/call", { name, arguments: args });
    if (resp.error) throw new Error(`MCP protocol error: ${resp.error.message}`);
    return resp.result as ToolResult;
  }

  /** Call a tool and return parsed JSON from content[0].text. Throws if isError. */
  async callToolJSON<T = unknown>(
    name: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const r = await this.callTool(name, args);
    if (r.isError) throw new Error(`Tool error: ${r.content[0]?.text ?? "unknown"}`);
    return JSON.parse(r.content[0].text) as T;
  }

  close(): void {
    this.proc.stdin!.end();
    this.proc.kill();
  }
}

// ─── Test helpers ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label: string, err: unknown) {
  console.error(`  ✗ ${label}: ${err}`);
  failed++;
}

async function test(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    ok(label);
  } catch (e) {
    fail(label, e);
  }
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function asOid(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const oid = String(value);
  return oid.length > 0 && oid !== "undefined" ? oid : undefined;
}

function a11y(identifier: string): string {
  return `#${identifier}`;
}

function parseOptionalPort(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port)) throw new Error(`VIEWGLASS_E2E_PORT must be an integer, got ${value}`);
  return port;
}

function e2eConnectArgs(): Record<string, unknown> {
  return {
    bundleId: E2E_BUNDLE_ID,
    deviceType: "simulator",
    ...(SESSION ? { session: SESSION } : {}),
    ...(E2E_DEVICE_NAME ? { deviceName: E2E_DEVICE_NAME } : {}),
    ...(E2E_DEVICE_IDENTIFIER ? { deviceIdentifier: E2E_DEVICE_IDENTIFIER } : {}),
    ...(E2E_PORT !== undefined ? { port: E2E_PORT } : {}),
  };
}

function snapshotNodeTexts(node: SnapshotNode): string[] {
  const values = new Set<string>();
  if (node.text) values.add(node.text);
  if (node.accessibilityIdentifier) values.add(node.accessibilityIdentifier);
  for (const item of node.searchableText ?? []) {
    if (typeof item === "string" && item.trim().length > 0) values.add(item);
  }
  return [...values];
}

async function loadSnapshot(
  client: MCPClient,
  filter?: string,
  mode: SnapshotMode = "actionIndex"
): Promise<SnapshotResult> {
  return client.callToolJSON<SnapshotResult>("ui_snapshot", {
    session: SESSION,
    ...(filter ? { filter } : {}),
    ...(mode === "fullIndex" ? { mode, maxNodes: 0 } : {}),
  });
}

function findTapOidInSnapshot(snapshot: SnapshotResult, label: string): string | undefined {
  const wanted = normalize(label);

  for (const group of snapshot.groups ?? []) {
    for (const item of group.items ?? []) {
      if (normalize(item.label) === wanted) {
        const oid = asOid(item.oid);
        if (oid) return oid;
      }
    }
  }

  for (const node of snapshot.nodes ?? []) {
    const texts = snapshotNodeTexts(node);
    if (texts.some((text) => normalize(text) === wanted)) {
      const oid = asOid(node.actionTargetOid) ?? asOid(node.oid);
      if (oid) return oid;
    }
  }

  return undefined;
}

async function resolveTapOid(
  client: MCPClient,
  label: string,
  filter?: string
): Promise<string> {
  const actionIndexOid = findTapOidInSnapshot(await loadSnapshot(client, filter), label);
  if (actionIndexOid) return actionIndexOid;

  const fullIndexOid = findTapOidInSnapshot(await loadSnapshot(client, filter, "fullIndex"), label);
  if (fullIndexOid) return fullIndexOid;

  throw new Error(`could not resolve oid for '${label}'`);
}

function findNodeOidInSnapshot(snapshot: SnapshotResult, label: string): string | undefined {
  const wanted = normalize(label);

  for (const node of snapshot.nodes ?? []) {
    const texts = snapshotNodeTexts(node);
    if (texts.some((text) => normalize(text) === wanted)) {
      const oid = asOid(node.oid);
      if (oid) return oid;
    }
  }

  return undefined;
}

async function resolveNodeOid(client: MCPClient, label: string): Promise<string> {
  const actionIndexOid = findNodeOidInSnapshot(await loadSnapshot(client), label);
  if (actionIndexOid) return actionIndexOid;

  const fullIndexOid = findNodeOidInSnapshot(await loadSnapshot(client, undefined, "fullIndex"), label);
  if (fullIndexOid) return fullIndexOid;

  throw new Error(`could not resolve node oid for '${label}'`);
}

async function resolveFirstOidByClass(
  client: MCPClient,
  className: string
): Promise<string> {
  const actionIndexOid = firstOidByClass(await loadSnapshot(client, className), className);
  if (actionIndexOid) return actionIndexOid;

  const fullIndexOid = firstOidByClass(await loadSnapshot(client, className, "fullIndex"), className);
  if (fullIndexOid) return fullIndexOid;

  throw new Error(`could not resolve oid for class '${className}'`);
}

async function tapBack(client: MCPClient): Promise<void> {
  const backOid = await resolveFirstOidByClass(client, "_UIButtonBarButton");
  await client.callToolJSON("ui_tap", { oid: backOid, session: SESSION });
  await new Promise((r) => setTimeout(r, 500));
}

function firstOidByClass(snapshot: SnapshotResult, className: string): string | undefined {
  const nodes = snapshot.nodes ?? [];
  for (const node of nodes) {
    if (node.controllerClass === className) {
      const oid = asOid(node.controllerOid);
      if (oid) return oid;
    }
  }
  const candidates = nodes.filter((node) => node.className === className || node.className?.includes(className));
  const usableCandidates = candidates.filter(
    (node) =>
      node.accessibilityIdentifier !== "debug_floating_avatar" &&
      !String(node.controllerClass ?? "").includes("DebugFloatingViewController")
  );
  const ordered = usableCandidates.length > 0 ? usableCandidates : (candidates.length > 0 ? candidates : nodes);
  ordered.sort((a, b) => {
    const aTap = Array.isArray(a.actions) && a.actions.includes("tap") ? 0 : 1;
    const bTap = Array.isArray(b.actions) && b.actions.includes("tap") ? 0 : 1;
    return aTap - bTap;
  });
  for (const node of ordered) {
    const oid = asOid(node.actionTargetOid) ?? asOid(node.oid);
    if (oid) return oid;
  }
  return undefined;
}

async function waitForLocator(client: MCPClient, locator: string, timeout = 5): Promise<void> {
  await client.callToolJSON("ui_wait", {
    mode: "appears",
    locator,
    timeout,
    intervalMs: 250,
    session: SESSION,
  });
}

async function tryTool(client: MCPClient, name: string, args: Record<string, unknown>): Promise<boolean> {
  const result = await client.callTool(name, args);
  return result.isError !== true;
}

async function isVisible(client: MCPClient, locator: string, timeout = 1): Promise<boolean> {
  return tryTool(client, "ui_wait", {
    mode: "appears",
    locator,
    timeout,
    intervalMs: 250,
    session: SESSION,
  });
}

async function resetToHome(client: MCPClient): Promise<void> {
  if (await isVisible(client, a11y("push_buttons_screen"))) return;

  try {
    if (await tryTool(client, "ui_tap", { locator: a11y("dismiss_modal"), session: SESSION })) {
      await new Promise((r) => setTimeout(r, 300));
      if (await isVisible(client, a11y("push_buttons_screen"))) return;
    }
  } catch {
    // modal not present
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await tapBack(client);
      if (await isVisible(client, a11y("push_buttons_screen"))) return;
    } catch {
      break;
    }
  }

  for (const locator of [a11y("switch_tab_home"), a11y("tab_home"), "Home"]) {
    try {
      if (await tryTool(client, "ui_tap", { locator, session: SESSION })) {
        await new Promise((r) => setTimeout(r, 400));
        if (await isVisible(client, a11y("push_buttons_screen"))) return;
      }
    } catch {
      // already on home or current screen does not expose this home switch
    }
  }
  await client.callToolJSON("ui_wait", {
    mode: "appears",
    locator: a11y("push_buttons_screen"),
    timeout: 12,
    intervalMs: 500,
    session: SESSION,
  });
}

// ─── E2E Tests ────────────────────────────────────────────────────────────────

let SESSION = process.env.VIEWGLASS_E2E_SESSION ?? "";

async function runE2E() {
  const feedbackPath = process.env.VIEWGLASS_MCP_FEEDBACK_FILE ?? E2E_FEEDBACK_FILE;
  rmSync(feedbackPath, { force: true });
  const client = new MCPClient();
  // Give server a moment to boot
  await new Promise((r) => setTimeout(r, 500));

  try {
    // ─── ui_connect ────────────────────────────────────────────────────────
    console.log("\n[ ui_connect ]");

    await test("connects to ViewglassDemo and returns the selected simulator session", async () => {
      const data = await client.callToolJSON<{
        session?: string;
        bundleId?: string;
        port?: number;
        deviceType?: string;
        deviceName?: string;
        deviceIdentifier?: string;
      }>(
        "ui_connect", e2eConnectArgs()
      );
      if (!data.session) throw new Error(`missing session: ${JSON.stringify(data)}`);
      if (data.bundleId !== E2E_BUNDLE_ID) throw new Error(`unexpected bundleId: ${data.bundleId}`);
      if (data.deviceType !== "simulator") throw new Error(`unexpected deviceType: ${data.deviceType}`);
      if (E2E_DEVICE_NAME && data.deviceName !== E2E_DEVICE_NAME) {
        throw new Error(`unexpected deviceName: ${data.deviceName}`);
      }
      if (E2E_DEVICE_IDENTIFIER && data.deviceIdentifier !== E2E_DEVICE_IDENTIFIER) {
        throw new Error(`unexpected deviceIdentifier: ${data.deviceIdentifier}`);
      }
      if (E2E_PORT !== undefined && data.port !== E2E_PORT) {
        throw new Error(`unexpected port: ${data.port}`);
      }
      SESSION = data.session;
    });
    if (!SESSION) throw new Error("ui_connect did not initialize SESSION");

    // ─── Initial state reset ────────────────────────────────────────────────
    await resetToHome(client);

    // ─── ui_snapshot ────────────────────────────────────────────────────────
    console.log("\n[ ui_snapshot ]");

    await test("returns agent-first snapshot object", async () => {
      const data = await client.callToolJSON<{
        app?: unknown;
        snapshot?: unknown;
        summary?: { visibleText?: unknown[]; bottomBarCandidates?: unknown[] };
        groups?: unknown[];
        nodes?: Array<{ searchableText?: unknown[]; actionTargetOid?: unknown }>;
      }>(
        "ui_snapshot", { session: SESSION }
      );
      if (typeof data.app !== "object" || data.app === null) throw new Error("missing app");
      if (typeof data.snapshot !== "object" || data.snapshot === null) throw new Error("missing snapshot");
      if (!Array.isArray(data.nodes) || data.nodes.length === 0) throw new Error("missing nodes");
      if (!Array.isArray(data.groups)) throw new Error("missing groups");
      if (typeof data.summary !== "object" || data.summary === null) throw new Error("missing summary");
    });

    await test("snapshot nodes expose searchableText/actionTargetOid", async () => {
      const data = await client.callToolJSON<{
        nodes?: Array<{
          searchableText?: unknown[];
          actionTargetOid?: unknown;
          accessibilityIdentifier?: string | null;
          recommendedLocator?: string;
          locatorSource?: string;
          lastKnownOid?: unknown;
        }>;
      }>(
        "ui_snapshot", { session: SESSION, filter: "UILabel" }
      );
      if (!Array.isArray(data.nodes) || data.nodes.length === 0) throw new Error("expected filtered nodes");
      if (!data.nodes.some((node) => Array.isArray(node.searchableText) && node.searchableText.length > 0)) {
        throw new Error("expected searchableText on at least one node");
      }
      if (!data.nodes.some((node) => node.actionTargetOid !== undefined)) {
        throw new Error("expected actionTargetOid on nodes");
      }
      if (!data.nodes.some((node) => node.recommendedLocator && node.lastKnownOid !== undefined)) {
        throw new Error("expected recommendedLocator and lastKnownOid on nodes");
      }
      const a11yNode = data.nodes.find((node) => node.accessibilityIdentifier && node.recommendedLocator);
      if (!a11yNode) throw new Error("expected at least one accessibility-backed recommendedLocator");
      if (a11yNode.recommendedLocator !== `#${a11yNode.accessibilityIdentifier}`) {
        throw new Error(`expected #accessibilityIdentifier locator, got ${a11yNode.recommendedLocator}`);
      }
      if (a11yNode.locatorSource !== "accessibilityIdentifier") {
        throw new Error(`unexpected locatorSource: ${a11yNode.locatorSource}`);
      }
    });

    await test("snapshot groups expose stable locators plus lastKnownOid cache hint", async () => {
      const data = await client.callToolJSON<SnapshotResult>("ui_snapshot", { session: SESSION });
      const item = data.groups?.flatMap((group) => group.items ?? []).find((candidate) => candidate.recommendedLocator);
      if (!item) throw new Error("expected at least one group item recommendedLocator");
      if (item.lastKnownOid === undefined) throw new Error("expected group item lastKnownOid");
      if (item.locatorSource !== "accessibilityIdentifier" && item.locatorSource !== "label") {
        throw new Error(`unexpected group item locatorSource: ${item.locatorSource}`);
      }
    });

    // ─── ui_feedback ───────────────────────────────────────────────────────
    console.log("\n[ ui_feedback ]");

    await test("feedback writes structured JSONL", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; path?: string; id?: string }>("ui_feedback", {
        title: "E2E feedback smoke",
        task: "Verify ui_feedback tool",
        summary: "MCP e2e recorded a synthetic feedback item.",
        outcome: "success",
        severity: "info",
        session: SESSION,
        tools: ["ui_feedback"],
      });
      if (!data.ok) throw new Error("expected ok:true");
      if (!data.id) throw new Error("missing feedback id");
      if (data.path !== feedbackPath) throw new Error(`unexpected feedback path: ${data.path}`);
    });

    // ─── ui_attr_get ────────────────────────────────────────────────────────
    console.log("\n[ ui_attr_get ]");

    await test("attr get with specific attrs returns filtered map", async () => {
      const attrs = await client.callToolJSON<Record<string, unknown>>(
        "ui_attr_get", { locator: a11y("push_buttons_screen"), attrs: ["opacity", "hidden"], session: SESSION }
      );
      if (!("opacity" in attrs)) throw new Error(`missing 'opacity' in ${JSON.stringify(Object.keys(attrs))}`);
      if (!("hidden" in attrs)) throw new Error("missing 'hidden'");
    });

    await test("attr get without attrs returns all attributes", async () => {
      const attrs = await client.callToolJSON<Record<string, unknown>>(
        "ui_attr_get", { locator: a11y("push_buttons_screen"), session: SESSION }
      );
      if (Object.keys(attrs).length < 5) throw new Error(`too few attrs: ${Object.keys(attrs).length}`);
    });

    // ─── ui_tap ─────────────────────────────────────────────────────────────
    console.log("\n[ ui_tap ]");
    await resetToHome(client);

    await test("tap push_buttons_screen by #accessibilityIdentifier returns locator resolution summary", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; locator?: string; resolvedOid?: string; matchedBy?: string; candidateCount?: number }>(
        "ui_tap", { locator: a11y("push_buttons_screen"), session: SESSION }
      );
      if (!data.ok) throw new Error(`unexpected result: ${JSON.stringify(data)}`);
      if (data.locator !== a11y("push_buttons_screen")) throw new Error(`unexpected locator: ${data.locator}`);
      if (!data.resolvedOid) throw new Error(`missing resolvedOid: ${JSON.stringify(data)}`);
      if (data.matchedBy !== "accessibilityIdentifier") throw new Error(`unexpected matchedBy: ${data.matchedBy}`);
      if (data.candidateCount !== 1) throw new Error(`unexpected candidateCount: ${data.candidateCount}`);
    });

    await test("tap push_forms_screen by bare accessibility identifier resolves before action", async () => {
      await resetToHome(client);
      const data = await client.callToolJSON<{ ok?: boolean; locator?: string; resolvedOid?: string; matchedBy?: string; candidateCount?: number }>(
        "ui_tap", { locator: "push_forms_screen", session: SESSION }
      );
      if (!data.ok) throw new Error(`unexpected result: ${JSON.stringify(data)}`);
      if (data.locator !== "push_forms_screen") throw new Error(`unexpected locator: ${data.locator}`);
      if (!data.resolvedOid) throw new Error(`missing resolvedOid: ${JSON.stringify(data)}`);
      if (data.matchedBy !== "accessibilityIdentifier") throw new Error(`unexpected matchedBy: ${data.matchedBy}`);
      if (data.candidateCount !== 1) throw new Error(`unexpected candidateCount: ${data.candidateCount}`);
      await tapBack(client);
    });

    await test("tap _UIButtonBarButton by OID still works as volatile fallback", async () => {
      const oid = await resolveFirstOidByClass(client, "_UIButtonBarButton");
      const data = await client.callToolJSON<{ ok?: boolean; oid?: string }>(
        "ui_tap", { oid, session: SESSION }
      );
      if (!data.ok || data.oid !== oid) throw new Error(`unexpected result: ${JSON.stringify(data)}`);
    });

    await test("tap table cell label triggers UITableViewCell selection", async () => {
      await resetToHome(client);
      await client.callToolJSON("ui_tap", { locator: a11y("push_selectable_surfaces_screen"), session: SESSION });
      await waitForLocator(client, a11y("selection_status"));
      await client.callToolJSON("ui_tap", { locator: a11y("table_row_label_1"), session: SESSION });
      const attrs = await client.callToolJSON<Record<string, unknown>>(
        "ui_attr_get", { locator: a11y("selection_status"), attrs: ["text", "displayText"], session: SESSION }
      );
      const text = String(attrs.text ?? attrs.displayText ?? "");
      if (text !== "Table selected: Profile") {
        throw new Error(`unexpected selection status after table tap: ${text}`);
      }
    });

    await test("tap collection cell label triggers UICollectionViewCell selection", async () => {
      await client.callToolJSON("ui_tap", { locator: a11y("collection_tile_label_2"), session: SESSION });
      const attrs = await client.callToolJSON<Record<string, unknown>>(
        "ui_attr_get", { locator: a11y("selection_status"), attrs: ["text", "displayText"], session: SESSION }
      );
      const text = String(attrs.text ?? attrs.displayText ?? "");
      if (text !== "Collection selected: Sunset") {
        throw new Error(`unexpected selection status after collection tap: ${text}`);
      }
      await tapBack(client);
    });

    await test("tap generic wrapper falls back to coordinate semantic hit-test", async () => {
      await resetToHome(client);
      await client.callToolJSON("ui_tap", { locator: a11y("push_gestures_screen"), session: SESSION });
      await waitForLocator(client, a11y("coordinate_fallback_wrapper"));
      await new Promise((r) => setTimeout(r, 300));
      const data = await client.callToolJSON<{ ok?: boolean; locator?: string; resolvedOid?: string; matchedBy?: string; strategyUsed?: string; point?: { x: number; y: number }; hitClass?: string }>(
        "ui_tap", { locator: a11y("coordinate_fallback_wrapper"), session: SESSION }
      );
      if (!data.ok || data.strategyUsed !== "coordinateSemantic") {
        throw new Error(`unexpected coordinate fallback result: ${JSON.stringify(data)}`);
      }
      if (data.locator !== a11y("coordinate_fallback_wrapper") || data.matchedBy !== "accessibilityIdentifier" || !data.resolvedOid) {
        throw new Error(`unexpected locator resolution: ${JSON.stringify(data)}`);
      }
      if (!data.point || typeof data.point.x !== "number" || typeof data.point.y !== "number") {
        throw new Error(`missing coordinate point: ${JSON.stringify(data)}`);
      }
      const attrs = await client.callToolJSON<Record<string, unknown>>(
        "ui_attr_get", { locator: a11y("gesture_status"), attrs: ["text", "displayText"], session: SESSION }
      );
      const text = String(attrs.text ?? attrs.displayText ?? "");
      if (text !== "Coordinate fallback fired") {
        throw new Error(`unexpected gesture status after coordinate fallback: ${text}`);
      }
    });

    // ─── ui_long_press ──────────────────────────────────────────────────────
    console.log("\n[ ui_long_press ]");
    await resetToHome(client);
    await client.callToolJSON("ui_tap", { locator: a11y("push_gestures_screen"), session: SESSION });
    await new Promise((r) => setTimeout(r, 500));

    await test("long press card prefers stable locator and still supports OID fallback", async () => {
      const stable = await client.callToolJSON<{ ok?: boolean; target?: string; resolvedOid?: string; matchedBy?: string; candidateCount?: number }>(
        "ui_long_press", { target: a11y("long_press_card"), session: SESSION }
      );
      if (!stable.ok) throw new Error(`unexpected stable long press result: ${JSON.stringify(stable)}`);
      if (stable.target !== a11y("long_press_card")) throw new Error(`unexpected stable target: ${stable.target}`);
      if (!stable.resolvedOid) throw new Error(`missing stable resolvedOid: ${JSON.stringify(stable)}`);
      if (stable.matchedBy !== "accessibilityIdentifier") throw new Error(`unexpected stable matchedBy: ${stable.matchedBy}`);
      if (stable.candidateCount !== 1) throw new Error(`unexpected stable candidateCount: ${stable.candidateCount}`);
      const longPressOid = await resolveNodeOid(client, "long_press_card");
      const data = await client.callToolJSON<{ ok?: boolean; target?: string; resolvedOid?: string; matchedBy?: string; candidateCount?: number }>(
        "ui_long_press", { target: longPressOid, session: SESSION }
      );
      if (!data.ok) throw new Error(`unexpected long press result: ${JSON.stringify(data)}`);
      if (data.target !== longPressOid) throw new Error(`unexpected target: ${data.target}`);
      if (data.resolvedOid !== longPressOid) throw new Error(`unexpected resolvedOid: ${JSON.stringify(data)}`);
      if (data.matchedBy !== "oid") throw new Error(`unexpected matchedBy: ${data.matchedBy}`);
      if (data.candidateCount !== 1) throw new Error(`unexpected candidateCount: ${data.candidateCount}`);
      const attrs = await client.callToolJSON<Record<string, unknown>>(
        "ui_attr_get", { locator: a11y("gesture_status"), attrs: ["text", "displayText"], session: SESSION }
      );
      const text = String(attrs.text ?? attrs.displayText ?? "");
      if (text !== "Long press fired") throw new Error(`unexpected gesture status after long press: ${text}`);
    });

    // ─── ui_scroll ──────────────────────────────────────────────────────────
    console.log("\n[ ui_scroll ]");
    await resetToHome(client);
    await client.callToolJSON("ui_tap", { locator: a11y("push_feed_screen"), session: SESSION });
    await new Promise((r) => setTimeout(r, 500));

    await test("scroll long_feed_scroll returns execution summary", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; locator?: string; resolvedOid?: string; matchedBy?: string; direction?: string; distance?: number }>(
        "ui_scroll", { locator: a11y("long_feed_scroll"), direction: "down", distance: 200, session: SESSION }
      );
      if (!data.ok) throw new Error(`unexpected result: ${JSON.stringify(data)}`);
      if (data.locator !== a11y("long_feed_scroll")) throw new Error(`unexpected locator: ${data.locator}`);
      if (!data.resolvedOid) throw new Error(`missing resolvedOid: ${JSON.stringify(data)}`);
      if (data.matchedBy !== "accessibilityIdentifier") throw new Error(`unexpected matchedBy: ${data.matchedBy}`);
      if (data.direction !== "down") throw new Error(`unexpected direction: ${data.direction}`);
      if (data.distance !== 200) throw new Error(`unexpected distance: ${data.distance}`);
    });

    // ─── ui_set_attr ────────────────────────────────────────────────────────
    console.log("\n[ ui_set_attr ]");
    await resetToHome(client);

    await test("set alpha=0.8 on UILabel returns ok:true", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; attr?: string; locator?: string }>(
        "ui_set_attr", { locator: a11y("push_buttons_screen"), attr: "alpha", value: "0.8", session: SESSION }
      );
      if (!data.ok) throw new Error(`expected ok:true, got ${JSON.stringify(data)}`);
      if (data.attr !== "alpha") throw new Error(`unexpected attr: ${data.attr}`);
      if (data.locator !== a11y("push_buttons_screen")) throw new Error(`unexpected locator: ${data.locator}`);
    });

    // Restore alpha (best-effort)
    await client.callTool("ui_set_attr", { locator: a11y("push_buttons_screen"), attr: "alpha", value: "1.0", session: SESSION });

    // ─── compare_with_design ────────────────────────────────────────────────
    console.log("\n[ compare_with_design ]");

    await test("returns screenshotPath + figmaNodeUrl + instructions", async () => {
      const data = await client.callToolJSON<{
        screenshotPath?: string;
        figmaNodeUrl?: string;
        instructions?: string;
      }>("compare_with_design", {
        figmaNodeUrl: "https://figma.com/design/test123/MockApp?node-id=1-2",
        session: SESSION,
      });
      if (!data.screenshotPath) throw new Error("missing screenshotPath");
      if (!data.figmaNodeUrl) throw new Error("missing figmaNodeUrl");
      if (!data.instructions?.includes("Figma MCP")) throw new Error("missing instructions");
    });

    // ─── ui_invoke ──────────────────────────────────────────────────────────
    console.log("\n[ ui_invoke ]");

    let labelOid: string | undefined;
    await test("resolve a UILabel OID for invoke tests", async () => {
      labelOid = await resolveFirstOidByClass(client, "UILabel");
      if (!labelOid || labelOid === "undefined") throw new Error("no UILabel found");
    });

    await test("invoke setNeedsLayout (void) returns returnValue field", async () => {
      if (!labelOid) throw new Error("no label OID");
      const data = await client.callToolJSON<{ selector?: string; returnValue?: unknown }>(
        "ui_invoke", { selector: "setNeedsLayout", target: `oid:${labelOid}`, session: SESSION }
      );
      if (data.selector !== "setNeedsLayout") throw new Error(`unexpected selector: ${data.selector}`);
      if (!("returnValue" in data)) throw new Error("missing returnValue field");
    });

    await test("invoke setAlpha: with arg changes alpha", async () => {
      if (!labelOid) throw new Error("no label OID");
      const data = await client.callToolJSON<{ selector?: string; args?: string[] }>(
        "ui_invoke", { selector: "setAlpha:", target: `oid:${labelOid}`, args: ["0.6"], session: SESSION }
      );
      if (data.selector !== "setAlpha:") throw new Error(`unexpected selector: ${data.selector}`);
      if (!data.args?.includes("0.6")) throw new Error(`args mismatch: ${JSON.stringify(data.args)}`);
    });

    // Restore alpha
    await client.callTool("ui_invoke", { selector: "setAlpha:", target: `oid:${labelOid}`, args: ["1.0"], session: SESSION });

    await test("invoke unknown selector returns isError=true", async () => {
      if (!labelOid) throw new Error("no label OID");
      const r = await client.callTool("ui_invoke", {
        selector: "doesNotExistMethod__:", target: `oid:${labelOid}`, session: SESSION
      });
      if (!r.isError) throw new Error("expected isError=true for unknown selector");
    });

    // ─── ui_wait ────────────────────────────────────────────────────────────
    console.log("\n[ ui_wait ]");
    await resetToHome(client);

    await test("wait appears UILabel returns met:true immediately", async () => {
      const data = await client.callToolJSON<{ met?: boolean; pollCount?: number }>(
        "ui_wait", { mode: "appears", locator: "UILabel", session: SESSION }
      );
      if (!data.met) throw new Error("expected met:true");
      if (typeof data.pollCount !== "number") throw new Error("missing pollCount");
    });

    await test("wait appears push_buttons_screen returns met:true", async () => {
      const data = await client.callToolJSON<{ met?: boolean }>(
        "ui_wait", { mode: "appears", locator: "push_buttons_screen", timeout: 3, session: SESSION }
      );
      if (!data.met) throw new Error("expected met:true for push_buttons_screen");
    });

    await test("wait gone explicit .UILabel class returns isError=true (timeout)", async () => {
      const r = await client.callTool("ui_wait", {
        mode: "gone", locator: ".UILabel", timeout: 1, session: SESSION
      });
      if (!r.isError) throw new Error("expected isError=true — UILabel never disappears");
    });

    await test("wait attr mode with missing key returns isError", async () => {
      const r = await client.callTool("ui_wait", {
        mode: "attr", locator: "UILabel", session: SESSION
        // missing key — should fail
      });
      if (!r.isError) throw new Error("expected isError=true for missing key");
    });

    // ─── ui_assert ──────────────────────────────────────────────────────────
    console.log("\n[ ui_assert ]");
    await resetToHome(client);

    await test("assert visible home_buttons_stack passes", async () => {
      const data = await client.callToolJSON<{ passed?: boolean; matchCount?: number }>(
        "ui_assert", { mode: "visible", locator: "home_buttons_stack", session: SESSION }
      );
      if (!data.passed) throw new Error("expected passed:true");
      if (data.matchCount !== 1) throw new Error(`expected matchCount 1, got ${data.matchCount}`);
    });

    await test("assert visible __missing__ returns isError=true", async () => {
      const r = await client.callTool("ui_assert", {
        mode: "visible", locator: "__absolutely_nonexistent_xyz__", session: SESSION
      });
      if (!r.isError) throw new Error("expected isError=true for missing locator");
    });

    await test("assert count UIButton min=1 passes", async () => {
      const data = await client.callToolJSON<{ passed?: boolean }>(
        "ui_assert", { mode: "count", locator: "UIButton", min: 1, session: SESSION }
      );
      if (!data.passed) throw new Error("expected passed:true for min=1 UIButton");
    });

    await test("assert count UIButton expected=999 returns isError=true", async () => {
      const r = await client.callTool("ui_assert", {
        mode: "count", locator: "UIButton", count: 999, session: SESSION
      });
      if (!r.isError) throw new Error("expected isError=true for count=999");
    });

    // ─── ui_screenshot ──────────────────────────────────────────────────────
    console.log("\n[ ui_screenshot ]");
    await resetToHome(client);

    await test("full-screen screenshot returns path and full-screen dimensions", async () => {
      const data = await client.callToolJSON<{ path?: string; width?: number; height?: number }>("ui_screenshot", { session: SESSION });
      if (!data.path) throw new Error("missing path");
      if (!data.path.endsWith(".png")) throw new Error(`expected .png path, got: ${data.path}`);
      if ((data.width ?? 0) < 1000 || (data.height ?? 0) < 2000) {
        throw new Error(`expected full-screen screenshot dimensions, got ${data.width}x${data.height}`);
      }
    });

    await test("node screenshot of push_buttons_screen returns path and locator", async () => {
      const data = await client.callToolJSON<{ path?: string; locator?: string }>(
        "ui_screenshot", { locator: a11y("push_buttons_screen"), session: SESSION }
      );
      if (!data.path) throw new Error("missing path");
      if (data.locator !== a11y("push_buttons_screen")) throw new Error(`unexpected locator: ${data.locator}`);
    });

    // ─── ui_input (navigate to forms first) ────────────────────────────────
    console.log("\n[ ui_input ]");
    await resetToHome(client);

    await test("navigate to forms screen", async () => {
      await client.callToolJSON("ui_tap", { locator: a11y("push_forms_screen"), session: SESSION });
      await new Promise((r) => setTimeout(r, 500));
      // Verify we're on the forms screen
      const r = await client.callTool("ui_assert", {
        mode: "visible", locator: a11y("primary_text_field"), session: SESSION
      });
      if (r.isError) throw new Error("forms screen did not appear");
    });

    await test("input text into primary_text_field returns execution summary", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; text?: string; locator?: string; matchedBy?: string; oid?: string }>(
        "ui_input", { locator: a11y("primary_text_field"), text: "hello e2e", session: SESSION }
      );
      if (!data.ok) throw new Error("expected ok:true");
      if (data.text !== "hello e2e") throw new Error(`unexpected text: ${data.text}`);
      if (data.locator !== a11y("primary_text_field")) throw new Error(`unexpected locator: ${data.locator}`);
      if (data.matchedBy !== "accessibilityIdentifier") throw new Error(`unexpected matchedBy: ${data.matchedBy}`);
      if (!data.oid) throw new Error(`missing resolved oid: ${JSON.stringify(data)}`);
    });

    await test("back from forms screen", async () => {
      await tapBack(client);
    });

    // ─── ui_swipe ───────────────────────────────────────────────────────────
    console.log("\n[ ui_swipe ]");
    await resetToHome(client);
    await client.callToolJSON("ui_tap", { locator: a11y("push_feed_screen"), session: SESSION });
    await new Promise((r) => setTimeout(r, 500));

    await test("swipe UIScrollView down returns ok:true with target/direction/distance", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; target?: string; direction?: string; distance?: number }>(
        "ui_swipe", { target: a11y("long_feed_scroll"), direction: "down", distance: 150, session: SESSION }
      );
      if (!data.ok) throw new Error("expected ok:true");
      if (data.direction !== "down") throw new Error(`unexpected direction: ${data.direction}`);
      if (data.distance !== 150) throw new Error(`unexpected distance: ${data.distance}`);
    });

    await test("swipe UIScrollView up returns ok:true", async () => {
      const data = await client.callToolJSON<{ ok?: boolean }>(
        "ui_swipe", { target: a11y("long_feed_scroll"), direction: "up", session: SESSION }
      );
      if (!data.ok) throw new Error("expected ok:true");
    });

    // ─── ui_dismiss (show a modal sheet, then dismiss it) ───────────────────
    console.log("\n[ ui_dismiss ]");
    await resetToHome(client);

    await test("tap show_home_sheet to present a modal sheet", async () => {
      await client.callToolJSON("ui_tap", { locator: a11y("show_home_sheet"), session: SESSION });
      await new Promise((r) => setTimeout(r, 500));
      // Modal is now presented; dismiss_modal button visible inside it
      const r = await client.callTool("ui_assert", {
        mode: "visible", locator: a11y("dismiss_modal"), session: SESSION
      });
      if (r.isError) throw new Error("modal did not appear");
    });

    await test("dismiss modal-hosted node returns execution summary", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; locator?: string; resolvedOid?: string; matchedBy?: string }>(
        "ui_dismiss", { locator: a11y("dismiss_modal"), session: SESSION }
      );
      if (!data.ok) throw new Error(`expected ok:true, got ${JSON.stringify(data)}`);
      if (data.locator !== a11y("dismiss_modal")) throw new Error(`unexpected locator: ${data.locator}`);
      if (data.matchedBy !== "accessibilityIdentifier") throw new Error(`unexpected matchedBy: ${data.matchedBy}`);
      if (!data.resolvedOid) throw new Error(`missing resolvedOid: ${JSON.stringify(data)}`);
    });

    await test("modal gone after dismiss (home screen buttons visible)", async () => {
      const wait = await client.callToolJSON<{ met?: boolean }>(
        "ui_wait", { mode: "gone", locator: a11y("dismiss_modal"), timeout: 3, session: SESSION }
      );
      if (!wait.met) throw new Error("dismiss_modal did not disappear after dismiss");
    });

    await new Promise((r) => setTimeout(r, 300));

  } finally {
    client.close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runE2E().catch((e) => {
  console.error("Fatal e2e error:", e);
  process.exit(1);
});
