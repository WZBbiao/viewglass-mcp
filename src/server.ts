#!/usr/bin/env node
/**
 * Viewglass MCP Server
 *
 * Exposes tools for AI agents to inspect and interact with iOS app UI at runtime:
 *   Read:        ui_snapshot, ui_attr_get
 *   Write:       ui_set_attr, ui_invoke
 *   Interact:    ui_tap, ui_scroll, ui_swipe, ui_long_press, ui_input, ui_dismiss
 *   Assert/Wait: ui_assert, ui_wait
 *   Visual:      ui_screenshot, compare_with_design
 *   Feedback:    ui_feedback
 *
 * Requires the `viewglass` binary to be in PATH, or set VIEWGLASS_BIN env var.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { uiSnapshot } from "./tools/ui_snapshot.js";
import { uiAttrGet } from "./tools/ui_attr_get.js";
import { uiTap } from "./tools/ui_tap.js";
import { uiScroll } from "./tools/ui_scroll.js";
import { uiSetAttr } from "./tools/ui_set_attr.js";
import { compareWithDesign } from "./tools/compare_with_design.js";
import { uiInvoke } from "./tools/ui_invoke.js";
import { uiWait } from "./tools/ui_wait.js";
import { uiAssert } from "./tools/ui_assert.js";
import { uiConnect } from "./tools/ui_connect.js";
import { uiScreenshot } from "./tools/ui_screenshot.js";
import { uiInput } from "./tools/ui_input.js";
import { uiSwipe } from "./tools/ui_swipe.js";
import { uiLongPress } from "./tools/ui_long_press.js";
import { uiDismiss } from "./tools/ui_dismiss.js";
import { uiFeedback } from "./tools/ui_feedback.js";
import { uiScan } from "./tools/ui_scan.js";
import {
  logAgentTrace,
  logToolFinish,
  logToolStart,
  logToolThrow,
  safeStringify,
  summarizeAgentToolResponse,
} from "./log.js";
import { autoBootstrapForMcpStartup, ensureProjectBootstrapForUsage } from "./init.js";
import { noteSuccessfulTool } from "./project_memory.js";
import { deviceAccess, DeviceAccessError } from "./device_access.js";

export function createServer() {
const server = new McpServer({
  name: "viewglass-mcp",
  version: "0.1.0",
});

const sessionSchema = z
  .string()
  .optional()
  .describe("Session in bundleId@port format. Auto-detected if omitted.");

type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

let toolCallSequence = 0;

function summarizeToolResponse(response: ToolResponse) {
  return {
    isError: response.isError === true,
    contentTypes: response.content.map((item) => item.type),
    firstText: response.content[0]?.text ? safeStringify(response.content[0].text, 400) : undefined,
  };
}

async function withToolLogging<TArgs extends object>(
  name: string,
  args: TArgs,
  run: () => Promise<ToolResponse>
): Promise<ToolResponse> {
  ensureProjectBootstrapForUsage();
  const startedAt = Date.now();
  const traceId = `${process.pid}-${Date.now()}-${++toolCallSequence}`;
  const session =
    "session" in args && typeof (args as { session?: unknown }).session === "string"
      ? ((args as { session?: string }).session ?? undefined)
      : undefined;
  logToolStart(name, args);
  logAgentTrace({ event: "tool:start", traceId, tool: name, session, args });
  try {
    const result = await deviceAccess.runTool(name, args, run);
    const durationMs = Date.now() - startedAt;
    const parsedFirstText = (() => {
      const firstText = result.content[0]?.text;
      if (!firstText || result.isError === true) return undefined;
      try {
        return JSON.parse(firstText);
      } catch {
        return undefined;
      }
    })();
    if (parsedFirstText !== undefined) {
      noteSuccessfulTool(name, args, parsedFirstText);
    }
    logToolFinish(name, summarizeToolResponse(result), durationMs, session);
    logAgentTrace({
      event: "tool:end",
      traceId,
      tool: name,
      session,
      durationMs,
      args,
      isError: result.isError === true,
      response: summarizeAgentToolResponse(name, result),
    });
    return result;
  } catch (error: unknown) {
    const durationMs = Date.now() - startedAt;
    logToolThrow(name, error, durationMs, session);
    logAgentTrace({
      event: "tool:throw",
      traceId,
      tool: name,
      session,
      durationMs,
      args,
      isError: true,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : safeStringify(error, 1200),
    });
    if (error instanceof DeviceAccessError) {
      return { isError: true, content: [{ type: "text", text: String(error) }] };
    }
    throw error;
  }
}

// ─── ui_scan ────────────────────────────────────────────────────────────────

server.registerTool(
  "ui_scan",
  {
    description:
      "List all currently discoverable Viewglass app sessions without claiming exclusive control of any device. " +
      "Use this before ui_connect when several simulators or physical devices are available, or after a device lease conflict to choose another instance by deviceIdentifier.",
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async () =>
    withToolLogging("ui_scan", {}, async () => {
      const result = await uiScan();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
);

// ─── ui_feedback ────────────────────────────────────────────────────────────

server.registerTool(
  "ui_feedback",
  {
    description:
      "Record structured feedback about ViewglassMCP after a live task, especially bad cases, blocked flows, inefficient tool loops, " +
      "wrong snapshots, stale sessions, missing actions, or successful reusable discoveries. " +
      "Writes JSONL to VIEWGLASS_MCP_FEEDBACK_FILE if set, otherwise .viewglassmcp/feedback.jsonl in the current project. " +
      "Use this near the end of a ViewglassMCP task when there is actionable product feedback.",
    inputSchema: {
      title: z.string().min(1).describe("Short feedback title."),
      task: z.string().optional().describe("What the agent was trying to accomplish."),
      summary: z.string().min(1).describe("Concise agent-perspective summary."),
      expected: z.string().optional().describe("Expected behavior for bad cases."),
      actual: z.string().optional().describe("Actual behavior observed."),
      session: sessionSchema,
      screen: z.string().optional().describe("Current page, controller, or visible state hints."),
      tools: z.array(z.string()).optional().describe("Relevant Viewglass tool names or compact call sequence."),
      artifacts: z.array(z.string()).optional().describe("Local screenshot/log paths related to this feedback."),
      suggestion: z.string().optional().describe("Agent's concise recommendation, if any."),
      severity: z.enum(["info", "warning", "error"]).optional().describe("Feedback severity."),
      outcome: z.enum(["success", "blocked", "partial", "regression"]).optional().describe("Task outcome."),
    },
    annotations: { readOnlyHint: false },
  },
  async ({ title, task, summary, expected, actual, session, screen, tools, artifacts, suggestion, severity, outcome }) =>
    withToolLogging("ui_feedback", { title, task, summary, expected, actual, session, screen, tools, artifacts, suggestion, severity, outcome }, async () => {
      const result = uiFeedback({ title, task, summary, expected, actual, session, screen, tools, artifacts, suggestion, severity, outcome });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
);

server.registerTool(
  "ui_snapshot",
  {
    description:
      "Capture the current UI as an agent-first snapshot. " +
      "Default output is a small action index: app/session metadata, visible text summary, inferred switcher/navigation groups, " +
      "navigationCandidates for top/bottom entry points, inputCandidates with exact inputTargetOid values, " +
      "a budgeted list of actionable nodes with searchableText/actionTargetOid fields, " +
      "and matched project-local recipes when available, so agents can " +
      "find targets without guessing UIKit class names. " +
      "Best practice: for any navigation or custom UI task, call ui_snapshot first to understand the current page, " +
      "then use recommendedLocator or #accessibilityIdentifier with action tools; keep oid only as a volatile last-known fallback. " +
      "If the target is a settings/profile-style icon without text, inspect summary.navigationCandidates by areaHint such as topRight. " +
      "Use ui_screenshot for visual layout and ui_attr_get for long text or detailed attributes. " +
      "Use mode=fullIndex only when the small action index is insufficient. Set compact=false only when you also need rawTree.",
    inputSchema: {
      session: sessionSchema,
      filter: z
        .string()
        .optional()
        .describe("Only return nodes of this UIKit class name (e.g. UILabel)."),
      mode: z
        .enum(["actionIndex", "fullIndex"])
        .optional()
        .describe(
          "Default: actionIndex, a small operation index for agents. Use fullIndex only when you need the older broader compact node index."
        ),
      compact: z
        .boolean()
        .optional()
        .describe(
          "Default: true. Returns agent-first summary/groups/nodes only. Set false to also include rawTree."
        ),
      maxNodes: z
        .number()
        .int()
        .min(0)
        .max(500)
        .optional()
        .describe(
          "Compact-mode node budget. In actionIndex mode defaults to 24, or 32 when filter is set, and is capped at 48. In fullIndex mode defaults to 80/160; set 0 to return the full compact node index."
        ),
    },
    annotations: { readOnlyHint: false },
  },
  async ({ session, filter, mode, compact, maxNodes }) =>
    withToolLogging("ui_snapshot", { session, filter, mode, compact, maxNodes }, async () => {
      try {
        const result = await uiSnapshot({ session, filter, mode, compact, maxNodes });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_attr_get ─────────────────────────────────────────────────────────────

server.registerTool(
  "ui_attr_get",
  {
    description:
      "Get one or more runtime attributes of a UI node. Prefer locator for replay; oid is only a last-known runtime handle. " +
      "Returns a map of { attrKey: value }. " +
      "Common keys: frame, backgroundColor, alpha, hidden, text, font, " +
      "contentMode, accessibilityIdentifier, accessibilityLabel, cornerRadius.",
    inputSchema: {
      locator: z.string().optional().describe("Stable locator such as #accessibilityIdentifier, visible text, class name, or query expression. Preferred."),
      oid: z.coerce.string().optional().describe("Runtime OID from ui_snapshot. Volatile; use only as last-known handle or cache hint."),
      attrs: z
        .array(z.string())
        .min(1)
        .optional()
        .describe('Attribute keys to fetch (e.g. ["frame", "backgroundColor"]). Omit to get all attributes.'),
      session: sessionSchema,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ locator, oid, attrs, session }) =>
    withToolLogging("ui_attr_get", { locator, oid, attrs, session }, async () => {
      try {
        if (!locator && !oid) {
          return { isError: true, content: [{ type: "text", text: "ui_attr_get requires either 'locator' or 'oid'" }] };
        }
        const result = await uiAttrGet({ locator, oid, attrs, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_tap ──────────────────────────────────────────────────────────────────

server.registerTool(
  "ui_tap",
  {
    description:
      "Tap a UI element. Prefer locator such as #accessibilityIdentifier or ui_snapshot.recommendedLocator for replay. " +
      "oid is supported only as a volatile last-known runtime handle. " +
      "Supports semantic taps on UIControl, UITapGestureRecognizer-backed views, " +
      "UITableViewCell, and UICollectionViewCell, including nested labels inside a cell. " +
      "If semantic tap cannot find an actionable target, falls back to coordinate semantic hit-testing. " +
      "Returns { ok, oid, strategyUsed, detail, targetClass } so agents can verify which action actually fired.",
    inputSchema: {
      locator: z
        .string()
        .optional()
        .describe("Stable locator such as #accessibilityIdentifier, visible text, class name, or query expression. Preferred."),
      oid: z
        .coerce
        .string()
        .optional()
        .describe("Runtime OID from ui_snapshot. Volatile; use only as last-known handle or cache hint."),
      session: sessionSchema,
    },
  },
  async ({ locator, oid, session }) =>
    withToolLogging("ui_tap", { locator, oid, session }, async () => {
      try {
        if (!locator && !oid) {
          return { isError: true, content: [{ type: "text", text: "ui_tap requires either 'locator' or 'oid'" }] };
        }
        const result = await uiTap({ locator, oid, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_scroll ───────────────────────────────────────────────────────────────

server.registerTool(
  "ui_scroll",
  {
    description:
      "Scroll using a human-like swipe on a resolved scroll container. Prefer locator for replay; oid is only a volatile last-known runtime handle. " +
      "If the oid points to a wrapper/cell, ui_scroll resolves to an inner or ancestor scroll view that exposes contentOffset before swiping. " +
      "Returns an execution summary only. " +
      "Use direction 'down' to reveal content below the fold, 'up' to scroll back. " +
      "distance defaults to 300 pts if omitted.",
    inputSchema: {
      locator: z.string().optional().describe("Stable locator such as #accessibilityIdentifier, visible text, class name, or query expression. Preferred."),
      oid: z.coerce.string().optional().describe("Runtime OID from ui_snapshot. Volatile; use only as last-known handle or cache hint."),
      direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction."),
      distance: z.number().positive().optional().describe("Distance in pts (default 300)."),
      animated: z.boolean().optional().describe("Whether to animate the swipe (default true)."),
      session: sessionSchema,
    },
  },
  async ({ locator, oid, direction, distance, animated, session }) =>
    withToolLogging("ui_scroll", { locator, oid, direction, distance, animated, session }, async () => {
      try {
        if (!locator && !oid) {
          return { isError: true, content: [{ type: "text", text: "ui_scroll requires either 'locator' or 'oid'" }] };
        }
        const result = await uiScroll({ locator, oid, direction, distance, animated, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_set_attr ─────────────────────────────────────────────────────────────

server.registerTool(
  "ui_set_attr",
  {
    description:
      "Set an attribute on a UI node at runtime. Changes are LIVE and immediate — " +
      "no recompile needed. Use for visual debugging: tweak colors, fonts, or text " +
      "to match design spec, then read back with ui_attr_get to verify. " +
      "WARNING: Changes are ephemeral and reset on app relaunch. " +
      "Accepts either a node OID or one plain locator string; prefer locator in agent workflows. " +
      "When source is available and no stable locator exists, add an accessibilityIdentifier to the component first. " +
      "Navigation patterns (get controller OID from ui_snapshot, then use viewglass invoke): " +
      "  pop: invoke <navController-oid> popViewControllerAnimated: true — " +
      "  dismiss modal: invoke <vc-oid> dismissViewControllerAnimated:completion: true nil",
    inputSchema: {
      oid: z.coerce.string().optional().describe("Runtime OID from ui_snapshot. Volatile; use only as last-known handle or cache hint."),
      locator: z.string().optional().describe("Stable locator such as #accessibilityIdentifier, visible text, class name, or query expression. Preferred."),
      attr: z
        .string()
        .describe(
          "Attribute key (e.g. backgroundColor, alpha, hidden, text, cornerRadius)."
        ),
      value: z
        .string()
        .describe(
          "New value as string (e.g. '#FF0000' for color, '0.5' for alpha, 'true'/'false' for bool)."
        ),
      session: sessionSchema,
    },
    annotations: { destructiveHint: true, idempotentHint: true },
  },
  async ({ oid, locator, attr, value, session }) =>
    withToolLogging("ui_set_attr", { oid, locator, attr, value, session }, async () => {
      try {
        if (!oid && !locator) {
          return { isError: true, content: [{ type: "text", text: "ui_set_attr requires either 'oid' or 'locator'" }] };
        }
        const result = await uiSetAttr({ oid, locator, attr, value, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── compare_with_design ─────────────────────────────────────────────────────

server.registerTool(
  "compare_with_design",
  {
    description:
      "Expensive — capture a device screenshot and return it alongside a Figma design URL " +
      "for visual comparison. Use after code changes to verify UI matches the design spec. " +
      "This tool captures the actual rendered UI; you must then call Figma MCP " +
      "`get_screenshot` or `get_design_context` with the returned figmaNodeUrl to fetch " +
      "the reference design, and visually diff both images to produce a discrepancy report. " +
      "Optionally scope to a specific view by passing a locator.",
    inputSchema: {
      figmaNodeUrl: z
        .string()
        .url()
        .describe(
          "Figma node URL (e.g. https://figma.com/design/:fileKey/...?node-id=1-2)."
        ),
      locator: z
        .string()
        .optional()
        .describe(
          "Locator to screenshot a specific view instead of full screen. Omit for full screen."
        ),
      session: sessionSchema,
    },
    annotations: { readOnlyHint: true },
  },
  async ({ figmaNodeUrl, locator, session }) =>
    withToolLogging("compare_with_design", { figmaNodeUrl, locator, session }, async () => {
      try {
        const result = await compareWithDesign({ figmaNodeUrl, locator, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_invoke ────────────────────────────────────────────────────────────────

server.registerTool(
  "ui_invoke",
  {
    description:
      "Invoke ANY ObjC selector on a UI node at runtime — the highest-leverage tool. " +
      "Use for navigation (popViewControllerAnimated: true), layout (setNeedsLayout), " +
      "data refresh (reloadData), and any custom method on any object. " +
      "selector format: 'methodName' (no args) or 'method:withParam:' (one colon per arg). " +
      "args: pass one value per colon in the selector, in order. " +
      "Supported arg types: numbers ('42', '0.5'), bools ('true'/'false'), strings, " +
      "CGPoint ('{x,y}'), CGRect ('{{x,y},{w,h}}'), nil ('nil'). " +
      "Returns { target, selector, args, returnValue }.",
    inputSchema: {
      selector: z
        .string()
        .describe(
          "ObjC selector: 'setNeedsLayout', 'setAlpha:', 'scrollToRow:atScrollPosition:animated:'"
        ),
      target: z
        .string()
        .describe("Plain locator string: visible text, accessibility identifier, class name, or numeric oid."),
      args: z
        .array(z.string())
        .optional()
        .describe("Argument values in order. One per colon in the selector."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
    annotations: { destructiveHint: false },
  },
  async ({ selector, target, args, session }) =>
    withToolLogging("ui_invoke", { selector, target, args, session }, async () => {
      try {
        const result = await uiInvoke({ selector, target, args, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_wait ──────────────────────────────────────────────────────────────────

server.registerTool(
  "ui_wait",
  {
    description:
      "Poll until a UI condition is met or timeout elapses. " +
      "Three modes: " +
      "  'appears' — wait until locator matches ≥1 visible node; " +
      "  'gone'    — wait until locator matches 0 nodes; " +
      "  'attr'    — wait until a node attribute equals/contains a value. " +
      "Returns { met, condition, elapsedSeconds, pollCount }. " +
      "Use after navigation, async data loads, or animations. " +
      "In gone mode, plain locators are treated as text/accessibility queries to avoid false negatives from stale class names; " +
      "use an explicit class locator such as .UILabel when waiting for a class to disappear. " +
      "If met:false (timeout), tool returns isError:true.",
    inputSchema: {
      mode: z.enum(["appears", "gone", "attr"]).describe("Wait mode."),
      locator: z
        .string()
        .describe("Locator string: visible text, accessibility identifier, explicit class locator such as .UILabel, or numeric oid."),
      key: z
        .string()
        .optional()
        .describe("Attribute key for attr mode (e.g. 'text', 'hidden')."),
      equals: z
        .string()
        .optional()
        .describe("Pass when attribute value exactly equals this (attr mode, case-sensitive)."),
      contains: z
        .string()
        .optional()
        .describe("Pass when attribute value contains this substring (attr mode, case-insensitive)."),
      timeout: z.number().positive().optional().describe("Max seconds to wait (default 10)."),
      intervalMs: z.number().int().positive().optional().describe("Poll interval in ms (default 500)."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ mode, locator, key, equals, contains, timeout, intervalMs, session }) =>
    withToolLogging("ui_wait", { mode, locator, key, equals, contains, timeout, intervalMs, session }, async () => {
      try {
        let input: Parameters<typeof uiWait>[0];
        if (mode === "attr") {
          if (!key) {
            return { isError: true, content: [{ type: "text", text: "ui_wait attr mode requires 'key'" }] };
          }
          input = { mode: "attr", locator, key, equals, contains, timeout, intervalMs, session };
        } else {
          input = { mode, locator, timeout, intervalMs, session };
        }
        const result = await uiWait(input);
        if (!result.met) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ...result,
                  hint: `Condition '${result.condition}' not met after ${
                    typeof result.elapsedSeconds === "number" ? result.elapsedSeconds.toFixed(1) : "unknown"
                  }s (${typeof result.pollCount === "number" ? result.pollCount : "unknown"} polls). Check locator or increase timeout.`,
                }, null, 2),
              },
            ],
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_assert ────────────────────────────────────────────────────────────────

server.registerTool(
  "ui_assert",
  {
    description:
      "Assert a UI condition — use to verify app state in agent workflows. " +
      "Returns { passed, message } on success. Returns isError:true with details on failure. " +
      "Four modes: " +
      "  'visible' — assert ≥1 node matches and is visible; " +
      "  'text'    — assert node display text equals/contains expected value; " +
      "  'count'   — assert match count equals/min/max; " +
      "  'attr'    — assert node attribute equals/contains expected value.",
    inputSchema: {
      mode: z.enum(["visible", "text", "count", "attr"]).describe("Assert mode."),
      locator: z.string().describe("Plain locator string: visible text, accessibility identifier, class name, or numeric oid."),
      expected: z
        .string()
        .optional()
        .describe("Expected text for 'text' mode."),
      contains: z
        .boolean()
        .optional()
        .describe("For text mode: use substring match (case-insensitive) instead of exact equality."),
      count: z
        .number()
        .int()
        .optional()
        .describe("Exact expected count for 'count' mode."),
      min: z.number().int().optional().describe("Min count for 'count' mode."),
      max: z.number().int().optional().describe("Max count for 'count' mode."),
      key: z.string().optional().describe("Attribute key for 'attr' mode."),
      attrEquals: z.string().optional().describe("Expected attribute value (exact) for 'attr' mode."),
      attrContains: z.string().optional().describe("Expected attribute substring for 'attr' mode."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ mode, locator, expected, contains, count, min, max, key, attrEquals, attrContains, session }) =>
    withToolLogging("ui_assert", { mode, locator, expected, contains, count, min, max, key, attrEquals, attrContains, session }, async () => {
      try {
        let input: Parameters<typeof uiAssert>[0];
        if (mode === "visible") {
          input = { mode: "visible", locator, session };
        } else if (mode === "text") {
          if (!expected) {
            return { isError: true, content: [{ type: "text", text: "ui_assert text mode requires 'expected'" }] };
          }
          input = { mode: "text", locator, expected, contains: contains ?? false, session };
        } else if (mode === "count") {
          input = { mode: "count", locator, expected: count, min, max, session };
        } else {
          if (!key) {
            return { isError: true, content: [{ type: "text", text: "ui_assert attr mode requires 'key'" }] };
          }
          input = { mode: "attr", locator, key, equals: attrEquals, contains: attrContains, session };
        }
        const result = await uiAssert(input);
        if (!result.passed) {
          return { isError: true, content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_connect ───────────────────────────────────────────────────────────────

server.registerTool(
  "ui_connect",
  {
    description:
      "Connect to a specific iOS app by bundle ID. " +
      "This is the preferred explicit first step when the project bundle ID is known — infer the bundle ID from the project files " +
      "(Info.plist, .xcodeproj, or Package.swift) and call this directly. " +
      "Partial bundle ID is supported (e.g. 'ExampleApp' matches 'com.example.app'). " +
      "Returns a session string (bundleId@port) — pass it to all other Viewglass tools. " +
      "If multiple sessions match the same bundle ID, ViewglassMCP does not guess. " +
      "Pass session, port, deviceIdentifier, deviceName, or deviceType; " +
      "or set those under sessionDefaults in .viewglassmcp/config.yaml. " +
      "A successful connection exclusively leases the whole device to this MCP agent. If another agent owns it, " +
      "ui_connect returns an error with alternative simulator/device instances; choose one of those instead of retrying. " +
      "After a successful connection, ViewglassMCP persists the resolved bundle id plus target selectors into .viewglassmcp/config.yaml for future runs. " +
      "Once config.yaml has a bundleId, other Viewglass tools should usually omit session and let MCP resolve it automatically. " +
      "If the app is not found: ask the user to build and run it in Xcode (Debug scheme) and try again.",
    inputSchema: {
      bundleId: z
        .string()
        .describe(
          "Bundle ID or partial name of the target app (e.g. 'com.myapp.Foo' or 'Foo')."
        ),
      session: z
        .string()
        .optional()
        .describe("Exact session in bundleId@port format. Strongest selector when known."),
      port: z
        .number()
        .int()
        .optional()
        .describe("Exact Viewglass server port. Useful when multiple simulators run the same bundle."),
      deviceType: z
        .enum(["device", "simulator"])
        .optional()
        .describe(
          "Optional strict target type. Use with another selector if multiple simulators or devices run the same bundle."
        ),
      deviceName: z
        .string()
        .optional()
        .describe("Exact simulator/device display name from ui_scan or apps list."),
      deviceIdentifier: z
        .string()
        .optional()
        .describe("Exact simulator/device identifier (UDID) from ui_scan or apps list."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ bundleId, session, port, deviceType, deviceName, deviceIdentifier }) =>
    withToolLogging("ui_connect", { bundleId, session, port, deviceType, deviceName, deviceIdentifier }, async () => {
      try {
        const result = await uiConnect({ bundleId, session, port, deviceType, deviceName, deviceIdentifier });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_screenshot ────────────────────────────────────────────────────────────

server.registerTool(
  "ui_screenshot",
  {
    description:
      "Capture a screenshot of the running app as a PNG image. " +
      "Returns the saved path plus image metadata such as width and height. " +
      "Use ONLY for visual confirmation (e.g. verifying a UI change looks correct) " +
      "or side-by-side design comparison with compare_with_design. " +
      "Do NOT use this to find or inspect elements — screenshots have no OIDs and cannot " +
      "be used with other tools. Use ui_snapshot to get the element tree instead. " +
      "Without locator: captures the full screen. " +
      "With locator: captures only the specified node (crop). " +
      "The result includes captureProvider and qualityWarnings when the underlying CLI can detect screenshot fallback or suspicious black/empty output.",
    inputSchema: {
      locator: z
        .string()
        .optional()
        .describe("Capture a specific node instead of full screen using one plain locator string."),
      outputPath: z
        .string()
        .optional()
        .describe("Output file path (must end in .png). Defaults to a temp file."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ locator, outputPath, session }) =>
    withToolLogging("ui_screenshot", { locator, outputPath, session }, async () => {
      try {
        const result = await uiScreenshot({ locator, outputPath, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_input ─────────────────────────────────────────────────────────────────

server.registerTool(
  "ui_input",
  {
    description:
      "Enter text into a UITextField or UITextView. Prefer locator for replay; oid is only a volatile last-known runtime handle. " +
      "Dispatches text semantically via the field's input mechanism. " +
      "Returns an execution summary only. " +
      "Use ui_tap first to focus the field if needed.",
    inputSchema: {
      locator: z.string().optional().describe("Stable locator such as #accessibilityIdentifier, visible text, class name, or query expression. Preferred."),
      oid: z.coerce.string().optional().describe("Runtime OID from ui_snapshot. Volatile; use only as last-known handle or cache hint."),
      text: z.string().describe("Text to type into the field."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
  },
  async ({ locator, oid, text, session }) =>
    withToolLogging("ui_input", { locator, oid, text, session }, async () => {
      try {
        if (!locator && !oid) {
          return { isError: true, content: [{ type: "text", text: "ui_input requires either 'locator' or 'oid'" }] };
        }
        const result = await uiInput({ locator, oid, text, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_swipe ─────────────────────────────────────────────────────────────────

server.registerTool(
  "ui_swipe",
  {
    description:
      "Perform a swipe gesture on a UI node. UIScrollView targets use scroll semantics; non-scrollable pan targets use coordinate semantic swipe. " +
      "Use ui_scroll for normal page scrolling because it resolves wrappers/cells to the real scroll container first. " +
      "Use ui_swipe directly for paging scroll views, carousels, and gesture-driven interactions. " +
      "distance defaults to 200 pts if omitted.",
    inputSchema: {
      target: z.string().describe("Plain locator string: visible text, accessibility identifier, class name, or numeric oid."),
      direction: z.enum(["up", "down", "left", "right"]).describe("Swipe direction."),
      distance: z.number().positive().optional().describe("Swipe distance in pts (default 200)."),
      animated: z.boolean().optional().describe("Animate with ease-in-out (default false)."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
  },
  async ({ target, direction, distance, animated, session }) =>
    withToolLogging("ui_swipe", { target, direction, distance, animated, session }, async () => {
      try {
        const result = await uiSwipe({ target, direction, distance, animated, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_long_press ────────────────────────────────────────────────────────────

server.registerTool(
  "ui_long_press",
  {
    description:
      "Trigger a semantic long press on a UI node. " +
      "Fires the long press gesture recognizer attached to the element. " +
      "Use for context menus, preview interactions, and custom long-press handlers. " +
      "Pass one plain locator string only: visible text, accessibility identifier, class name, or numeric oid. " +
      "Returns { target, ok: true }.",
    inputSchema: {
      target: z.string().describe("Plain locator string: visible text, accessibility identifier, class name, or numeric oid."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
  },
  async ({ target, session }) =>
    withToolLogging("ui_long_press", { target, session }, async () => {
      try {
        const result = await uiLongPress({ target, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── ui_dismiss ───────────────────────────────────────────────────────────────

server.registerTool(
  "ui_dismiss",
  {
    description:
      "Dismiss a UIViewController (modal dismiss or navigation pop). Prefer locator for replay; oid is only a volatile last-known runtime handle. " +
      "The target can be any view or node hosted by the controller. " +
      "Returns { oid, ok: true }. " +
      "Prefer this over ui_invoke popViewControllerAnimated: for standard navigation.",
    inputSchema: {
      locator: z.string().optional().describe("Stable locator such as #accessibilityIdentifier, visible text, class name, or query expression. Preferred."),
      oid: z.coerce.string().optional().describe("Runtime OID from ui_snapshot. Can be a view or view controller. Volatile; use only as last-known handle."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
  },
  async ({ locator, oid, session }) =>
    withToolLogging("ui_dismiss", { locator, oid, session }, async () => {
      try {
        if (!locator && !oid) {
          return { isError: true, content: [{ type: "text", text: "ui_dismiss requires either 'locator' or 'oid'" }] };
        }
        const result = await uiDismiss({ locator, oid, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── Start ───────────────────────────────────────────────────────────────────

return server;
}

export async function startServer() {
  autoBootstrapForMcpStartup();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
