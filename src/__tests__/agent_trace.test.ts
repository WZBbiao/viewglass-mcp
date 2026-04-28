import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logAgentTrace, summarizeAgentToolResponse } from "../log.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("agent trace", () => {
  it("writes JSONL when VIEWGLASS_MCP_AGENT_TRACE is enabled", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-agent-trace-"));
    const file = path.join(dir, "trace.jsonl");
    vi.stubEnv("VIEWGLASS_MCP_AGENT_TRACE", "1");
    vi.stubEnv("VIEWGLASS_MCP_AGENT_TRACE_FILE", file);

    logAgentTrace({
      event: "tool:end",
      traceId: "trace-1",
      tool: "ui_tap",
      session: "com.test@1234",
      durationMs: 12,
      isError: false,
      response: { ok: true },
    });

    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(event.event).toBe("tool:end");
    expect(event.tool).toBe("ui_tap");
    expect(event.session).toBe("com.test@1234");
    expect(event.pid).toBe(process.pid);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("summarizes ui_screenshot dimensions", () => {
    const summary = summarizeAgentToolResponse("ui_screenshot", {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            path: "/tmp/screen.png",
            width: 1170,
            height: 2532,
            dataSize: 42536,
            screenshotType: "screen",
            captureProvider: "server",
            qualityWarnings: ["mostlyBlack"],
            blackPixelRatio: 0.99,
            nonBlackPixelRatio: 0.01,
          }),
        },
      ],
    });

    expect(summary.parsed).toEqual({
      path: "/tmp/screen.png",
      locator: undefined,
      width: 1170,
      height: 2532,
      dataSize: 42536,
      screenshotType: "screen",
      captureProvider: "server",
      fallbackReason: undefined,
      qualityWarnings: ["mostlyBlack"],
      blackPixelRatio: 0.99,
      nonBlackPixelRatio: 0.01,
    });
  });

  it("compresses ui_snapshot nodes for agent review", () => {
    const nodes = Array.from({ length: 35 }, (_, index) => ({
      oid: index + 1,
      className: "UILabel",
      role: "text",
      searchableText: [`text-${index + 1}`],
      actionTargetOid: index + 1,
      frame: { x: 0, y: index, width: 100, height: 20 },
      visible: true,
      interactive: false,
    }));
    const summary = summarizeAgentToolResponse("ui_snapshot", {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            app: { bundleIdentifier: "com.test" },
            snapshot: { snapshotId: "snapshot-1", returnedNodeCount: 35 },
            summary: {
              visibleText: ["设置"],
              controllerHints: ["SettingsBaseViewController"],
              navigationCandidates: [{ oid: 1, label: "设置", areaHint: "topRight" }],
            },
            groups: [{ id: "bottom-1", role: "bottomNavigation", itemLabels: ["首页", "我的"] }],
            nodes,
            matchedRecipes: [],
          }),
        },
      ],
    });

    const parsed = summary.parsed as { nodes: unknown[]; nodesOmitted: number; summary: unknown };
    expect(parsed.nodes).toHaveLength(20);
    expect(parsed.nodesOmitted).toBe(15);
    expect(parsed.summary).toMatchObject({
      visibleText: ["设置"],
      controllerHints: ["SettingsBaseViewController"],
    });
  });
});
