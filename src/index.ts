#!/usr/bin/env node
/**
 * Viewglass MCP Server
 *
 * Exposes 16 tools for AI agents to inspect and interact with iOS app UI at runtime:
 *   Read:        ui_scan, ui_snapshot, ui_attr_get
 *   Write:       ui_set_attr, ui_invoke
 *   Interact:    ui_tap, ui_scroll, ui_swipe, ui_long_press, ui_input, ui_dismiss
 *   Assert/Wait: ui_assert, ui_wait
 *   Visual:      ui_screenshot, compare_with_design
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
import { uiScan } from "./tools/ui_scan.js";
import { uiConnect } from "./tools/ui_connect.js";
import { uiScreenshot } from "./tools/ui_screenshot.js";
import { uiInput } from "./tools/ui_input.js";
import { uiSwipe } from "./tools/ui_swipe.js";
import { uiLongPress } from "./tools/ui_long_press.js";
import { uiDismiss } from "./tools/ui_dismiss.js";
import { logToolFinish, logToolStart, logToolThrow, safeStringify } from "./log.js";

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
  const startedAt = Date.now();
  const session =
    "session" in args && typeof (args as { session?: unknown }).session === "string"
      ? ((args as { session?: string }).session ?? undefined)
      : undefined;
  logToolStart(name, args);
  try {
    const result = await run();
    logToolFinish(name, summarizeToolResponse(result), Date.now() - startedAt, session);
    return result;
  } catch (error: unknown) {
    logToolThrow(name, error, Date.now() - startedAt, session);
    throw error;
  }
}

// ─── ui_snapshot ────────────────────────────────────────────────────────────

server.registerTool(
  "ui_snapshot",
  {
    description:
      "Capture the current UI as an agent-first snapshot. " +
      "The result includes app/session metadata, a summary, inferred switcher/navigation groups, " +
      "and a flattened node index with searchableText and actionTargetOid fields so agents can " +
      "find targets without guessing UIKit class names. " +
      "Best practice: for any navigation or custom UI task, call ui_snapshot first to understand the current page, " +
      "then use ui_tap with a concrete visible label or oid from the snapshot. " +
      "Use filter to narrow to a specific class or locator. Set compact=false only when you also need rawTree.",
    inputSchema: {
      session: sessionSchema,
      filter: z
        .string()
        .optional()
        .describe("Only return nodes of this UIKit class name (e.g. UILabel)."),
      compact: z
        .boolean()
        .optional()
        .describe(
          "Default: true. Returns agent-first summary/groups/nodes only. Set false to also include rawTree."
        ),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session, filter, compact }) =>
    withToolLogging("ui_snapshot", { session, filter, compact }, async () => {
      try {
        const result = await uiSnapshot({ session, filter, compact });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
      "Get one or more runtime attributes of a UI node by OID. " +
      "Returns a map of { attrKey: value }. Use ui_snapshot to get the OID first. " +
      "Common keys: frame, backgroundColor, alpha, hidden, text, font, " +
      "contentMode, accessibilityIdentifier, accessibilityLabel, cornerRadius.",
    inputSchema: {
      oid: z.coerce.string().describe("Node OID from ui_snapshot (number or string)."),
      attrs: z
        .array(z.string())
        .min(1)
        .optional()
        .describe('Attribute keys to fetch (e.g. ["frame", "backgroundColor"]). Omit to get all attributes.'),
      session: sessionSchema,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ oid, attrs, session }) =>
    withToolLogging("ui_attr_get", { oid, attrs, session }, async () => {
      try {
        const result = await uiAttrGet({ oid, attrs, session });
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
      "Tap a UI element by oid only. " +
      "First call ui_snapshot, inspect groups/nodes, then pass the exact oid here. " +
      "Supports semantic taps on UIControl, UITapGestureRecognizer-backed views, " +
      "UITableViewCell, and UICollectionViewCell, including nested labels inside a cell. " +
      "Returns { ok, oid }.",
    inputSchema: {
      oid: z
        .coerce
        .string()
        .describe("Executable node oid from ui_snapshot."),
      session: sessionSchema,
    },
  },
  async ({ oid, session }) =>
    withToolLogging("ui_tap", { oid, session }, async () => {
      try {
        const result = await uiTap({ oid, session });
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
      "Scroll a UIScrollView, UITableView, or UICollectionView by oid only. " +
      "First call ui_snapshot, inspect groups/nodes, then pass the exact oid here. " +
      "Returns an execution summary only. " +
      "Use direction 'down' to reveal content below the fold, 'up' to scroll back. " +
      "distance defaults to 300 pts if omitted.",
    inputSchema: {
      oid: z.coerce.string().describe("Executable node oid from ui_snapshot."),
      direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction."),
      distance: z.number().positive().optional().describe("Distance in pts (default 300)."),
      animated: z.boolean().optional().describe("Whether to animate (default true)."),
      session: sessionSchema,
    },
  },
  async ({ oid, direction, distance, animated, session }) =>
    withToolLogging("ui_scroll", { oid, direction, distance, animated, session }, async () => {
      try {
        const result = await uiScroll({ oid, direction, distance, animated, session });
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
      "Accepts either a node OID or one plain locator string; prefer the plain locator in agent workflows. " +
      "Navigation patterns (get controller OID from ui_snapshot, then use viewglass invoke): " +
      "  pop: invoke <navController-oid> popViewControllerAnimated: true — " +
      "  dismiss modal: invoke <vc-oid> dismissViewControllerAnimated:completion: true nil",
    inputSchema: {
      oid: z.coerce.string().optional().describe("Node OID from ui_snapshot (number or string)."),
      locator: z.string().optional().describe("Plain locator string to resolve at execution time (preferred)."),
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
      "If met:false (timeout), tool returns isError:true.",
    inputSchema: {
      mode: z.enum(["appears", "gone", "attr"]).describe("Wait mode."),
      locator: z
        .string()
        .describe("Plain locator string: visible text, accessibility identifier, class name, or numeric oid."),
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

// ─── ui_scan ─────────────────────────────────────────────────────────────────

server.registerTool(
  "ui_scan",
  {
    description:
      "Scan for all running iOS apps with ViewglassServer integrated. " +
      "Use this when you don't know the target app's bundle ID, or when ui_connect fails. " +
      "If you already know the bundle ID, prefer ui_connect directly — it's faster. " +
      "If sessions are found: check that the bundleId matches the app you intend to inspect. " +
      "If the session does not match, call ui_connect with the target bundleId to switch apps. " +
      "Never give up just because the session bundleId is different from the target app. " +
      "If sessions is empty: the result includes a complete setupGuide — " +
      "read it and help the user add ViewglassServer to their iOS project " +
      "(SPM or CocoaPods, Debug only), then ask them to build & run the app " +
      "and call ui_scan again to verify.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () =>
    withToolLogging("ui_scan", {}, async () => {
      try {
        const result = await uiScan();
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
      "This is the preferred first step — infer the bundle ID from the project files " +
      "(Info.plist, .xcodeproj, or Package.swift) and call this directly instead of ui_scan. " +
      "Partial bundle ID is supported (e.g. 'ViewglassDemo' matches 'com.wzb.ViewglassDemo'). " +
      "Returns a session string (bundleId@port) — pass it to all other Viewglass tools. " +
      "If the app is not found: ask the user to build and run it in Xcode (Debug scheme) and try again. " +
      "Fall back to ui_scan only if the bundle ID cannot be determined from the project.",
    inputSchema: {
      bundleId: z
        .string()
        .describe(
          "Bundle ID or partial name of the target app (e.g. 'com.myapp.Foo' or 'Foo')."
        ),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ bundleId }) =>
    withToolLogging("ui_connect", { bundleId }, async () => {
      try {
        const result = await uiConnect({ bundleId });
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
      "Use ONLY for visual confirmation (e.g. verifying a UI change looks correct) " +
      "or side-by-side design comparison with compare_with_design. " +
      "Do NOT use this to find or inspect elements — screenshots have no OIDs and cannot " +
      "be used with other tools. Use ui_snapshot to get the element tree instead. " +
      "Without locator: captures the full screen. " +
      "With locator: captures only the specified node (crop).",
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
      "Enter text into a UITextField or UITextView by oid only. " +
      "Dispatches text semantically via the field's input mechanism. " +
      "First call ui_snapshot, inspect groups/nodes, then pass the exact oid here. " +
      "Returns an execution summary only. " +
      "Use ui_tap first to focus the field if needed.",
    inputSchema: {
      oid: z.coerce.string().describe("Executable node oid from ui_snapshot."),
      text: z.string().describe("Text to type into the field."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
  },
  async ({ oid, text, session }) =>
    withToolLogging("ui_input", { oid, text, session }, async () => {
      try {
        const result = await uiInput({ oid, text, session });
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
      "Perform a swipe gesture on a UIScrollView. " +
      "Unlike ui_scroll (contentOffset manipulation), ui_swipe fires a real gesture — " +
      "use it for paging scroll views, carousels, and gesture-driven interactions. " +
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
      "Dismiss a UIViewController (modal dismiss or navigation pop) by oid only. " +
      "First call ui_snapshot, inspect groups/nodes, then pass the exact oid here. " +
      "The target can be any view or node hosted by the controller. " +
      "Returns { oid, ok: true }. " +
      "Prefer this over ui_invoke popViewControllerAnimated: for standard navigation.",
    inputSchema: {
      oid: z.coerce.string().describe("Executable node oid from ui_snapshot. Can be a view or view controller."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
  },
  async ({ oid, session }) =>
    withToolLogging("ui_dismiss", { oid, session }, async () => {
      try {
        const result = await uiDismiss({ oid, session });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    })
);

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
