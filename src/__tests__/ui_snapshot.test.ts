import { describe, it, expect, vi } from "vitest";
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
                frame: { x: 30, y: 770, width: 80, height: 58 },
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
                    frame: { x: 37, y: 805, width: 20, height: 12 },
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
                frame: { x: 160, y: 770, width: 80, height: 58 },
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
                    frame: { x: 172, y: 805, width: 30, height: 12 },
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
                frame: { x: 280, y: 770, width: 80, height: 58 },
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
                    className: "UIView",
                    frame: { x: 288, y: 782, width: 64, height: 34 },
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
                        frame: { x: 300, y: 805, width: 20, height: 12 },
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

function makeExec(stdout: string, error?: Error): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (error) throw error;
    if (args.includes("list")) return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    return { stdout, stderr: "" };
  });
}

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

    const gameLabel = result.nodes.find((node) => node.oid === 211);
    expect(gameLabel?.text).toBe("遊戲");
    expect(gameLabel?.actionTargetOid).toBe(210);
    expect(gameLabel?.groupId).toBe("group_bottom_1");
    expect(gameLabel?.searchableText).toContain("遊戲");

    const meLabel = result.nodes.find((node) => node.oid === 232);
    expect(meLabel?.text).toBe("Me");
    expect(meLabel?.actionTargetOid).toBe(230);
    expect(meLabel?.groupId).toBe("group_bottom_1");
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
