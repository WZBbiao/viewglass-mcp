import { describe, it, expect, vi } from "vitest";
import { uiSwipe } from "../tools/ui_swipe.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args[0] === "query") {
      if (args[1] === "#list" || args[1] === "#pager" || args[1] === "UIScrollView") {
        return { stdout: JSON.stringify([{ oid: 66, primaryOid: 66 }]), stderr: "" };
      }
      return { stdout: "[]", stderr: "" };
    }
    if (args[0] === "hierarchy") {
      return {
        stdout: JSON.stringify({
          appInfo: { appName: "FixtureApp", bundleIdentifier: "com.test", serverVersion: "0.1.0" },
          fetchedAt: "2026-04-15T10:00:00Z",
          screenScale: 3,
          screenSize: { x: 0, y: 0, width: 390, height: 844 },
          snapshotId: "snap-swipe",
          windows: [],
        }),
        stderr: "",
      };
    }
    return { stdout: "", stderr: "" };
  });
}

describe("uiSwipe", () => {
  it("calls swipe command with target and direction", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiSwipe({ target: "UIScrollView", direction: "up", session: "com.test@1234" }, exec);
    const swipeCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "swipe");
    expect(swipeCalls.length).toBe(1);
    const args = swipeCalls[0][1];
    expect(args).toContain("66");
    expect(args).toContain("--direction");
    expect(args[args.indexOf("--direction") + 1]).toBe("up");
  });

  it("defaults distance to 200", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiSwipe({ target: "UIScrollView", direction: "down", session: "com.test@1234" }, exec);
    const swipeCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "swipe");
    const args = swipeCalls[0][1];
    expect(args).toContain("--distance");
    expect(args[args.indexOf("--distance") + 1]).toBe("200");
  });

  it("passes custom distance", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiSwipe({ target: "#list", direction: "left", distance: 350, session: "com.test@1234" }, exec);
    const swipeCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "swipe");
    const args = swipeCalls[0][1];
    expect(args[args.indexOf("--distance") + 1]).toBe("350");
  });

  it("adds --animated when animated=true", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiSwipe({ target: "#list", direction: "right", animated: true, session: "com.test@1234" }, exec);
    const swipeCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "swipe");
    expect(swipeCalls[0][1]).toContain("--animated");
  });

  it("returns target, direction, distance, ok:true", async () => {
    const exec = makeExec();
    const result = await uiSwipe({ target: "#pager", direction: "left", session: "com.test@1234" }, exec);
    expect(result.target).toBe("#pager");
    expect(result.direction).toBe("left");
    expect(result.distance).toBe(200);
    expect(result.ok).toBe(true);
  });
});
