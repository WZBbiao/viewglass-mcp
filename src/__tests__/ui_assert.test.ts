import { describe, it, expect, vi } from "vitest";
import { uiAssert } from "../tools/ui_assert.js";
import type { ExecFn } from "../runner.js";

function makeExec(assertResult?: object): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args[0] === "hierarchy") {
      return {
        stdout: JSON.stringify({
          appInfo: { appName: "FixtureApp", bundleIdentifier: "com.test", serverVersion: "0.1.0" },
          fetchedAt: "2026-04-15T10:00:00Z",
          screenScale: 3,
          screenSize: { x: 0, y: 0, width: 390, height: 844 },
          snapshotId: "snap-assert",
          windows: [],
        }),
        stderr: "",
      };
    }
    const result = assertResult ?? { passed: true, assertion: "visible", locator: "#foo", matchCount: 1, message: "ok" };
    return { stdout: JSON.stringify(result), stderr: "" };
  });
}

describe("uiAssert - visible", () => {
  it("calls assert visible with locator", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiAssert({ mode: "visible", locator: "#foo", session: "com.test@1234" }, exec);
    const assertCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "assert");
    expect(assertCalls[0][1][1]).toBe("visible");
    expect(assertCalls[0][1]).toContain("#foo");
  });

  it("passes --json", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiAssert({ mode: "visible", locator: "#foo", session: "com.test@1234" }, exec);
    const assertCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "assert");
    expect(assertCalls[0][1]).toContain("--json");
  });

  it("returns passed:true result", async () => {
    const exec = makeExec({ passed: true, assertion: "visible", locator: "#foo", matchCount: 2, message: "Found 2 node(s)" });
    const result = await uiAssert({ mode: "visible", locator: "#foo", session: "com.test@1234" }, exec);
    expect(result.passed).toBe(true);
    expect(result.matchCount).toBe(2);
  });
});

describe("uiAssert - text", () => {
  it("passes expected text as positional arg", async () => {
    const exec = makeExec({ passed: true, assertion: "text", locator: "#label", matchCount: 1, message: "ok" }) as ReturnType<typeof vi.fn>;
    await uiAssert({ mode: "text", locator: "#label", expected: "Hello", session: "com.test@1234" }, exec);
    const assertCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "assert");
    expect(assertCalls[0][1]).toContain("Hello");
  });

  it("passes --contains flag when contains:true", async () => {
    const exec = makeExec({ passed: true, assertion: "text", locator: "#label", matchCount: 1, message: "ok" }) as ReturnType<typeof vi.fn>;
    await uiAssert({ mode: "text", locator: "#label", expected: "ell", contains: true, session: "com.test@1234" }, exec);
    const assertCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "assert");
    expect(assertCalls[0][1]).toContain("--contains");
  });
});

describe("uiAssert - count", () => {
  it("passes exact count as positional arg", async () => {
    const exec = makeExec({ passed: true, assertion: "count", locator: "UIButton", matchCount: 3, message: "ok" }) as ReturnType<typeof vi.fn>;
    await uiAssert({ mode: "count", locator: "UIButton", expected: 3, session: "com.test@1234" }, exec);
    const assertCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "assert");
    expect(assertCalls[0][1]).toContain("3");
  });

  it("passes --min and --max", async () => {
    const exec = makeExec({ passed: true, assertion: "count", locator: "UIButton", matchCount: 2, message: "ok" }) as ReturnType<typeof vi.fn>;
    await uiAssert({ mode: "count", locator: "UIButton", min: 1, max: 5, session: "com.test@1234" }, exec);
    const assertCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "assert");
    const args = assertCalls[0][1];
    expect(args).toContain("--min");
    expect(args).toContain("--max");
  });
});

describe("uiAssert - attr", () => {
  it("passes --key and --equals", async () => {
    const exec = makeExec({ passed: true, assertion: "attr", locator: "#view", matchCount: 1, message: "ok" }) as ReturnType<typeof vi.fn>;
    await uiAssert({ mode: "attr", locator: "#view", key: "hidden", equals: "false", session: "com.test@1234" }, exec);
    const assertCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "assert");
    const args = assertCalls[0][1];
    expect(args).toContain("--key");
    expect(args[args.indexOf("--key") + 1]).toBe("hidden");
    expect(args).toContain("--equals");
    expect(args[args.indexOf("--equals") + 1]).toBe("false");
  });

  it("throws when neither equals nor contains provided", async () => {
    const exec = makeExec();
    await expect(
      uiAssert({ mode: "attr", locator: "#view", key: "hidden", session: "com.test@1234" } as Parameters<typeof uiAssert>[0], exec)
    ).rejects.toThrow("equals");
  });
});
