import { describe, it, expect, vi } from "vitest";
import { uiTap } from "../tools/ui_tap.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    return { stdout: "", stderr: "" };
  });
}

describe("uiTap", () => {
  it("calls tap with oid", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiTap({ oid: "42", session: "com.test@1234" }, exec);
    const cmds = (exec.mock.calls as [string, string[]][]).map((c) => c[1][0]);
    expect(cmds).toEqual(["tap"]);
    const tapCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "tap");
    expect(tapCall?.[1]).toEqual(["tap", "42", "--session", "com.test@1234"]);
  });

  it("returns execution summary only", async () => {
    const exec = makeExec();
    const result = await uiTap({ oid: "42", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.oid).toBe("42");
  });

  it("accepts numeric oid strings only", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiTap({ oid: "123", session: "com.test@1234" }, exec);
    expect(exec.mock.calls[0][1]).toEqual(["tap", "123", "--session", "com.test@1234"]);
  });

  it("rejects missing oid", async () => {
    const exec = makeExec();
    await expect(uiTap({ oid: "" as string, session: "com.test@1234" }, exec)).rejects.toThrow(
      "ui_tap requires an exact oid from ui_snapshot"
    );
  });
});
