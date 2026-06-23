import { describe, it, expect, vi } from "vitest";
import { uiInput } from "../tools/ui_input.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args[0] === "query") {
      if (args[1] === "#primary_text_field") {
        return { stdout: JSON.stringify([{ oid: 75, primaryOid: 75 }]), stderr: "" };
      }
      return { stdout: "[]", stderr: "" };
    }
    if (args[0] === "hierarchy") {
      return {
        stdout: JSON.stringify({
          appInfo: { appName: "FixtureApp", bundleIdentifier: "com.test", serverVersion: "0.1.0" },
          fetchedAt: "2026-04-15T10:00:00Z",
          screenScale: 3,
          screenSize: { x: 0, y: 0, width: 390, height: 844 },
          snapshotId: "snap-input",
          windows: [],
        }),
        stderr: "",
      };
    }
    return { stdout: "", stderr: "" };
  });
}

describe("uiInput", () => {
  it("calls input command with oid", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiInput({ oid: "75", text: "hello", session: "com.test@1234" }, exec);
    const inputCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "input");
    expect(inputCalls.length).toBe(1);
    expect(inputCalls[0][1]).toContain("75");
  });

  it("resolves locator before input", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    const result = await uiInput({ locator: "primary_text_field", text: "hello", session: "com.test@1234" }, exec);
    const inputCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "input");
    expect(inputCalls[0][1]).toContain("75");
    expect(result).toEqual(expect.objectContaining({
      oid: "75",
      locator: "primary_text_field",
      matchedBy: "query fallback",
      candidateCount: 1,
    }));
  });

  it("passes --text flag", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiInput({ oid: "75", text: "hello world", session: "com.test@1234" }, exec);
    const inputCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "input");
    const args = inputCalls[0][1];
    expect(args).toContain("--text");
    expect(args[args.indexOf("--text") + 1]).toBe("hello world");
  });

  it("returns ok:true with oid and text", async () => {
    const exec = makeExec();
    const result = await uiInput({ oid: "75", text: "query", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.oid).toBe("75");
    expect(result.text).toBe("query");
  });

  it("passes --json flag", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiInput({ oid: "75", text: "test", session: "com.test@1234" }, exec);
    const inputCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "input");
    expect(inputCalls[0][1]).toContain("--json");
  });

  it("rejects missing target", async () => {
    const exec = makeExec();
    await expect(uiInput({ text: "test", session: "com.test@1234" }, exec)).rejects.toThrow(
      "ui_input requires either 'locator' or 'oid'"
    );
  });
});
