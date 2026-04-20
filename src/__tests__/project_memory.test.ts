import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { noteSuccessfulTool, resetProjectMemoryState } from "../project_memory.js";
import type { UISnapshotOutput } from "../tools/ui_snapshot.js";

function makeSnapshot(session = "com.example.app@47175"): UISnapshotOutput {
  return {
    app: {
      appName: "Example App",
      bundleIdentifier: "com.example.app",
      deviceType: "device",
      deviceName: "iPhone",
      session,
      serverVersion: "0.1.0",
    },
    snapshot: {
      snapshotId: "snap-1",
      fetchedAt: new Date().toISOString(),
      screenScale: 3,
      screenSize: { x: 0, y: 0, width: 390, height: 844 },
    },
    summary: {
      visibleText: ["Home", "Profile"],
      interactiveNodeCount: 2,
      controllerHints: ["HomeViewController"],
      bottomBarCandidates: [],
      groupCount: 0,
    },
    groups: [],
    nodes: [
      {
        id: "node-1",
        oid: 101,
        primaryOid: 101,
        className: "UIButton",
        frame: { x: 300, y: 40, width: 44, height: 44 },
        controllerClass: "HomeViewController",
        text: "Settings",
        searchableText: ["Settings"],
        accessibilityIdentifier: "settings_button",
        visible: true,
        interactive: true,
        actions: ["tap"],
        role: "button",
        actionTargetOid: 101,
      },
      {
        id: "node-2",
        oid: 102,
        primaryOid: 102,
        className: "UITextField",
        frame: { x: 24, y: 120, width: 240, height: 44 },
        controllerClass: "HomeViewController",
        text: "Email",
        searchableText: ["Email"],
        accessibilityIdentifier: "email_field",
        visible: true,
        interactive: true,
        actions: ["input"],
        role: "textField",
        actionTargetOid: 102,
      },
    ],
  };
}

afterEach(() => {
  resetProjectMemoryState();
  delete process.env.PWD;
});

describe("project memory auto persistence", () => {
  it("auto-persists bundleId from a single-session ui_scan result", () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-scan-"));
    fs.mkdirSync(path.join(project, ".git"));
    process.chdir(project);
    process.env.PWD = project;

    noteSuccessfulTool("ui_scan", {}, {
      sessions: [{ bundleId: "com.example.app", port: 47175, session: "com.example.app@47175" }],
      message: "ok",
    });

    const configPath = path.join(project, ".viewglassmcp", "config.yaml");
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(configPath, "utf8")).toContain('bundleId: "com.example.app"');
  });

  it("auto-appends a recipe draft after a successful flow confirmation", () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-recipe-"));
    fs.mkdirSync(path.join(project, ".git"));
    process.chdir(project);
    process.env.PWD = project;

    noteSuccessfulTool("ui_snapshot", {}, makeSnapshot());
    noteSuccessfulTool("ui_tap", { oid: "101", session: "com.example.app@47175" }, { ok: true, oid: "101" });
    noteSuccessfulTool("ui_input", { oid: "102", text: "secret@example.com", session: "com.example.app@47175" }, { ok: true, oid: "102", text: "secret@example.com" });
    noteSuccessfulTool("ui_wait", { mode: "appears", locator: "Profile", session: "com.example.app@47175" }, { met: true, condition: "appears:Profile", elapsedSeconds: 0.1, pollCount: 1 });

    const recipesPath = path.join(project, ".viewglassmcp", "recipes.yaml");
    const content = fs.readFileSync(recipesPath, "utf8");
    expect(content).toContain("Auto-captured successful flow draft");
    expect(content).toContain("searchableTextAny:");
    expect(content).toContain("Settings");
    expect(content).toContain("input: \"<runtime-input>\"");
    expect(content).not.toContain("secret@example.com");
  });
});
