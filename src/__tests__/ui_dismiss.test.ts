import { describe, it, expect, vi } from "vitest";
import { uiDismiss } from "../tools/ui_dismiss.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  let hierarchyCount = 0;
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args[0] === "query") {
      if (args[1] === "#dismiss_modal") {
        return { stdout: JSON.stringify([{ oid: 91, primaryOid: 91 }]), stderr: "" };
      }
      return { stdout: "[]", stderr: "" };
    }
    if (args[0] === "hierarchy") {
      hierarchyCount += 1;
      if (hierarchyCount === 1) {
        return {
          stdout: JSON.stringify({
            appInfo: { appName: "FixtureApp", bundleIdentifier: "com.test", serverVersion: "0.1.0" },
            fetchedAt: "2026-04-15T10:00:00Z",
            screenScale: 3,
            screenSize: { x: 0, y: 0, width: 390, height: 844 },
            snapshotId: "snap-dismiss",
            windows: [],
          }),
          stderr: "",
        };
      }
      return { stdout: JSON.stringify({ windows: [] }), stderr: "" };
    }
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

  it("resolves locator before dismiss", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    const result = await uiDismiss({ locator: "dismiss_modal", session: "com.test@1234" }, exec);
    const dismissCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "dismiss")!;
    expect(dismissCall[1]).toEqual(["dismiss", "91", "--json", "--session", "com.test@1234"]);
    expect(result).toEqual(expect.objectContaining({
      oid: "91",
      locator: "dismiss_modal",
      matchedBy: "query fallback",
      candidateCount: 1,
    }));
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

  it("rejects missing target", async () => {
    const exec = makeExec();
    await expect(uiDismiss({ session: "com.test@1234" }, exec)).rejects.toThrow(
      "ui_dismiss requires either 'locator' or 'oid'"
    );
  });
});
