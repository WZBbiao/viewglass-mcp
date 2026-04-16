import { describe, it, expect, vi } from "vitest";
import { uiDismiss } from "../tools/ui_dismiss.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args[0] === "query") {
      if (args[1] === "#modal") return { stdout: JSON.stringify([{ oid: 91, primaryOid: 91 }]), stderr: "" };
      return { stdout: "[]", stderr: "" };
    }
    if (args[0] === "hierarchy") {
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
    return { stdout: "{}", stderr: "" };
  });
}

describe("uiDismiss", () => {
  it("resolves a plain locator and calls dismiss", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiDismiss({ target: "modal", session: "com.test@1234" }, exec);
    const dismissCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "dismiss")!;
    expect(dismissCall[1]).toEqual(["dismiss", "91", "--json", "--session", "com.test@1234"]);
  });

  it("calls dismiss without automatic refresh", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiDismiss({ target: "modal", session: "com.test@1234" }, exec);
    const cmds = (exec.mock.calls as [string, string[]][]).map((c) => c[1][0]);
    expect(cmds).toEqual(["hierarchy", "query", "dismiss"]);
  });

  it("returns execution summary only", async () => {
    const exec = makeExec();
    const result = await uiDismiss({ target: "modal", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.target).toBe("modal");
    expect(result.resolvedTarget).toBe("91");
    expect(result.matchedBy).toBe("query fallback");
  });
});
