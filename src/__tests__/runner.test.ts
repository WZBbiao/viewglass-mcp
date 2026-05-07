import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { detectSession, resolveSession, parseJSON, runCLI } from "../runner.js";
import type { ExecFn, RunResult } from "../runner.js";

function makeExec(result: Partial<RunResult> | Error): ExecFn {
  return vi.fn().mockImplementation(async () => {
    if (result instanceof Error) throw result;
    return { stdout: "", stderr: "", ...result };
  });
}

async function withTempProject<T>(fn: (project: string) => Promise<T> | T): Promise<T> {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-runner-test-"));
  try {
    return await fn(project);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
}

describe("detectSession", () => {
  it("returns bundleId@port for first app", async () => {
    const exec = makeExec({ stdout: JSON.stringify([{ bundleIdentifier: "com.test.App", port: 47164 }]) });
    await withTempProject(async (project) => {
      expect(await detectSession(exec, project)).toBe("com.test.App@47164");
    });
  });

  it("prefers physical devices when auto-detecting without a deviceType override", async () => {
    const exec = makeExec({ stdout: JSON.stringify([
      { bundleIdentifier: "com.test.App", deviceType: "simulator", port: 47164 },
      { bundleIdentifier: "com.test.App", deviceType: "device", port: 47175 },
    ]) });
    await withTempProject(async (project) => {
      expect(await detectSession(exec, project)).toBe("com.test.App@47175");
    });
  });

  it("returns undefined when app list is empty", async () => {
    const exec = makeExec({ stdout: "[]" });
    expect(await detectSession(exec)).toBeUndefined();
  });

  it("returns undefined when binary throws", async () => {
    const exec = makeExec(new Error("ENOENT"));
    expect(await detectSession(exec)).toBeUndefined();
  });

  it("prefers configured bundleId from .viewglassmcp/config.yaml", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-config-"));
    const project = path.join(tempRoot, "project");
    fs.mkdirSync(path.join(project, ".viewglassmcp"), { recursive: true });
    fs.writeFileSync(
      path.join(project, ".viewglassmcp", "config.yaml"),
      'schemaVersion: 1\nsessionDefaults:\n  bundleId: "com.target.app"\n',
      'utf8'
    );
    const exec = makeExec({ stdout: JSON.stringify([
      { bundleIdentifier: "com.other.App", port: 1111 },
      { bundleIdentifier: "com.target.app", port: 2222 }
    ]) });
    expect(await detectSession(exec, project)).toBe("com.target.app@2222");
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("honors configured deviceType when multiple sessions match bundleId", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-config-"));
    const project = path.join(tempRoot, "project");
    fs.mkdirSync(path.join(project, ".viewglassmcp"), { recursive: true });
    fs.writeFileSync(
      path.join(project, ".viewglassmcp", "config.yaml"),
      'schemaVersion: 1\nsessionDefaults:\n  bundleId: "com.target.app"\n  deviceType: "simulator"\n',
      'utf8'
    );
    const exec = makeExec({ stdout: JSON.stringify([
      { bundleIdentifier: "com.target.app", deviceType: "device", port: 47175 },
      { bundleIdentifier: "com.target.app", deviceType: "simulator", port: 47165 },
    ]) });
    expect(await detectSession(exec, project)).toBe("com.target.app@47165");
    fs.rmSync(tempRoot, { recursive: true, force: true });
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
    await withTempProject(async (project) => {
      expect(await resolveSession(undefined, exec, project)).toBe("com.auto.App@9999");
    });
  });

  it("throws when no session and no app running", async () => {
    const exec = makeExec({ stdout: "[]" });
    await withTempProject(async (project) => {
      await expect(resolveSession(undefined, exec, project)).rejects.toThrow("No Viewglass session");
    });
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

  it("re-detects same bundle and retries once when a bundle@port session is stale", async () => {
    const staleError = Object.assign(new Error("Command failed"), {
      stderr: "Session not connected",
      code: 20,
    });
    const exec = vi.fn()
      .mockRejectedValueOnce(staleError)
      .mockResolvedValueOnce({
        stdout: JSON.stringify([
          { bundleIdentifier: "com.test.App", deviceType: "device", port: 47175 },
        ]),
        stderr: "",
      })
      .mockResolvedValueOnce({ stdout: "{\"ok\":true}", stderr: "" }) as unknown as ReturnType<typeof vi.fn> & ExecFn;

    const result = await runCLI(["hierarchy", "--json"], { session: "com.test.App@47164", exec });

    expect(result.stdout).toBe("{\"ok\":true}");
    expect(exec).toHaveBeenCalledTimes(3);
    expect(exec.mock.calls[0][1]).toEqual(["hierarchy", "--json", "--session", "com.test.App@47164"]);
    expect(exec.mock.calls[1][1]).toEqual(["apps", "list", "--json"]);
    expect(exec.mock.calls[2][1]).toEqual(["hierarchy", "--json", "--session", "com.test.App@47175"]);
  });

  it("re-detects and retries once after a true-device USB read timeout", async () => {
    const timeoutError = Object.assign(new Error("Command failed"), {
      stdout: JSON.stringify({ code: 72, error: true, message: "Protocol error: USB read timeout after 5.0s" }),
      code: 72,
    });
    const exec = vi.fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce({
        stdout: JSON.stringify([
          { bundleIdentifier: "com.test.App", deviceType: "device", port: 47175 },
        ]),
        stderr: "",
      })
      .mockResolvedValueOnce({ stdout: "{\"ok\":true}", stderr: "" }) as unknown as ReturnType<typeof vi.fn> & ExecFn;

    const result = await runCLI(["tap", "42", "--json"], { session: "com.test.App@47164", exec });

    expect(result.stdout).toBe("{\"ok\":true}");
    expect(exec).toHaveBeenCalledTimes(3);
    expect(exec.mock.calls[1][1]).toEqual(["apps", "list", "--json"]);
    expect(exec.mock.calls[2][1]).toEqual(["tap", "42", "--json", "--session", "com.test.App@47175"]);
  });

  it("does not retry non-session failures", async () => {
    const error = Object.assign(new Error("Unknown selector"), { stderr: "selector not found", code: 40 });
    const exec = vi.fn().mockRejectedValue(error) as unknown as ReturnType<typeof vi.fn> & ExecFn;

    await expect(runCLI(["invoke", "1", "missing"], { session: "com.test.App@47164", exec }))
      .rejects.toThrow("Unknown selector");
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
