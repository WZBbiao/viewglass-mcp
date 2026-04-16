import { describe, it, expect, vi } from "vitest";
import { uiScroll } from "../tools/ui_scroll.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    return { stdout: "", stderr: "" };
  });
}

describe("uiScroll", () => {
  it("calls scroll with oid and uses the default down distance", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ oid: "88", direction: "down", session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toEqual(["scroll", "88", "--by", "0,300", "--session", "com.test@1234"]);
  });

  it("passes custom direction and distance", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ oid: "88", direction: "up", distance: 500, session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toContain("0,-500");
  });

  it("appends --animated when requested", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ oid: "88", direction: "down", animated: true, session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toContain("--animated");
  });

  it("returns execution summary only", async () => {
    const exec = makeExec();
    const result = await uiScroll({ oid: "88", direction: "down", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.oid).toBe("88");
    expect(result.direction).toBe("down");
    expect(result.distance).toBe(300);
  });

  it("rejects missing oid", async () => {
    const exec = makeExec();
    await expect(uiScroll({ oid: "" as string, direction: "down", session: "com.test@1234" }, exec)).rejects.toThrow(
      "ui_scroll requires an exact oid from ui_snapshot"
    );
  });
});
