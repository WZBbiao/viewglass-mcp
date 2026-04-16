import { describe, it, expect, vi } from "vitest";
import { uiScroll } from "../tools/ui_scroll.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args[0] === "query") {
      if (args[1] === "#feed") return { stdout: JSON.stringify([{ oid: 88, primaryOid: 88 }]), stderr: "" };
      return { stdout: "[]", stderr: "" };
    }
    if (args[0] === "hierarchy") {
      return {
        stdout: JSON.stringify({
          appInfo: { appName: "FixtureApp", bundleIdentifier: "com.test", serverVersion: "0.1.0" },
          fetchedAt: "2026-04-15T10:00:00Z",
          screenScale: 3,
          screenSize: { x: 0, y: 0, width: 390, height: 844 },
          snapshotId: "snap-scroll",
          windows: [],
        }),
        stderr: "",
      };
    }
    return { stdout: "", stderr: "" };
  });
}

describe("uiScroll", () => {
  it("resolves a plain locator and uses the default down distance", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "feed", direction: "down", session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toEqual(["scroll", "88", "--by", "0,300", "--session", "com.test@1234"]);
  });

  it("passes custom direction and distance", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "feed", direction: "up", distance: 500, session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toContain("0,-500");
  });

  it("appends --animated when requested", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "feed", direction: "down", animated: true, session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toContain("--animated");
  });

  it("returns execution summary only", async () => {
    const exec = makeExec();
    const result = await uiScroll({ locator: "feed", direction: "down", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.locator).toBe("feed");
    expect(result.resolvedTarget).toBe("88");
    expect(result.direction).toBe("down");
    expect(result.distance).toBe(300);
  });
});
