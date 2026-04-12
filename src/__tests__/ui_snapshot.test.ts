import { describe, it, expect, vi } from "vitest";
import { uiSnapshot } from "../tools/ui_snapshot.js";
import type { ExecFn } from "../runner.js";

function makeExec(stdout: string, error?: Error): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (error) throw error;
    // Detect apps list call vs actual command
    if (args.includes("list")) return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    return { stdout, stderr: "" };
  });
}

describe("uiSnapshot", () => {
  it("calls hierarchy --json with session", async () => {
    const exec = makeExec('{"windows":[]}') as ReturnType<typeof vi.fn>;
    await uiSnapshot({ session: "com.test@1234" }, exec);
    const call = exec.mock.calls.find((c: unknown[]) => (c[1] as string[]).includes("hierarchy")) as [string, string[], unknown] | undefined;
    expect(call).toBeDefined();
    expect(call![1]).toContain("hierarchy");
    expect(call![1]).toContain("--json");
    expect(call![1]).toContain("--session");
    expect(call![1]).toContain("com.test@1234");
  });

  it("appends --filter when provided", async () => {
    const exec = makeExec('{"windows":[]}') as ReturnType<typeof vi.fn>;
    await uiSnapshot({ session: "com.test@1234", filter: "UILabel" }, exec);
    const call = exec.mock.calls.find((c: unknown[]) => (c[1] as string[]).includes("hierarchy")) as [string, string[], unknown] | undefined;
    expect(call![1]).toContain("--filter");
    expect(call![1]).toContain("UILabel");
  });

  it("omits --filter when not provided", async () => {
    const exec = makeExec('{"windows":[]}') as ReturnType<typeof vi.fn>;
    await uiSnapshot({ session: "com.test@1234" }, exec);
    const call = exec.mock.calls.find((c: unknown[]) => (c[1] as string[]).includes("hierarchy")) as [string, string[], unknown] | undefined;
    expect(call![1]).not.toContain("--filter");
  });

  it("parses and returns hierarchy JSON", async () => {
    const hierarchy = { windows: [{ node: { className: "UIWindow" }, children: [] }] };
    const exec = makeExec(JSON.stringify(hierarchy));
    const result = await uiSnapshot({ session: "com.test@1234" }, exec);
    expect(result).toEqual(hierarchy);
  });

  it("auto-detects session when not provided", async () => {
    const exec = makeExec('{"windows":[]}') as ReturnType<typeof vi.fn>;
    await uiSnapshot({}, exec); // no session
    const appsCalls = exec.mock.calls.filter((c: unknown[]) => (c[1] as string[]).includes("list"));
    expect(appsCalls.length).toBe(1); // detectSession was called
  });

  it("throws when CLI returns invalid JSON", async () => {
    const exec = makeExec("not json");
    await expect(uiSnapshot({ session: "com.test@1234" }, exec)).rejects.toThrow(
      "Failed to parse JSON from 'ui_snapshot'"
    );
  });
});
