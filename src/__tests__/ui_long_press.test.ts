import { describe, it, expect, vi } from "vitest";
import { uiLongPress } from "../tools/ui_long_press.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args.includes("list")) {
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    }
    return { stdout: "{}", stderr: "" };
  });
}

describe("uiLongPress", () => {
  it("calls long-press command with target", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiLongPress({ target: "#item", session: "com.test@1234" }, exec);
    const lpCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "long-press");
    expect(lpCalls.length).toBe(1);
    expect(lpCalls[0][1]).toContain("#item");
  });

  it("passes --json flag", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiLongPress({ target: "#item", session: "com.test@1234" }, exec);
    const lpCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "long-press");
    expect(lpCalls[0][1]).toContain("--json");
  });

  it("returns ok:true and target", async () => {
    const exec = makeExec();
    const result = await uiLongPress({ target: "#menu-trigger", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.target).toBe("#menu-trigger");
  });
});
