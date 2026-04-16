import { describe, it, expect, vi } from "vitest";
import { uiDismiss } from "../tools/ui_dismiss.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    return { stdout: "{}", stderr: "" };
  });
}

describe("uiDismiss", () => {
  it("calls dismiss with oid", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiDismiss({ oid: "91", session: "com.test@1234" }, exec);
    const dismissCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "dismiss")!;
    expect(dismissCall[1]).toEqual(["dismiss", "91", "--json", "--session", "com.test@1234"]);
  });

  it("calls dismiss without automatic refresh", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiDismiss({ oid: "91", session: "com.test@1234" }, exec);
    const cmds = (exec.mock.calls as [string, string[]][]).map((c) => c[1][0]);
    expect(cmds).toEqual(["dismiss"]);
  });

  it("returns execution summary only", async () => {
    const exec = makeExec();
    const result = await uiDismiss({ oid: "91", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.oid).toBe("91");
  });

  it("rejects missing oid", async () => {
    const exec = makeExec();
    await expect(uiDismiss({ oid: "" as string, session: "com.test@1234" }, exec)).rejects.toThrow(
      "ui_dismiss requires an exact oid from ui_snapshot"
    );
  });
});
