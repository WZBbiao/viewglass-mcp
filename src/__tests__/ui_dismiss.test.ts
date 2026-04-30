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

  it("resolves hierarchy once without automatic post-dismiss refresh", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiDismiss({ oid: "91", session: "com.test@1234" }, exec);
    const cmds = (exec.mock.calls as [string, string[]][]).map((c) => c[1][0]);
    expect(cmds).toEqual(["hierarchy", "dismiss"]);
  });

  it("returns execution summary only", async () => {
    const exec = makeExec();
    const result = await uiDismiss({ oid: "91", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.oid).toBe("91");
  });

  it("resolves hosted views to their nearest host UIViewController oid", async () => {
    const exec = vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
      if (args[0] === "hierarchy") {
        return {
          stdout: JSON.stringify({
            windows: [
              {
                node: { oid: 1, className: "UIWindow" },
                children: [
                  {
                    node: { oid: 10, className: "UIView", hostViewControllerOid: 99 },
                    children: [
                      { node: { oid: 11, className: "UIButton", parentOid: 10 }, children: [] },
                    ],
                  },
                ],
              },
            ],
          }),
          stderr: "",
        };
      }
      return { stdout: "{}", stderr: "" };
    }) as unknown as ReturnType<typeof vi.fn> & ExecFn;

    const result = await uiDismiss({ oid: "11", session: "com.test@1234" }, exec);
    const dismissCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "dismiss")!;
    expect(dismissCall[1]).toEqual(["dismiss", "99", "--json", "--session", "com.test@1234"]);
    expect(result).toEqual({ oid: "11", resolvedOid: "99", ok: true });
  });

  it("rejects missing oid", async () => {
    const exec = makeExec();
    await expect(uiDismiss({ oid: "" as string, session: "com.test@1234" }, exec)).rejects.toThrow(
      "ui_dismiss requires an exact oid from ui_snapshot"
    );
  });
});
