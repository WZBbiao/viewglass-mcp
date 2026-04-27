import { describe, it, expect, vi } from "vitest";
import { uiTap } from "../tools/ui_tap.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    return { stdout: JSON.stringify({ success: true, strategyUsed: "semantic" }), stderr: "" };
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

  it("returns execution summary only", async () => {
    const exec = makeExec();
    const result = await uiTap({ oid: "42", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.oid).toBe("42");
    expect(result.strategyUsed).toBe("semantic");
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

  it("rejects missing oid", async () => {
    const exec = makeExec();
    await expect(uiTap({ oid: "" as string, session: "com.test@1234" }, exec)).rejects.toThrow(
      "ui_tap requires an exact oid from ui_snapshot"
    );
  });
});
