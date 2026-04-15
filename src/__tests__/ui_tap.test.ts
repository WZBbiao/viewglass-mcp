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

describe("uiTap", () => {
  it("calls tap with resolved target, then refresh and hierarchy", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiTap({ locator: "submit", session: "com.test@1234" }, exec);
    const cmds = (exec.mock.calls as [string, string[]][]).map((c) => c[1][0]);
    expect(cmds).toEqual(["hierarchy", "query", "tap", "refresh", "hierarchy"]);
    const tapCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "tap");
    expect(tapCall?.[1]).toEqual(["tap", "42", "--session", "com.test@1234"]);
  });

  it("returns lightweight post-action state", async () => {
    const exec = makeExec();
    const result = await uiTap({ locator: "submit", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.locator).toBe("submit");
    expect(result.resolvedTarget).toBe("42");
    expect(result.matchedBy).toBe("query fallback");
    expect(result.postState.snapshotId).toBe("snap-1");
  });

  it("accepts legacy locator syntax for backward compatibility", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiTap({ locator: "#submit", session: "com.test@1234" }, exec);
    expect(exec.mock.calls[0][1]).toEqual(["tap", "#submit", "--session", "com.test@1234"]);
  });
});
