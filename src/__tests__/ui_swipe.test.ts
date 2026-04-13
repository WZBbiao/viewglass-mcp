import { describe, it, expect, vi } from "vitest";
import { uiSwipe } from "../tools/ui_swipe.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args.includes("list")) {
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    }
    return { stdout: "{}", stderr: "" };
  });
}

describe("uiSwipe", () => {
  it("calls swipe command with target and direction", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiSwipe({ target: "UIScrollView", direction: "up", session: "com.test@1234" }, exec);
    const swipeCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "swipe");
    expect(swipeCalls.length).toBe(1);
    const args = swipeCalls[0][1];
    expect(args).toContain("UIScrollView");
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
