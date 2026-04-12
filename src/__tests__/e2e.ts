/**
 * E2E test: calls the MCP server process with real tool calls against ViewglassDemo.
 * Requires ViewglassDemo to be running on simulator with Viewglass enabled.
 *
 * Usage: VIEWGLASS_BIN=<path> npx tsx src/__tests__/e2e.ts
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = join(__dirname, "../../dist/index.js");
const VIEWGLASS_BIN =
  process.env.VIEWGLASS_BIN ??
  "/Users/wangzhenbiao/works/lookin/.build/release/viewglass";

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

// ─── E2E Tests ────────────────────────────────────────────────────────────────

const SESSION = "com.wzb.ViewglassDemo@47164";

async function runE2E() {
  const client = new MCPClient();
  // Give server a moment to boot
  await new Promise((r) => setTimeout(r, 500));

  try {
    // ─── Ensure app is on Home tab ──────────────────────────────────────────
    // switch_tab_home exists on Feed/Forms but not Home. Silently no-ops when already home.
    await client.callTool("ui_tap", { locator: "#switch_tab_home", session: SESSION });
    await new Promise((r) => setTimeout(r, 400));

    // ─── ui_snapshot ────────────────────────────────────────────────────────
    console.log("\n[ ui_snapshot ]");

    await test("returns hierarchy with windows array", async () => {
      const data = await client.callToolJSON<{ windows?: unknown[] }>("ui_snapshot", { session: SESSION });
      if (!Array.isArray(data.windows)) throw new Error("missing windows array");
    });

    await test("filter=UILabel narrows result", async () => {
      const data = await client.callToolJSON("ui_snapshot", { session: SESSION, filter: "UILabel" });
      if (typeof data !== "object" || data === null) throw new Error("unexpected response");
    });

    // ─── ui_query ───────────────────────────────────────────────────────────
    console.log("\n[ ui_query ]");

    await test("query UILabel returns array of nodes", async () => {
      const nodes = await client.callToolJSON<unknown[]>("ui_query", { locator: "UILabel", session: SESSION });
      if (!Array.isArray(nodes) || nodes.length === 0) throw new Error("expected non-empty array");
    });

    await test("query missing locator returns isError=true", async () => {
      const r = await client.callTool("ui_query", { locator: "#__definitely_missing__", session: SESSION });
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

    await test("tap #push_buttons_screen returns tapped + hierarchy", async () => {
      const data = await client.callToolJSON<{ tapped?: string; hierarchy?: unknown }>(
        "ui_tap", { locator: "#push_buttons_screen", session: SESSION }
      );
      if (data.tapped !== "#push_buttons_screen") throw new Error(`unexpected tapped: ${data.tapped}`);
      if (!data.hierarchy) throw new Error("missing post-action hierarchy");
    });

    await test("tap _UIButtonBarButton (back) returns hierarchy", async () => {
      const data = await client.callToolJSON<{ hierarchy?: unknown }>(
        "ui_tap", { locator: "_UIButtonBarButton", session: SESSION }
      );
      if (!data.hierarchy) throw new Error("missing post-action hierarchy");
    });

    // ─── ui_scroll ──────────────────────────────────────────────────────────
    console.log("\n[ ui_scroll ]");
    // Wait for back-navigation animation to complete before scrolling
    await new Promise((r) => setTimeout(r, 600));

    await test("scroll UIScrollView down returns scrolled+direction+hierarchy", async () => {
      const data = await client.callToolJSON<{ scrolled?: string; direction?: string; hierarchy?: unknown }>(
        "ui_scroll", { locator: "UIScrollView", direction: "down", distance: 200, session: SESSION }
      );
      if (data.scrolled !== "UIScrollView") throw new Error(`unexpected scrolled: ${data.scrolled}`);
      if (data.direction !== "down") throw new Error(`unexpected direction: ${data.direction}`);
      if (!data.hierarchy) throw new Error("missing hierarchy");
    });

    // ─── ui_set_attr ────────────────────────────────────────────────────────
    console.log("\n[ ui_set_attr ]");

    await test("set alpha=0.8 on UILabel returns ok:true", async () => {
      if (!testOid) throw new Error("no OID");
      const data = await client.callToolJSON<{ ok?: boolean; attr?: string }>(
        "ui_set_attr", { oid: testOid, attr: "alpha", value: "0.8", session: SESSION }
      );
      if (!data.ok) throw new Error(`expected ok:true, got ${JSON.stringify(data)}`);
      if (data.attr !== "alpha") throw new Error(`unexpected attr: ${data.attr}`);
    });

    // Restore alpha (best-effort)
    await client.callTool("ui_set_attr", { oid: testOid!, attr: "alpha", value: "1.0", session: SESSION });

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
