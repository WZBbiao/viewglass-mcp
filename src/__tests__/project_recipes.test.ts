import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectRecipes, matchProjectRecipes, parseRecipesYaml } from "../project_recipes.js";
import type { UISnapshotOutput } from "../tools/ui_snapshot.js";

function makeSnapshot(): UISnapshotOutput {
  return {
    app: {
      appName: "Example App",
      bundleIdentifier: "com.example.app",
      deviceType: "device",
      deviceName: "iPhone",
      session: "com.example.app@47175",
      serverVersion: "0.1.0",
    },
    snapshot: {
      snapshotId: "snap-1",
      fetchedAt: new Date().toISOString(),
      screenScale: 3,
      screenSize: { x: 0, y: 0, width: 390, height: 844 },
    },
    summary: {
      visibleText: ["Games", "Charts", "Me", "Settings"],
      interactiveNodeCount: 2,
      controllerHints: ["TapTap.TapTabBarController"],
      bottomBarCandidates: [],
      groupCount: 1,
    },
    groups: [
      {
        id: "group_bottom_1",
        role: "bottomNavigation",
        containerClassName: "_UITabBar",
        frame: { x: 0, y: 761, width: 390, height: 83 },
        itemOids: [210, 220, 230],
        itemLabels: ["Games", "Charts", "Me"],
        items: [
          { oid: 210, label: "Games", frame: { x: 20, y: 770, width: 80, height: 58 }, selected: false },
          { oid: 220, label: "Charts", frame: { x: 150, y: 770, width: 80, height: 58 }, selected: false },
          { oid: 230, label: "Me", frame: { x: 280, y: 770, width: 80, height: 58 }, selected: true, selectedReason: "selected wrapper" },
        ],
        selectedOid: 230,
        selectedReason: "selected wrapper",
      },
    ],
    matchedRecipes: [],
    nodes: [
      {
        id: "node_210",
        oid: 211,
        primaryOid: 211,
        className: "UILabel",
        frame: { x: 37, y: 805, width: 20, height: 12 },
        controllerClass: "TapTap.TapTabBarController",
        text: "Games",
        searchableText: ["Games"],
        visible: true,
        interactive: true,
        actions: ["tap"],
        role: "switcherItem",
        actionTargetOid: 210,
        groupId: "group_bottom_1",
      },
      {
        id: "node_220",
        oid: 221,
        primaryOid: 221,
        className: "UILabel",
        frame: { x: 172, y: 805, width: 30, height: 12 },
        controllerClass: "TapTap.TapTabBarController",
        text: "Charts",
        searchableText: ["Charts"],
        visible: true,
        interactive: true,
        actions: ["tap"],
        role: "switcherItem",
        actionTargetOid: 220,
        groupId: "group_bottom_1",
      },
      {
        id: "node_230",
        oid: 232,
        primaryOid: 232,
        className: "UILabel",
        frame: { x: 300, y: 805, width: 20, height: 12 },
        controllerClass: "TapTap.TapTabBarController",
        text: "Me",
        searchableText: ["Me"],
        visible: true,
        interactive: true,
        actions: ["tap"],
        role: "switcherItem",
        actionTargetOid: 230,
        groupId: "group_bottom_1",
      },
      {
        id: "node_988",
        oid: 988,
        primaryOid: 988,
        className: "UIImageView",
        frame: { x: 330, y: 50, width: 24, height: 24 },
        controllerClass: "TapTap.UserNavigationController",
        searchableText: [],
        visible: true,
        interactive: true,
        actions: ["tap"],
        role: "image",
        actionTargetOid: 988,
      },
    ],
  };
}

const sampleRecipes = `version: 1

recipes:
  - id: "switch_to_me"
    description: "Switch to the Me tab and open settings."
    screen:
      controllerHints:
        - "TapTap.TapTabBarController"
      visibleTextAny:
        - "Games"
        - "Charts"
        - "Me"
    steps:
      - tool: "ui_tap"
        role: "groupItem"
        groupRole: "bottomNavigation"
        searchableTextAny:
          - "Me"
      - tool: "ui_tap"
        role: "image"
        classHints:
          - "UIImageView"
        areaHint: "topRight"
    success:
      controllerHints:
        - "TapTap.UserNavigationController"
`;

afterEach(() => {
  delete process.env.PWD;
});

describe("project recipes", () => {
  it("parses generated recipe yaml", () => {
    const recipes = parseRecipesYaml(sampleRecipes);
    expect(recipes).toHaveLength(1);
    expect(recipes[0]?.id).toBe("switch_to_me");
    expect(recipes[0]?.steps?.[0]?.searchableTextAny).toEqual(["Me"]);
  });

  it("loads project recipes from .viewglassmcp", () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-recipes-"));
    fs.mkdirSync(path.join(project, ".git"));
    fs.mkdirSync(path.join(project, ".viewglassmcp"));
    fs.writeFileSync(path.join(project, ".viewglassmcp", "recipes.yaml"), sampleRecipes, "utf8");
    process.chdir(project);
    process.env.PWD = project;

    const recipes = loadProjectRecipes();
    expect(recipes).toHaveLength(1);
    expect(recipes[0]?.id).toBe("switch_to_me");
  });

  it("matches recipes to current snapshot and resolves recommended oids", () => {
    const matches = matchProjectRecipes(makeSnapshot(), parseRecipesYaml(sampleRecipes));
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe("switch_to_me");
    expect(matches[0]?.suggestedSteps[0]?.recommendedOid).toBe(230);
    expect(matches[0]?.suggestedSteps[1]?.recommendedOid).toBe(988);
  });
});
