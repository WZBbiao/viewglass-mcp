import { describe, it, expect, vi } from "vitest";
import { uiInput } from "../tools/ui_input.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args.includes("list")) {
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    }
    return { stdout: "{}", stderr: "" };
  });
}

describe("uiInput", () => {
  it("calls input command with target locator", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiInput({ target: "#username", text: "hello", session: "com.test@1234" }, exec);
    const inputCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "input");
    expect(inputCalls.length).toBe(1);
    expect(inputCalls[0][1]).toContain("#username");
  });

  it("passes --text flag", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiInput({ target: "#username", text: "hello world", session: "com.test@1234" }, exec);
    const inputCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "input");
    const args = inputCalls[0][1];
    expect(args).toContain("--text");
    expect(args[args.indexOf("--text") + 1]).toBe("hello world");
  });

  it("returns ok:true with target and text", async () => {
    const exec = makeExec();
    const result = await uiInput({ target: "#search", text: "query", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.target).toBe("#search");
    expect(result.text).toBe("query");
  });

  it("passes --json flag", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiInput({ target: "#field", text: "test", session: "com.test@1234" }, exec);
    const inputCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "input");
    expect(inputCalls[0][1]).toContain("--json");
  });
});
