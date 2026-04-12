import { describe, it, expect, vi } from "vitest";
import { uiTap } from "../tools/ui_tap.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if ((args as string[]).includes("list"))
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    if ((args as string[]).includes("hierarchy"))
      return { stdout: '{"windows":[{"node":{"className":"UIWindow"},"children":[]}]}', stderr: "" };
    return { stdout: "", stderr: "" };
  });
}

describe("uiTap", () => {
  it("calls tap <locator>, refresh, hierarchy in order", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiTap({ locator: "#submit", session: "com.test@1234" }, exec);
    const cmds = (exec.mock.calls as [string, string[]][]).map((c) => c[1][0]);
    expect(cmds).toEqual(["tap", "refresh", "hierarchy"]);
  });

  it("passes locator to tap command", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiTap({ locator: "#submit", session: "com.test@1234" }, exec);
    const tapCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "tap");
    expect(tapCall![1]).toContain("#submit");
  });

  it("returns tapped locator and post-action hierarchy", async () => {
    const exec = makeExec();
    const result = await uiTap({ locator: "#submit", session: "com.test@1234" }, exec);
    expect(result.tapped).toBe("#submit");
    expect(result.hierarchy).toBeDefined();
  });
});
