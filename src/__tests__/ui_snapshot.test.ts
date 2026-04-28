import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { uiSnapshot } from "../tools/ui_snapshot.js";
import type { ExecFn } from "../runner.js";

const hierarchyFixture = {
  snapshotId: "snap-1",
  fetchedAt: "2026-04-14T12:00:00Z",
  screenScale: 3,
  screenSize: { x: 0, y: 0, width: 390, height: 844 },
  appInfo: {
    appName: "FixtureApp",
    bundleIdentifier: "com.test",
    deviceType: "simulator",
    deviceName: "iPhone 17",
    port: 47164,
    serverVersion: "0.1.0",
  },
  windows: [
    {
      node: {
        oid: 1,
        primaryOid: 1,
        oidType: "view",
        className: "UIWindow",
        frame: { x: 0, y: 0, width: 390, height: 844 },
        bounds: { x: 0, y: 0, width: 390, height: 844 },
        isHidden: false,
        alpha: 1,
        isUserInteractionEnabled: true,
        childrenOids: [10, 200],
        attributeGroups: [],
      },
      children: [
        {
          node: {
            oid: 10,
            primaryOid: 10,
            oidType: "view",
            className: "UIView",
            frame: { x: 0, y: 0, width: 390, height: 761 },
            bounds: { x: 0, y: 0, width: 390, height: 761 },
            isHidden: false,
            alpha: 1,
            isUserInteractionEnabled: true,
            childrenOids: [11],
            parentOid: 1,
            attributeGroups: [],
          },
          children: [
            {
              node: {
                oid: 11,
                primaryOid: 11,
                oidType: "view",
                className: "UILabel",
                frame: { x: 20, y: 60, width: 120, height: 28 },
                bounds: { x: 0, y: 0, width: 120, height: 28 },
                isHidden: false,
                alpha: 1,
                isUserInteractionEnabled: true,
                childrenOids: [],
                parentOid: 10,
                customDisplayTitle: "Agent Playground",
                attributeGroups: [
                  {
                    groupName: "viewglass_runtime",
                    attributes: [
                      {
                        displayName: "displayText",
                        value: { string: { _0: "Agent Playground" } },
                      },
                    ],
                  },
                ],
              },
              children: [],
            },
          ],
        },
        {
          node: {
            oid: 200,
            primaryOid: 200,
            oidType: "view",
            className: "ESTabBarController_swift.ESTabBar",
            frame: { x: 0, y: 761, width: 390, height: 83 },
            bounds: { x: 0, y: 0, width: 390, height: 83 },
            isHidden: false,
            alpha: 1,
            isUserInteractionEnabled: true,
            childrenOids: [210, 220],
            parentOid: 1,
            attributeGroups: [],
          },
          children: [
            {
              node: {
                oid: 210,
                primaryOid: 210,
                oidType: "view",
                className: "UIButton",
                frame: { x: 30, y: 9, width: 80, height: 58 },
                bounds: { x: 0, y: 0, width: 80, height: 58 },
                isHidden: false,
                alpha: 1,
                isUserInteractionEnabled: true,
                childrenOids: [211],
                parentOid: 200,
                attributeGroups: [],
              },
              children: [
                {
                  node: {
                    oid: 211,
                    primaryOid: 211,
                    oidType: "view",
                    className: "UILabel",
                    frame: { x: 7, y: 35, width: 20, height: 12 },
                    bounds: { x: 0, y: 0, width: 20, height: 12 },
                    isHidden: false,
                    alpha: 1,
                    isUserInteractionEnabled: true,
                    childrenOids: [],
                    parentOid: 210,
                    customDisplayTitle: "遊戲",
                    attributeGroups: [
                      {
                        groupName: "viewglass_runtime",
                        attributes: [
                          { displayName: "displayText", value: { string: { _0: "遊戲" } } },
                        ],
                      },
                    ],
                  },
                  children: [],
                },
              ],
            },
            {
              node: {
                oid: 220,
                primaryOid: 220,
                oidType: "view",
                className: "UIButton",
                frame: { x: 160, y: 9, width: 80, height: 58 },
                bounds: { x: 0, y: 0, width: 80, height: 58 },
                isHidden: false,
                alpha: 1,
                isUserInteractionEnabled: true,
                childrenOids: [221],
                parentOid: 200,
                attributeGroups: [],
              },
              children: [
                {
                  node: {
                    oid: 221,
                    primaryOid: 221,
                    oidType: "view",
                    className: "UILabel",
                    frame: { x: 12, y: 35, width: 30, height: 12 },
                    bounds: { x: 0, y: 0, width: 30, height: 12 },
                    isHidden: false,
                    alpha: 1,
                    isUserInteractionEnabled: true,
                    childrenOids: [],
                    parentOid: 220,
                    customDisplayTitle: "排行榜",
                    attributeGroups: [
                      {
                        groupName: "viewglass_runtime",
                        attributes: [
                          { displayName: "displayText", value: { string: { _0: "排行榜" } } },
                        ],
                      },
                    ],
                  },
                  children: [],
                },
              ],
            },
            {
              node: {
                oid: 230,
                primaryOid: 230,
                oidType: "view",
                className: "_UITabButton",
                frame: { x: 280, y: 9, width: 80, height: 58 },
                bounds: { x: 0, y: 0, width: 80, height: 58 },
                isHidden: false,
                alpha: 1,
                isUserInteractionEnabled: true,
                childrenOids: [231],
                parentOid: 200,
                attributeGroups: [],
              },
              children: [
                {
                  node: {
                    oid: 231,
                    primaryOid: 231,
                    oidType: "view",
                    className: "_UITabBarSelectedContentView",
                    frame: { x: 8, y: 12, width: 64, height: 34 },
                    bounds: { x: 0, y: 0, width: 64, height: 34 },
                    isHidden: false,
                    alpha: 1,
                    isUserInteractionEnabled: false,
                    childrenOids: [232],
                    parentOid: 230,
                    attributeGroups: [],
                  },
                  children: [
                    {
                      node: {
                        oid: 232,
                        primaryOid: 232,
                        oidType: "view",
                        className: "UILabel",
                        frame: { x: 12, y: 23, width: 20, height: 12 },
                        bounds: { x: 0, y: 0, width: 20, height: 12 },
                        isHidden: false,
                        alpha: 1,
                        isUserInteractionEnabled: true,
                        childrenOids: [],
                        parentOid: 231,
                        customDisplayTitle: "Me",
                        attributeGroups: [
                          {
                            groupName: "viewglass_runtime",
                            attributes: [
                              { displayName: "displayText", value: { string: { _0: "Me" } } },
                            ],
                          },
                        ],
                      },
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function makeNoisyHierarchy(): any {
  const hierarchy = JSON.parse(JSON.stringify(hierarchyFixture));
  const contentTree = hierarchy.windows[0].children[0];

  contentTree.node.childrenOids.push(50);
  contentTree.children.push({
    node: {
      oid: 50,
      primaryOid: 50,
      oidType: "view",
      className: "ProfileSettingsIconContainerView",
      frame: { x: 342, y: 52, width: 32, height: 32 },
      bounds: { x: 0, y: 0, width: 32, height: 32 },
      isHidden: false,
      alpha: 1,
      isUserInteractionEnabled: true,
      childrenOids: [],
      parentOid: 10,
      attributeGroups: [],
    },
    children: [],
  });

  for (let index = 0; index < 140; index += 1) {
    const oid = 1000 + index;
    contentTree.node.childrenOids.push(oid);
    contentTree.children.push({
      node: {
        oid,
        primaryOid: oid,
        oidType: "view",
        className: "UILabel",
        frame: { x: 20, y: 120 + index * 18, width: 180, height: 16 },
        bounds: { x: 0, y: 0, width: 180, height: 16 },
        isHidden: false,
        alpha: 1,
        isUserInteractionEnabled: true,
        childrenOids: [],
        parentOid: 10,
        customDisplayTitle: `Noise ${index}`,
        attributeGroups: [
          {
            groupName: "viewglass_runtime",
            attributes: [
              { displayName: "displayText", value: { string: { _0: `Noise ${index}` } } },
            ],
          },
        ],
      },
      children: [],
    });
  }

  return hierarchy;
}

function makeNestedActionHierarchy(): any {
  const hierarchy = JSON.parse(JSON.stringify(hierarchyFixture));
  const contentTree = hierarchy.windows[0].children[0];
  contentTree.node.childrenOids.push(300);
  contentTree.children.push({
    node: {
      oid: 300,
      primaryOid: 300,
      oidType: "view",
      className: "UIView",
      frame: { x: 40, y: 300, width: 180, height: 80 },
      bounds: { x: 0, y: 0, width: 180, height: 80 },
      isHidden: false,
      alpha: 1,
      isUserInteractionEnabled: true,
      childrenOids: [301],
      parentOid: 10,
      attributeGroups: [],
    },
    children: [
      {
        node: {
          oid: 301,
          primaryOid: 301,
          oidType: "view",
          className: "UIButton",
          frame: { x: 10, y: 20, width: 120, height: 44 },
          bounds: { x: 0, y: 0, width: 120, height: 44 },
          isHidden: false,
          alpha: 1,
          isUserInteractionEnabled: true,
          childrenOids: [],
          parentOid: 300,
          customDisplayTitle: "Create Post",
          attributeGroups: [],
        },
        children: [],
      },
    ],
  });

  return hierarchy;
}

function makeExec(stdout: string, error?: Error): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (error) throw error;
    if (args.includes("list")) return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    return { stdout, stderr: "" };
  });
}

afterEach(() => {
  delete process.env.PWD;
});

describe("uiSnapshot", () => {
  it("calls hierarchy --json with session", async () => {
    const exec = makeExec(JSON.stringify(hierarchyFixture)) as ReturnType<typeof vi.fn>;
    await uiSnapshot({ session: "com.test@1234" }, exec);
    const call = exec.mock.calls.find((c: unknown[]) => (c[1] as string[]).includes("hierarchy")) as [string, string[], unknown] | undefined;
    expect(call).toBeDefined();
    expect(call![1]).toContain("hierarchy");
    expect(call![1]).toContain("--json");
    expect(call![1]).toContain("--session");
    expect(call![1]).toContain("com.test@1234");
    expect(call![1]).not.toContain("--compact");
  });

  it("appends --filter when provided", async () => {
    const exec = makeExec(JSON.stringify(hierarchyFixture)) as ReturnType<typeof vi.fn>;
    await uiSnapshot({ session: "com.test@1234", filter: "UILabel" }, exec);
    const call = exec.mock.calls.find((c: unknown[]) => (c[1] as string[]).includes("hierarchy")) as [string, string[], unknown] | undefined;
    expect(call![1]).toContain("--filter");
    expect(call![1]).toContain("UILabel");
  });

  it("returns agent-first snapshot structure", async () => {
    const exec = makeExec(JSON.stringify(hierarchyFixture));
    const result = await uiSnapshot({ session: "com.test@1234" }, exec);

    expect(result.app.bundleIdentifier).toBe("com.test");
    expect(result.snapshot.snapshotId).toBe("snap-1");
    expect(result.summary.visibleText).toContain("遊戲");
    expect(result.summary.visibleText).toContain("排行榜");
    expect(result.summary.visibleText).toContain("Me");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.role).toBe("bottomNavigation");
    expect(result.groups[0]?.itemLabels).toEqual(["遊戲", "排行榜", "Me"]);
    expect(result.groups[0]?.items).toEqual([
      expect.objectContaining({ oid: 210, label: "遊戲", selected: false }),
      expect.objectContaining({ oid: 220, label: "排行榜", selected: false }),
      expect.objectContaining({ oid: 230, label: "Me", selected: true }),
    ]);
    expect(result.groups[0]?.selectedOid).toBe(230);

    const gameLabel = result.nodes.find((node) => node.oid === 211);
    expect(gameLabel?.text).toBe("遊戲");
    expect(gameLabel?.actionTargetOid).toBe(210);
    expect(gameLabel?.groupId).toBe("group_bottom_1");
    expect(gameLabel?.searchableText).toContain("遊戲");

    const meLabel = result.nodes.find((node) => node.oid === 232);
    expect(meLabel?.text).toBe("Me");
    expect(meLabel?.actionTargetOid).toBe(230);
    expect(meLabel?.groupId).toBe("group_bottom_1");
    expect(result.matchedRecipes).toEqual([]);
  });

  it("budgets compact nodes and surfaces unlabeled edge navigation candidates", async () => {
    const exec = makeExec(JSON.stringify(makeNoisyHierarchy()));
    const result = await uiSnapshot({ session: "com.test@1234" }, exec);

    expect(result.snapshot.totalNodeCount).toBeGreaterThan(80);
    expect(result.snapshot.returnedNodeCount).toBeLessThanOrEqual(80);
    expect(result.snapshot.nodeLimit).toBe(80);
    expect(result.snapshot.truncated).toBe(true);
    expect(result.nodes.some((node) => node.actions.includes("invoke"))).toBe(false);

    const settingsCandidate = result.summary.navigationCandidates?.find((item) => item.oid === 50);
    expect(settingsCandidate).toEqual(
      expect.objectContaining({
        actionTargetOid: 50,
        areaHint: "topRight",
        role: "edgeTapTarget",
      })
    );

    const settingsNode = result.nodes.find((node) => node.oid === 50);
    expect(settingsNode?.actions).toContain("tap");

    const fullResult = await uiSnapshot({ session: "com.test@1234", maxNodes: 0 }, exec);
    expect(fullResult.snapshot.truncated).toBe(false);
    expect(fullResult.nodes.length).toBeGreaterThan(result.nodes.length);
  });

  it("normalizes local frames to screen coordinates and surfaces primary actions", async () => {
    const exec = makeExec(JSON.stringify(makeNestedActionHierarchy()));
    const result = await uiSnapshot({ session: "com.test@1234", maxNodes: 0 }, exec);

    const createPost = result.nodes.find((node) => node.oid === 301);
    expect(createPost?.frame).toEqual({ x: 50, y: 320, width: 120, height: 44 });

    const candidate = result.summary.navigationCandidates?.find((item) => item.oid === 301);
    expect(candidate).toEqual(
      expect.objectContaining({
        actionTargetOid: 301,
        areaHint: "middleLeft",
        label: "Create Post",
      })
    );
  });

  it("loads matched project recipes and resolves recommended oids", async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-snapshot-recipes-"));
    fs.mkdirSync(path.join(project, ".git"));
    fs.mkdirSync(path.join(project, ".viewglassmcp"));
    fs.writeFileSync(
      path.join(project, ".viewglassmcp", "recipes.yaml"),
      `version: 1

recipes:
  - id: "switch_to_me"
    description: "Switch to Me."
    screen:
      controllerHints:
        - "UIWindow"
      visibleTextAny:
        - "Agent Playground"
        - "Me"
    steps:
      - tool: "ui_tap"
        role: "switcherItem"
        groupRole: "bottomNavigation"
        searchableTextAny:
          - "Me"
`,
      "utf8"
    );
    process.chdir(project);
    process.env.PWD = project;

    const exec = makeExec(JSON.stringify(hierarchyFixture));
    const result = await uiSnapshot({ session: "com.test@1234" }, exec);

    expect(result.matchedRecipes).toHaveLength(1);
    expect(result.matchedRecipes[0]?.id).toBe("switch_to_me");
    expect(result.matchedRecipes[0]?.suggestedSteps[0]?.recommendedOid).toBe(230);
  });

  it("omits rawTree by default", async () => {
    const exec = makeExec(JSON.stringify(hierarchyFixture));
    const result = await uiSnapshot({ session: "com.test@1234" }, exec);
    expect(result.rawTree).toBeUndefined();
  });

  it("includes rawTree when compact=false", async () => {
    const exec = makeExec(JSON.stringify(hierarchyFixture));
    const result = await uiSnapshot({ session: "com.test@1234", compact: false }, exec);
    expect(result.rawTree?.snapshotId).toBe("snap-1");
  });

  it("auto-detects session when not provided", async () => {
    const exec = makeExec(JSON.stringify(hierarchyFixture)) as ReturnType<typeof vi.fn>;
    await uiSnapshot({}, exec);
    const appsCalls = exec.mock.calls.filter((c: unknown[]) => (c[1] as string[]).includes("list"));
    expect(appsCalls.length).toBe(1);
  });

  it("throws when CLI returns invalid JSON", async () => {
    const exec = makeExec("not json");
    await expect(uiSnapshot({ session: "com.test@1234" }, exec)).rejects.toThrow(
      "Failed to parse JSON from 'ui_snapshot'"
    );
  });
});
