import { describe, it, expect, vi } from "vitest";
import { uiDismiss } from "../tools/ui_dismiss.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args.includes("list")) {
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    }
    if (args[0] === "hierarchy") {
      return { stdout: '{"windows":[]}', stderr: "" };
    }
    return { stdout: "{}", stderr: "" };
  });
}

describe("uiDismiss", () => {
  it("calls dismiss command with target", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiDismiss({ target: "#modal", session: "com.test@1234" }, exec);
    const dismissCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "dismiss");
    expect(dismissCalls.length).toBe(1);
    expect(dismissCalls[0][1]).toContain("#modal");
  });

  it("calls refresh after dismiss", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiDismiss({ target: "#modal", session: "com.test@1234" }, exec);
    const cmds = (exec.mock.calls as [string, string[]][]).map((c) => c[1][0]);
    expect(cmds).toContain("refresh");
  });

  it("fetches hierarchy after dismiss", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiDismiss({ target: "#modal", session: "com.test@1234" }, exec);
    const cmds = (exec.mock.calls as [string, string[]][]).map((c) => c[1][0]);
    expect(cmds).toContain("hierarchy");
  });

  it("returns ok:true, target, and hierarchy", async () => {
    const exec = makeExec();
    const result = await uiDismiss({ target: "#sheet", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.target).toBe("#sheet");
    expect(result.hierarchy).toBeDefined();
  });

  it("calls commands in order: dismiss → refresh → hierarchy", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiDismiss({ target: "#vc", session: "com.test@1234" }, exec);
    const cmds = (exec.mock.calls as [string, string[]][]).map((c) => c[1][0]);
    const idx = (c: string) => cmds.indexOf(c);
    expect(idx("dismiss")).toBeLessThan(idx("refresh"));
    expect(idx("refresh")).toBeLessThan(idx("hierarchy"));
  });
});
