import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { uiConnect } from "../tools/ui_connect.js";
import type { ExecFn } from "../runner.js";

const APPS = [
  { bundleIdentifier: "com.wzb.ViewglassDemo", port: 1234 },
  { bundleIdentifier: "com.myapp.FooApp", port: 5678 },
];

function makeExec(apps: typeof APPS, error?: Error): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, _args: string[]) => {
    if (error) throw error;
    return { stdout: JSON.stringify(apps), stderr: "" };
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("uiConnect", () => {
  it("returns session for exact bundleId match", async () => {
    const exec = makeExec(APPS);
    const result = await uiConnect({ bundleId: "com.myapp.FooApp" }, exec);
    expect(result.session).toBe("com.myapp.FooApp@5678");
    expect(result.bundleId).toBe("com.myapp.FooApp");
    expect(result.port).toBe(5678);
  });

  it("returns session for partial bundleId match", async () => {
    const exec = makeExec(APPS);
    const result = await uiConnect({ bundleId: "FooApp" }, exec);
    expect(result.session).toBe("com.myapp.FooApp@5678");
  });

  it("partial match is case-insensitive", async () => {
    const exec = makeExec(APPS);
    const result = await uiConnect({ bundleId: "fooapp" }, exec);
    expect(result.session).toBe("com.myapp.FooApp@5678");
  });

  it("prefers exact match over partial match", async () => {
    const exec = makeExec(APPS);
    const result = await uiConnect({ bundleId: "com.wzb.ViewglassDemo" }, exec);
    expect(result.session).toBe("com.wzb.ViewglassDemo@1234");
  });

  it("persists the resolved bundle id into .viewglassmcp/config.yaml", async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-connect-"));
    fs.mkdirSync(path.join(project, ".git"));
    vi.stubEnv("PWD", project);
    process.chdir(project);

    const exec = makeExec(APPS);
    const result = await uiConnect({ bundleId: "FooApp" }, exec);
    expect(result.bundleId).toBe("com.myapp.FooApp");

    const configPath = path.join(project, ".viewglassmcp", "config.yaml");
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(configPath, "utf8")).toContain('bundleId: "com.myapp.FooApp"');
  });

  it("throws with available list when app not found", async () => {
    const exec = makeExec(APPS);
    await expect(uiConnect({ bundleId: "com.unknown.App" }, exec)).rejects.toThrow(
      "com.wzb.ViewglassDemo, com.myapp.FooApp"
    );
  });

  it("throws with 'none' when no apps are running", async () => {
    const exec = makeExec([]);
    await expect(uiConnect({ bundleId: "com.any.App" }, exec)).rejects.toThrow("none");
  });

  it("throws when CLI fails", async () => {
    const exec = makeExec(APPS, new Error("binary not found"));
    await expect(uiConnect({ bundleId: "com.any.App" }, exec)).rejects.toThrow(
      "Failed to list running apps"
    );
  });
});
