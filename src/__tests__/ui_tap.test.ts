import { describe, it, expect, vi } from "vitest";
import { uiTap } from "../tools/ui_tap.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args[0] === "query") {
      if (args[1] === "#submit_button") {
        return { stdout: JSON.stringify([{ oid: 42, primaryOid: 42 }]), stderr: "" };
      }
      return { stdout: "[]", stderr: "" };
    }
    if (args[0] === "hierarchy") {
      const windows = args.includes("--filter")
        ? []
        : [
            {
              node: {
                oid: 90,
                primaryOid: 90,
                className: "UIView",
                frame: { x: 0, y: 0, width: 100, height: 100 },
                isHidden: false,
                alpha: 1,
                isUserInteractionEnabled: true,
                accessibilityIdentifier: "coordinate_wrapper",
              },
              children: [],
            },
          ];
      return {
        stdout: JSON.stringify({
          appInfo: { appName: "FixtureApp", bundleIdentifier: "com.test", serverVersion: "0.1.0" },
          fetchedAt: "2026-04-15T10:00:00Z",
          screenScale: 3,
          screenSize: { x: 0, y: 0, width: 390, height: 844 },
          snapshotId: "snap-tap",
          windows,
        }),
        stderr: "",
      };
    }
    return { stdout: JSON.stringify({ success: true, action: "tap", targetClass: "UIButton", mode: "semantic", detail: "Triggered UIControlEventTouchUpInside", strategyUsed: "semantic" }), stderr: "" };
  });
}

describe("uiTap", () => {
  it("calls tap with oid", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiTap({ oid: "42", session: "com.test@1234" }, exec);
    const cmds = (exec.mock.calls as [string, string[]][]).map((c) => c[1][0]);
    expect(cmds).toEqual(["tap"]);
    const tapCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "tap");
    expect(tapCall?.[1]).toEqual(["tap", "42", "--json", "--session", "com.test@1234"]);
  });

  it("resolves locator before tapping", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    const result = await uiTap({ locator: "submit_button", session: "com.test@1234" }, exec);
    const tapCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "tap");
    expect(tapCall?.[1]).toEqual(["tap", "42", "--json", "--session", "com.test@1234"]);
    expect(result).toEqual(expect.objectContaining({
      oid: "42",
      locator: "submit_button",
      resolvedOid: "42",
      matchedBy: "query fallback",
      candidateCount: 1,
    }));
  });

  it("uses the matched node oid for tap locators so coordinate fallback can run", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    const result = await uiTap({ locator: "#coordinate_wrapper", session: "com.test@1234" }, exec);
    const tapCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "tap");
    expect(tapCall?.[1]).toEqual(["tap", "90", "--json", "--session", "com.test@1234"]);
    expect(result).toEqual(expect.objectContaining({
      oid: "90",
      locator: "#coordinate_wrapper",
      resolvedOid: "90",
      matchedBy: "accessibilityIdentifier",
      candidateCount: 1,
    }));
  });

  it("uses a 30s process timeout for tap mutations", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiTap({ oid: "42", session: "com.test@1234" }, exec);
    const tapCall = exec.mock.calls.find((c) => c[1][0] === "tap");
    expect(tapCall?.[2]).toEqual({ timeout: 30_000 });
  });

  it("returns execution summary and diagnostics", async () => {
    const exec = makeExec();
    const result = await uiTap({ oid: "42", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.oid).toBe("42");
    expect(result.strategyUsed).toBe("semantic");
    expect(result.action).toBe("tap");
    expect(result.targetClass).toBe("UIButton");
    expect(result.mode).toBe("semantic");
    expect(result.detail).toContain("UIControlEventTouchUpInside");
  });

  it("returns coordinate semantic fallback details", async () => {
    const exec: ExecFn = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        success: true,
        strategyUsed: "coordinateSemantic",
        fallbackReason: "Didn't find a tappable target.",
        pointX: 120,
        pointY: 240,
        hitOid: 99,
        hitClass: "UIButton",
      }),
      stderr: "",
    });
    const result = await uiTap({ oid: "42", session: "com.test@1234" }, exec);
    expect(result.strategyUsed).toBe("coordinateSemantic");
    expect(result.fallbackReason).toContain("tappable");
    expect(result.point).toEqual({ x: 120, y: 240 });
    expect(result.hitOid).toBe("99");
    expect(result.hitClass).toBe("UIButton");
  });

  it("accepts numeric oid strings only", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiTap({ oid: "123", session: "com.test@1234" }, exec);
    expect(exec.mock.calls[0][1]).toEqual(["tap", "123", "--json", "--session", "com.test@1234"]);
  });

  it("rejects missing target", async () => {
    const exec = makeExec();
    await expect(uiTap({ session: "com.test@1234" }, exec)).rejects.toThrow(
      "ui_tap requires either 'locator' or 'oid'"
    );
  });
});
