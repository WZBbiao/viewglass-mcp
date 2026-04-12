import { describe, it, expect, vi } from "vitest";
import { detectSession, resolveSession, parseJSON, runCLI } from "../runner.js";
import type { ExecFn, RunResult } from "../runner.js";

function makeExec(result: Partial<RunResult> | Error): ExecFn {
  return vi.fn().mockImplementation(async () => {
    if (result instanceof Error) throw result;
    return { stdout: "", stderr: "", ...result };
  });
}

describe("detectSession", () => {
  it("returns bundleId@port for first app", async () => {
    const exec = makeExec({ stdout: JSON.stringify([{ bundleIdentifier: "com.test.App", port: 47164 }]) });
    expect(await detectSession(exec)).toBe("com.test.App@47164");
  });

  it("returns undefined when app list is empty", async () => {
    const exec = makeExec({ stdout: "[]" });
    expect(await detectSession(exec)).toBeUndefined();
  });

  it("returns undefined when binary throws", async () => {
    const exec = makeExec(new Error("ENOENT"));
    expect(await detectSession(exec)).toBeUndefined();
  });
});

describe("resolveSession", () => {
  it("returns provided session without calling exec", async () => {
    const exec = makeExec({ stdout: "[]" });
    expect(await resolveSession("com.foo@1234", exec)).toBe("com.foo@1234");
    expect(exec).not.toHaveBeenCalled();
  });

  it("auto-detects when no session provided", async () => {
    const exec = makeExec({ stdout: JSON.stringify([{ bundleIdentifier: "com.auto.App", port: 9999 }]) });
    expect(await resolveSession(undefined, exec)).toBe("com.auto.App@9999");
  });

  it("throws when no session and no app running", async () => {
    const exec = makeExec({ stdout: "[]" });
    await expect(resolveSession(undefined, exec)).rejects.toThrow("No Viewglass session");
  });
});

describe("parseJSON", () => {
  it("parses valid JSON", () => {
    expect(parseJSON<{ a: number }>('{"a":1}', "test")).toEqual({ a: 1 });
  });

  it("throws on invalid JSON with command context", () => {
    expect(() => parseJSON("not json", "ui_snapshot")).toThrow(
      "Failed to parse JSON from 'ui_snapshot'"
    );
  });
});

describe("runCLI", () => {
  it("passes session as --session arg", async () => {
    const exec = makeExec({ stdout: "{}" }) as ReturnType<typeof vi.fn>;
    await runCLI(["hierarchy", "--json"], { session: "com.test@1234", exec });
    const call = exec.mock.calls[0] as [string, string[], { timeout: number }];
    expect(call[1]).toContain("--session");
    expect(call[1]).toContain("com.test@1234");
  });

  it("omits --session when not provided", async () => {
    const exec = makeExec({ stdout: "{}" }) as ReturnType<typeof vi.fn>;
    await runCLI(["apps", "list", "--json"], { exec });
    const call = exec.mock.calls[0] as [string, string[], { timeout: number }];
    expect(call[1]).not.toContain("--session");
  });
});
