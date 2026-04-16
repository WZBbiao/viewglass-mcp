import { describe, it, expect, vi } from "vitest";
import { uiTap } from "../tools/ui_tap.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args[0] === "query") {
      if (args[1] === "#submit") return { stdout: JSON.stringify([{ oid: 42, primaryOid: 42 }]), stderr: "" };
      return { stdout: "[]", stderr: "" };
    }
    if (args[0] === "hierarchy") {
      return {
        stdout: JSON.stringify({
          appInfo: { appName: "FixtureApp", bundleIdentifier: "com.test", serverVersion: "0.1.0" },
          fetchedAt: "2026-04-15T10:00:00Z",
          screenScale: 3,
          screenSize: { x: 0, y: 0, width: 390, height: 844 },
          snapshotId: "snap-1",
          windows: [],
        }),
        stderr: "",
      };
    }
    return { stdout: "", stderr: "" };
  });
}

function makeBottomNavExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args[0] === "hierarchy") {
      return {
        stdout: JSON.stringify({
          appInfo: { appName: "FixtureApp", bundleIdentifier: "com.test", serverVersion: "0.1.0" },
          fetchedAt: "2026-04-15T10:00:00Z",
          screenScale: 3,
          screenSize: { x: 0, y: 0, width: 390, height: 844 },
          snapshotId: "snap-group",
          windows: [
            {
              node: {
                oid: 1,
                primaryOid: 1,
                className: "UIView",
                frame: { x: 0, y: 0, width: 390, height: 844 },
                isUserInteractionEnabled: false,
                isHidden: false,
                alpha: 1,
              },
              children: [
                {
                  node: {
                    oid: 10,
                    primaryOid: 10,
                    className: "UILabel",
                    frame: { x: 0, y: 780, width: 120, height: 44 },
                    isUserInteractionEnabled: true,
                    isHidden: false,
                    alpha: 1,
                    customDisplayTitle: "Games",
                  },
                  children: [],
                },
                {
                  node: {
                    oid: 11,
                    primaryOid: 11,
                    className: "UILabel",
                    frame: { x: 135, y: 780, width: 120, height: 44 },
                    isUserInteractionEnabled: true,
                    isHidden: false,
                    alpha: 1,
                    customDisplayTitle: "Rank",
                  },
                  children: [],
                },
                {
                  node: {
                    oid: 12,
                    primaryOid: 12,
                    className: "UILabel",
                    frame: { x: 270, y: 780, width: 120, height: 44 },
                    isUserInteractionEnabled: true,
                    isHidden: false,
                    alpha: 1,
                    customDisplayTitle: "Me",
                  },
                  children: [],
                },
              ],
            },
          ],
        }),
        stderr: "",
      };
    }
    if (args[0] === "query") return { stdout: "[]", stderr: "" };
    return { stdout: "", stderr: "" };
  });
}

describe("uiTap", () => {
  it("calls tap with resolved target", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiTap({ locator: "submit", session: "com.test@1234" }, exec);
    const cmds = (exec.mock.calls as [string, string[]][]).map((c) => c[1][0]);
    expect(cmds).toEqual(["hierarchy", "query", "tap"]);
    const tapCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "tap");
    expect(tapCall?.[1]).toEqual(["tap", "42", "--session", "com.test@1234"]);
  });

  it("returns execution summary only", async () => {
    const exec = makeExec();
    const result = await uiTap({ locator: "submit", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.locator).toBe("submit");
    expect(result.resolvedTarget).toBe("42");
    expect(result.matchedBy).toBe("query fallback");
  });

  it("accepts legacy locator syntax for backward compatibility", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiTap({ locator: "#submit", session: "com.test@1234" }, exec);
    expect(exec.mock.calls[0][1]).toEqual(["tap", "#submit", "--session", "com.test@1234"]);
  });

  it("prefers bottom navigation group label matches over generic multi-match text", async () => {
    const exec = makeBottomNavExec() as ReturnType<typeof vi.fn>;
    const result = await uiTap({ locator: "Me", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.resolvedTarget).toBe("12");
    expect(result.matchedBy).toBe("group label");
    const cmds = exec.mock.calls.map((call) => call[1][0]);
    expect(cmds).toEqual(["hierarchy", "tap"]);
  });
});
