#!/usr/bin/env node
/**
 * Viewglass MCP Server
 *
 * Exposes 16 tools for AI agents to inspect and interact with iOS app UI at runtime:
 *   Read:        ui_scan, ui_snapshot, ui_query, ui_attr_get
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
import { uiQuery } from "./tools/ui_query.js";
import { uiAttrGet } from "./tools/ui_attr_get.js";
import { uiTap } from "./tools/ui_tap.js";
import { uiScroll } from "./tools/ui_scroll.js";
import { uiSetAttr } from "./tools/ui_set_attr.js";
import { compareWithDesign } from "./tools/compare_with_design.js";
import { uiInvoke } from "./tools/ui_invoke.js";
import { uiWait } from "./tools/ui_wait.js";
import { uiAssert } from "./tools/ui_assert.js";
import { uiScan } from "./tools/ui_scan.js";
import { uiScreenshot } from "./tools/ui_screenshot.js";
import { uiInput } from "./tools/ui_input.js";
import { uiSwipe } from "./tools/ui_swipe.js";
import { uiLongPress } from "./tools/ui_long_press.js";
import { uiDismiss } from "./tools/ui_dismiss.js";

const server = new McpServer({
  name: "viewglass-mcp",
  version: "0.1.0",
});

const sessionSchema = z
  .string()
  .optional()
  .describe("Session in bundleId@port format. Auto-detected if omitted.");

// ─── ui_snapshot ────────────────────────────────────────────────────────────

server.registerTool(
  "ui_snapshot",
  {
    description:
      "Fast and cheap — capture the full UI node hierarchy of the running iOS app. " +
      "Returns a JSON tree of all windows, views, and nodes with className, frame, " +
      "accessibilityIdentifier, and child relationships. " +
      "Preferred over screenshot for finding elements and understanding layout. " +
      "Use filter to narrow to a specific UIKit class (e.g. UILabel, UIButton). " +
      "Do NOT take a screenshot to inspect UI structure — use this tool instead.",
    inputSchema: {
      session: sessionSchema,
      filter: z
        .string()
        .optional()
        .describe("Only return nodes of this UIKit class name (e.g. UILabel)."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session, filter }) => {
    try {
      const result = await uiSnapshot({ session, filter });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
);

// ─── ui_query ───────────────────────────────────────────────────────────────

server.registerTool(
  "ui_query",
  {
    description:
      "Find UI nodes matching a locator. Returns an array of matching nodes with oid, " +
      "className, frame, accessibilityIdentifier, and other properties. " +
      "Use the returned oid values with ui_attr_get, ui_set_attr, or for invoke calls. " +
      "Locator formats: '#accessibilityIdentifier', 'UIClassName', or numeric OID string. " +
      "Do NOT use screenshot to find elements — use this tool instead.",
    inputSchema: {
      locator: z
        .string()
        .describe(
          "Locator: '#accessibilityIdentifier', UIKit class name, or OID string."
        ),
      session: sessionSchema,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ locator, session }) => {
    try {
      const result = await uiQuery({ locator, session });
      if (result.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `ui_query: locator '${locator}' matched 0 nodes. ` +
                "Try a different accessibilityIdentifier, class name, or OID. " +
                "Call ui_snapshot to inspect the current hierarchy.",
            },
          ],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
);

// ─── ui_attr_get ─────────────────────────────────────────────────────────────

server.registerTool(
  "ui_attr_get",
  {
    description:
      "Get one or more runtime attributes of a UI node by OID. " +
      "Returns a map of { attrKey: value }. Use ui_query to get the OID first. " +
      "Common keys: frame, backgroundColor, alpha, hidden, text, font, " +
      "contentMode, accessibilityIdentifier, accessibilityLabel, cornerRadius.",
    inputSchema: {
      oid: z.coerce.string().describe("Node OID from ui_query (number or string)."),
      attrs: z
        .array(z.string())
        .min(1)
        .optional()
        .describe('Attribute keys to fetch (e.g. ["frame", "backgroundColor"]). Omit to get all attributes.'),
      session: sessionSchema,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ oid, attrs, session }) => {
    try {
      const result = await uiAttrGet({ oid, attrs, session });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
);

// ─── ui_tap ──────────────────────────────────────────────────────────────────

server.registerTool(
  "ui_tap",
  {
    description:
      "Tap a UI element. Locator must match exactly one visible node. " +
      "Automatically refreshes after tapping and returns the post-action hierarchy " +
      "so you can confirm navigation or state changes without a separate ui_snapshot call. " +
      "Returns { tapped: locator, hierarchy: <post-action snapshot> }.",
    inputSchema: {
      locator: z
        .string()
        .describe("Locator matching exactly one node: '#id', class name, or OID."),
      session: sessionSchema,
    },
  },
  async ({ locator, session }) => {
    try {
      const result = await uiTap({ locator, session });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
);

// ─── ui_scroll ───────────────────────────────────────────────────────────────

server.registerTool(
  "ui_scroll",
  {
    description:
      "Scroll a UIScrollView, UITableView, or UICollectionView. " +
      "Returns post-action hierarchy so you can verify newly visible content. " +
      "Use direction 'down' to reveal content below the fold, 'up' to scroll back. " +
      "distance defaults to 300 pts if omitted.",
    inputSchema: {
      locator: z
        .string()
        .describe("Locator for the scroll view: '#id', class name, or OID."),
      direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction."),
      distance: z.number().positive().optional().describe("Distance in pts (default 300)."),
      animated: z.boolean().optional().describe("Whether to animate (default true)."),
      session: sessionSchema,
    },
  },
  async ({ locator, direction, distance, animated, session }) => {
    try {
      const result = await uiScroll({ locator, direction, distance, animated, session });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
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
      "Requires node OID from ui_query. " +
      "Navigation patterns (get controller OID from ui_query, then use viewglass invoke): " +
      "  pop: invoke <navController-oid> popViewControllerAnimated: true — " +
      "  dismiss modal: invoke <vc-oid> dismissViewControllerAnimated:completion: true nil",
    inputSchema: {
      oid: z.coerce.string().describe("Node OID from ui_query (number or string)."),
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
  async ({ oid, attr, value, session }) => {
    try {
      const result = await uiSetAttr({ oid, attr, value, session });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
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
  async ({ figmaNodeUrl, locator, session }) => {
    try {
      const result = await compareWithDesign({ figmaNodeUrl, locator, session });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
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
        .describe("Locator: '#accessibilityIdentifier', class name, or OID."),
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
  async ({ selector, target, args, session }) => {
    try {
      const result = await uiInvoke({ selector, target, args, session });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
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
        .describe("Locator: '#accessibilityIdentifier', class name, OID, or query expression."),
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
  async ({ mode, locator, key, equals, contains, timeout, intervalMs, session }) => {
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
                hint: `Condition '${result.condition}' not met after ${result.elapsedSeconds.toFixed(1)}s (${result.pollCount} polls). Check locator or increase timeout.`,
              }, null, 2),
            },
          ],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
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
      locator: z.string().describe("Locator: '#accessibilityIdentifier', class name, OID, or query expression."),
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
  async ({ mode, locator, expected, contains, count, min, max, key, attrEquals, attrContains, session }) => {
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
  }
);

// ─── ui_scan ─────────────────────────────────────────────────────────────────

server.registerTool(
  "ui_scan",
  {
    description:
      "ALWAYS call this first before any other Viewglass tool. " +
      "Scans for running iOS apps with ViewglassServer integrated. " +
      "If sessions are found: pass the session string to other tools. " +
      "If sessions is empty: the result includes a complete setupGuide — " +
      "read it and help the user add ViewglassServer to their iOS project " +
      "(SPM or CocoaPods, Debug only), then ask them to build & run the app " +
      "and call ui_scan again to verify.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      const result = await uiScan();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
);

// ─── ui_screenshot ────────────────────────────────────────────────────────────

server.registerTool(
  "ui_screenshot",
  {
    description:
      "Capture a screenshot of the running app. " +
      "Without locator: captures the full screen. " +
      "With locator: captures only the specified node (crop). " +
      "Returns { path } with the absolute path to the saved PNG. " +
      "Use compare_with_design if you need a Figma side-by-side comparison.",
    inputSchema: {
      locator: z
        .string()
        .optional()
        .describe("Capture a specific node instead of full screen. '#id', class name, or OID."),
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
  async ({ locator, outputPath, session }) => {
    try {
      const result = await uiScreenshot({ locator, outputPath, session });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
);

// ─── ui_input ─────────────────────────────────────────────────────────────────

server.registerTool(
  "ui_input",
  {
    description:
      "Enter text into a UITextField or UITextView. " +
      "Dispatches text semantically via the field's input mechanism. " +
      "Returns { target, text, ok: true } on success. " +
      "Use ui_tap first to focus the field if needed.",
    inputSchema: {
      target: z.string().describe("Target locator: '#accessibilityIdentifier', class name, or OID."),
      text: z.string().describe("Text to type into the field."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
  },
  async ({ target, text, session }) => {
    try {
      const result = await uiInput({ target, text, session });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
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
      target: z.string().describe("Target locator: '#accessibilityIdentifier', class name, or OID."),
      direction: z.enum(["up", "down", "left", "right"]).describe("Swipe direction."),
      distance: z.number().positive().optional().describe("Swipe distance in pts (default 200)."),
      animated: z.boolean().optional().describe("Animate with ease-in-out (default false)."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
  },
  async ({ target, direction, distance, animated, session }) => {
    try {
      const result = await uiSwipe({ target, direction, distance, animated, session });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
);

// ─── ui_long_press ────────────────────────────────────────────────────────────

server.registerTool(
  "ui_long_press",
  {
    description:
      "Trigger a semantic long press on a UI node. " +
      "Fires the long press gesture recognizer attached to the element. " +
      "Use for context menus, preview interactions, and custom long-press handlers. " +
      "Returns { target, ok: true }.",
    inputSchema: {
      target: z.string().describe("Target locator: '#accessibilityIdentifier', class name, or OID."),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
  },
  async ({ target, session }) => {
    try {
      const result = await uiLongPress({ target, session });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
);

// ─── ui_dismiss ───────────────────────────────────────────────────────────────

server.registerTool(
  "ui_dismiss",
  {
    description:
      "Dismiss a UIViewController (modal dismiss or navigation pop). " +
      "Pass any view or node — Viewglass finds the hosting UIViewController automatically. " +
      "Returns { target, ok: true, hierarchy } with the post-action UI state so you " +
      "can confirm the screen changed without a separate ui_snapshot call. " +
      "Prefer this over ui_invoke popViewControllerAnimated: for standard navigation.",
    inputSchema: {
      target: z
        .string()
        .describe(
          "Target locator: '#accessibilityIdentifier', class name, or OID. Can be a view or view controller."
        ),
      session: z
        .string()
        .optional()
        .describe("Session in bundleId@port format. Auto-detected if omitted."),
    },
  },
  async ({ target, session }) => {
    try {
      const result = await uiDismiss({ target, session });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e) }] };
    }
  }
);

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
