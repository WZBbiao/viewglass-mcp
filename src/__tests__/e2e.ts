/**
 * E2E test: calls the MCP server process with real tool calls against ViewglassDemo.
 * Requires ViewglassDemo to be running on simulator with Viewglass enabled.
 *
 * Usage: VIEWGLASS_BIN=<path> npx tsx src/__tests__/e2e.ts
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = join(__dirname, "../../dist/index.js");
const LOCAL_DEV_VIEWGLASS_BIN = join(__dirname, "../../../lookin/.build/debug/viewglass");
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

class MCPClient {
  private proc: ReturnType<typeof spawn>;
  private pendingCalls = new Map<number, (r: JsonRpcResponse) => void>();
  private nextId = 1;
  private initialized = false;

  constructor() {
    this.proc = spawn("node", [SERVER_ENTRY], {
      env: { ...process.env, VIEWGLASS_BIN },
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

async function resetToHome(client: MCPClient): Promise<void> {
  await client.callTool("ui_tap", { locator: "dismiss_modal", session: SESSION });
  await new Promise((r) => setTimeout(r, 300));
  await client.callTool("ui_tap", { locator: "_UIButtonBarButton", session: SESSION });
  await new Promise((r) => setTimeout(r, 300));
  await client.callTool("ui_tap", { locator: "switch_tab_home", session: SESSION });
  await new Promise((r) => setTimeout(r, 400));
  await client.callToolJSON("ui_wait", {
    mode: "appears",
    locator: "push_buttons_screen",
    timeout: 12,
    intervalMs: 500,
    session: SESSION,
  });
}

// ─── E2E Tests ────────────────────────────────────────────────────────────────

const SESSION = "com.wzb.ViewglassDemo@47164";

async function runE2E() {
  const client = new MCPClient();
  // Give server a moment to boot
  await new Promise((r) => setTimeout(r, 500));

  try {
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
      const data = await client.callToolJSON<{ nodes?: Array<{ searchableText?: unknown[]; actionTargetOid?: unknown }> }>(
        "ui_snapshot", { session: SESSION, filter: "UILabel" }
      );
      if (!Array.isArray(data.nodes) || data.nodes.length === 0) throw new Error("expected filtered nodes");
      if (!data.nodes.some((node) => Array.isArray(node.searchableText) && node.searchableText.length > 0)) {
        throw new Error("expected searchableText on at least one node");
      }
      if (!data.nodes.some((node) => node.actionTargetOid !== undefined)) {
        throw new Error("expected actionTargetOid on nodes");
      }
    });

    // ─── ui_query ───────────────────────────────────────────────────────────
    console.log("\n[ ui_query ]");

    await test("query UILabel returns array of nodes", async () => {
      const nodes = await client.callToolJSON<unknown[]>("ui_query", { locator: "UILabel", session: SESSION });
      if (!Array.isArray(nodes) || nodes.length === 0) throw new Error("expected non-empty array");
    });

    await test("query UITabBar supports fuzzy class matching", async () => {
      const full = await client.callToolJSON<unknown[]>("ui_query", { locator: "UITabBar", session: SESSION });
      const fuzzy = await client.callToolJSON<unknown[]>("ui_query", { locator: "TabBar", session: SESSION });
      const lowercase = await client.callToolJSON<unknown[]>("ui_query", { locator: "tabbar", session: SESSION });
      if (!Array.isArray(full) || full.length === 0) throw new Error("expected UITabBar query to match");
      if (!Array.isArray(fuzzy) || fuzzy.length === 0) throw new Error("expected TabBar fuzzy query to match");
      if (!Array.isArray(lowercase) || lowercase.length === 0) throw new Error("expected tabbar lowercase query to match");
    });

    await test("query missing locator returns isError=true", async () => {
      const r = await client.callTool("ui_query", { locator: "__definitely_missing__", session: SESSION });
      if (!r.isError) throw new Error("expected isError=true for missing locator");
    });

    // ─── ui_attr_get ────────────────────────────────────────────────────────
    console.log("\n[ ui_attr_get ]");

    let testOid: string | undefined;
    await test("resolve UILabel OID for attr tests", async () => {
      const nodes = await client.callToolJSON<Array<{ oid?: number | string }>>(
        "ui_query", { locator: "UILabel", session: SESSION }
      );
      // OIDs come as numbers from CLI — convert to string for MCP schema validation
      testOid = String(nodes[0]?.oid);
      if (!testOid || testOid === "undefined") throw new Error("no OID found");
    });

    await test("attr get with specific attrs returns filtered map", async () => {
      if (!testOid) throw new Error("no OID");
      const attrs = await client.callToolJSON<Record<string, unknown>>(
        "ui_attr_get", { oid: testOid, attrs: ["opacity", "hidden"], session: SESSION }
      );
      if (!("opacity" in attrs)) throw new Error(`missing 'opacity' in ${JSON.stringify(Object.keys(attrs))}`);
      if (!("hidden" in attrs)) throw new Error("missing 'hidden'");
    });

    await test("attr get without attrs returns all attributes", async () => {
      if (!testOid) throw new Error("no OID");
      const attrs = await client.callToolJSON<Record<string, unknown>>(
        "ui_attr_get", { oid: testOid, session: SESSION }
      );
      if (Object.keys(attrs).length < 5) throw new Error(`too few attrs: ${Object.keys(attrs).length}`);
    });

    // ─── ui_tap ─────────────────────────────────────────────────────────────
    console.log("\n[ ui_tap ]");
    await resetToHome(client);

    await test("tap push_buttons_screen returns execution summary", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; locator?: string; resolvedTarget?: string; matchedBy?: string }>(
        "ui_tap", { locator: "push_buttons_screen", session: SESSION }
      );
      if (!data.ok) throw new Error(`unexpected result: ${JSON.stringify(data)}`);
      if (data.locator !== "push_buttons_screen") throw new Error(`unexpected locator: ${data.locator}`);
      if (!data.resolvedTarget) throw new Error("missing resolvedTarget");
      if (!data.matchedBy) throw new Error("missing matchedBy");
    });

    await test("tap _UIButtonBarButton (back) returns execution summary", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; resolvedTarget?: string }>(
        "ui_tap", { locator: "_UIButtonBarButton", session: SESSION }
      );
      if (!data.ok || !data.resolvedTarget) throw new Error(`unexpected result: ${JSON.stringify(data)}`);
    });

    await test("tap table cell label triggers UITableViewCell selection", async () => {
      await client.callToolJSON("ui_tap", { locator: "push_selectable_surfaces_screen", session: SESSION });
      await client.callToolJSON("ui_tap", { locator: "table_row_label_1", session: SESSION });
      const nodes = await client.callToolJSON<Array<{ oid?: number | string }>>(
        "ui_query", { locator: "selection_status", session: SESSION }
      );
      const oid = String(nodes[0]?.oid);
      if (!oid || oid === "undefined") throw new Error("missing selection_status oid");
      const attrs = await client.callToolJSON<Record<string, unknown>>(
        "ui_attr_get", { oid, attrs: ["text", "displayText"], session: SESSION }
      );
      const text = String(attrs.text ?? attrs.displayText ?? "");
      if (text !== "Table selected: Profile") {
        throw new Error(`unexpected selection status after table tap: ${text}`);
      }
    });

    await test("tap collection cell label triggers UICollectionViewCell selection", async () => {
      await client.callToolJSON("ui_tap", { locator: "collection_tile_label_2", session: SESSION });
      const nodes = await client.callToolJSON<Array<{ oid?: number | string }>>(
        "ui_query", { locator: "selection_status", session: SESSION }
      );
      const oid = String(nodes[0]?.oid);
      if (!oid || oid === "undefined") throw new Error("missing selection_status oid");
      const attrs = await client.callToolJSON<Record<string, unknown>>(
        "ui_attr_get", { oid, attrs: ["text", "displayText"], session: SESSION }
      );
      const text = String(attrs.text ?? attrs.displayText ?? "");
      if (text !== "Collection selected: Sunset") {
        throw new Error(`unexpected selection status after collection tap: ${text}`);
      }
      await client.callToolJSON("ui_tap", { locator: "_UIButtonBarButton", session: SESSION });
    });

    // ─── ui_scroll ──────────────────────────────────────────────────────────
    console.log("\n[ ui_scroll ]");
    await resetToHome(client);
    await client.callToolJSON("ui_tap", { locator: "switch_tab_feed", session: SESSION });
    await new Promise((r) => setTimeout(r, 500));

    await test("scroll long_feed_scroll returns execution summary", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; locator?: string; direction?: string; distance?: number; resolvedTarget?: string }>(
        "ui_scroll", { locator: "long_feed_scroll", direction: "down", distance: 200, session: SESSION }
      );
      if (!data.ok) throw new Error(`unexpected result: ${JSON.stringify(data)}`);
      if (data.locator !== "long_feed_scroll") throw new Error(`unexpected locator: ${data.locator}`);
      if (data.direction !== "down") throw new Error(`unexpected direction: ${data.direction}`);
      if (data.distance !== 200) throw new Error(`unexpected distance: ${data.distance}`);
      if (!data.resolvedTarget) throw new Error("missing resolvedTarget");
    });

    // ─── ui_set_attr ────────────────────────────────────────────────────────
    console.log("\n[ ui_set_attr ]");
    await resetToHome(client);

    await test("set alpha=0.8 on UILabel returns ok:true", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; attr?: string; locator?: string }>(
        "ui_set_attr", { locator: "push_buttons_screen", attr: "alpha", value: "0.8", session: SESSION }
      );
      if (!data.ok) throw new Error(`expected ok:true, got ${JSON.stringify(data)}`);
      if (data.attr !== "alpha") throw new Error(`unexpected attr: ${data.attr}`);
      if (data.locator !== "push_buttons_screen") throw new Error(`unexpected locator: ${data.locator}`);
    });

    // Restore alpha (best-effort)
    await client.callTool("ui_set_attr", { locator: "push_buttons_screen", attr: "alpha", value: "1.0", session: SESSION });

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

    // ─── ui_scan ────────────────────────────────────────────────────────────
    console.log("\n[ ui_scan ]");

    await test("returns sessions array with the running app", async () => {
      const data = await client.callToolJSON<{ sessions: Array<{ bundleId: string; session: string }> }>(
        "ui_scan", {}
      );
      if (!Array.isArray(data.sessions)) throw new Error("missing sessions array");
      if (data.sessions.length === 0) throw new Error("expected at least 1 session");
      const found = data.sessions.find((s) => s.session === SESSION);
      if (!found) throw new Error(`session '${SESSION}' not found in: ${JSON.stringify(data.sessions.map((s) => s.session))}`);
    });

    await test("session string has bundleId@port format", async () => {
      const data = await client.callToolJSON<{ sessions: Array<{ session: string }> }>("ui_scan", {});
      const s = data.sessions[0];
      if (!s.session.includes("@")) throw new Error(`unexpected session format: ${s.session}`);
    });

    // ─── ui_invoke ──────────────────────────────────────────────────────────
    console.log("\n[ ui_invoke ]");

    let labelOid: string | undefined;
    await test("resolve a UILabel OID for invoke tests", async () => {
      const nodes = await client.callToolJSON<Array<{ oid?: number | string }>>(
        "ui_query", { locator: "UILabel", session: SESSION }
      );
      labelOid = String(nodes[0]?.oid);
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

    await test("wait gone __nonexistent__ returns isError=true (timeout)", async () => {
      const r = await client.callTool("ui_wait", {
        mode: "gone", locator: "UILabel", timeout: 1, session: SESSION
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

    await test("full-screen screenshot returns path ending in .png", async () => {
      const data = await client.callToolJSON<{ path?: string }>("ui_screenshot", { session: SESSION });
      if (!data.path) throw new Error("missing path");
      if (!data.path.endsWith(".png")) throw new Error(`expected .png path, got: ${data.path}`);
    });

    await test("node screenshot of push_buttons_screen returns path and locator", async () => {
      const data = await client.callToolJSON<{ path?: string; locator?: string }>(
        "ui_screenshot", { locator: "push_buttons_screen", session: SESSION }
      );
      if (!data.path) throw new Error("missing path");
      if (data.locator !== "push_buttons_screen") throw new Error(`unexpected locator: ${data.locator}`);
    });

    // ─── ui_input (navigate to forms first) ────────────────────────────────
    console.log("\n[ ui_input ]");
    await resetToHome(client);

    await test("navigate to forms screen", async () => {
      await client.callToolJSON("ui_tap", { locator: "push_forms_screen", session: SESSION });
      await new Promise((r) => setTimeout(r, 500));
      // Verify we're on the forms screen
      const r = await client.callTool("ui_assert", {
        mode: "visible", locator: "primary_text_field", session: SESSION
      });
      if (r.isError) throw new Error("forms screen did not appear");
    });

    await test("input text into primary_text_field returns execution summary", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; text?: string; resolvedTarget?: string; matchedBy?: string }>(
        "ui_input", { target: "primary_text_field", text: "hello e2e", session: SESSION }
      );
      if (!data.ok) throw new Error("expected ok:true");
      if (data.text !== "hello e2e") throw new Error(`unexpected text: ${data.text}`);
      if (!data.resolvedTarget) throw new Error("missing resolvedTarget");
      if (!data.matchedBy) throw new Error("missing matchedBy");
    });

    await test("back from forms screen", async () => {
      await client.callToolJSON("ui_tap", { locator: "_UIButtonBarButton", session: SESSION });
      await new Promise((r) => setTimeout(r, 500));
    });

    // ─── ui_swipe ───────────────────────────────────────────────────────────
    console.log("\n[ ui_swipe ]");
    await resetToHome(client);
    await client.callToolJSON("ui_tap", { locator: "switch_tab_feed", session: SESSION });
    await new Promise((r) => setTimeout(r, 500));

    await test("swipe UIScrollView down returns ok:true with target/direction/distance", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; target?: string; direction?: string; distance?: number }>(
        "ui_swipe", { target: "long_feed_scroll", direction: "down", distance: 150, session: SESSION }
      );
      if (!data.ok) throw new Error("expected ok:true");
      if (data.direction !== "down") throw new Error(`unexpected direction: ${data.direction}`);
      if (data.distance !== 150) throw new Error(`unexpected distance: ${data.distance}`);
    });

    await test("swipe UIScrollView up returns ok:true", async () => {
      const data = await client.callToolJSON<{ ok?: boolean }>(
        "ui_swipe", { target: "long_feed_scroll", direction: "up", session: SESSION }
      );
      if (!data.ok) throw new Error("expected ok:true");
    });

    // ─── ui_dismiss (show a modal sheet, then dismiss it) ───────────────────
    console.log("\n[ ui_dismiss ]");
    await resetToHome(client);

    await test("tap show_home_sheet to present a modal sheet", async () => {
      await client.callToolJSON("ui_tap", { locator: "show_home_sheet", session: SESSION });
      await new Promise((r) => setTimeout(r, 500));
      // Modal is now presented; dismiss_modal button visible inside it
      const r = await client.callTool("ui_assert", {
        mode: "visible", locator: "dismiss_modal", session: SESSION
      });
      if (r.isError) throw new Error("modal did not appear");
    });

    await test("dismiss UINavigationController returns execution summary", async () => {
      const data = await client.callToolJSON<{ ok?: boolean; resolvedTarget?: string; matchedBy?: string }>(
        "ui_dismiss", { target: "UINavigationController", session: SESSION }
      );
      if (!data.ok) throw new Error(`expected ok:true, got ${JSON.stringify(data)}`);
      if (!data.resolvedTarget) throw new Error("missing resolvedTarget");
      if (!data.matchedBy) throw new Error("missing matchedBy");
    });

    await test("modal gone after dismiss (home screen buttons visible)", async () => {
      const wait = await client.callToolJSON<{ met?: boolean }>(
        "ui_wait", { mode: "gone", locator: "dismiss_modal", timeout: 3, session: SESSION }
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
