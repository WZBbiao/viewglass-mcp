import { describe, it, expect, vi } from "vitest";
import { uiWait } from "../tools/ui_wait.js";
import type { ExecFn } from "../runner.js";

function makeExec(waitResult?: object): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args.includes("list")) {
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    }
    // Simulate wait command output
    const result = waitResult ?? {
      met: true,
      condition: "appears:#foo",
      elapsedSeconds: 0.5,
      pollCount: 1,
    };
    return { stdout: JSON.stringify(result), stderr: "" };
  });
}

describe("uiWait - appears mode", () => {
  it("calls wait appears with locator", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiWait({ mode: "appears", locator: "#foo", session: "com.test@1234" }, exec);
    const waitCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "wait");
    expect(waitCalls[0][1][1]).toBe("appears");
    expect(waitCalls[0][1]).toContain("#foo");
  });

  it("passes --json flag", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiWait({ mode: "appears", locator: "#foo", session: "com.test@1234" }, exec);
    const waitCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "wait");
    expect(waitCalls[0][1]).toContain("--json");
  });

  it("passes --timeout when provided", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiWait({ mode: "appears", locator: "#foo", timeout: 5, session: "com.test@1234" }, exec);
    const waitCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "wait");
    const args = waitCalls[0][1];
    expect(args).toContain("--timeout");
    expect(args[args.indexOf("--timeout") + 1]).toBe("5");
  });

  it("returns met:true and pollCount", async () => {
    const exec = makeExec({ met: true, condition: "appears:#foo", elapsedSeconds: 0.5, pollCount: 2 });
    const result = await uiWait({ mode: "appears", locator: "#foo", session: "com.test@1234" }, exec);
    expect(result.met).toBe(true);
    expect(result.pollCount).toBe(2);
  });
});

describe("uiWait - gone mode", () => {
  it("calls wait gone", async () => {
    const exec = makeExec({ met: true, condition: "gone:#foo", elapsedSeconds: 0.1, pollCount: 1 }) as ReturnType<typeof vi.fn>;
    await uiWait({ mode: "gone", locator: "#foo", session: "com.test@1234" }, exec);
    const waitCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "wait");
    expect(waitCalls[0][1][1]).toBe("gone");
  });
});

describe("uiWait - attr mode", () => {
  it("calls wait attr with key and equals", async () => {
    const exec = makeExec({ met: true, condition: "attr:text=Hello", elapsedSeconds: 0.1, pollCount: 1 }) as ReturnType<typeof vi.fn>;
    await uiWait({ mode: "attr", locator: "#label", key: "text", equals: "Hello", session: "com.test@1234" }, exec);
    const waitCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "wait");
    const args = waitCalls[0][1];
    expect(args[1]).toBe("attr");
    expect(args).toContain("--key");
    expect(args[args.indexOf("--key") + 1]).toBe("text");
    expect(args).toContain("--equals");
    expect(args[args.indexOf("--equals") + 1]).toBe("Hello");
  });

  it("calls wait attr with contains", async () => {
    const exec = makeExec({ met: true, condition: "attr:text~Hello", elapsedSeconds: 0.1, pollCount: 1 }) as ReturnType<typeof vi.fn>;
    await uiWait({ mode: "attr", locator: "#label", key: "text", contains: "Hello", session: "com.test@1234" }, exec);
    const waitCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "wait");
    const args = waitCalls[0][1];
    expect(args).toContain("--contains");
  });

  it("throws when neither equals nor contains provided", async () => {
    const exec = makeExec();
    await expect(
      uiWait({ mode: "attr", locator: "#label", key: "text", session: "com.test@1234" } as Parameters<typeof uiWait>[0], exec)
    ).rejects.toThrow("equals");
  });
});
