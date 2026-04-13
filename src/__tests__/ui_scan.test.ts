import { describe, it, expect, vi } from "vitest";
import { uiScan } from "../tools/ui_scan.js";
import type { ExecFn } from "../runner.js";

function makeExec(apps?: object[]): ExecFn {
  return vi.fn().mockImplementation(async () => {
    return { stdout: JSON.stringify(apps ?? []), stderr: "" };
  });
}

describe("uiScan", () => {
  it("returns sessions with bundleId, port, session string", async () => {
    const exec = makeExec([{ bundleIdentifier: "com.example.App", port: 47164 }]);
    const result = await uiScan(exec);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].bundleId).toBe("com.example.App");
    expect(result.sessions[0].port).toBe(47164);
    expect(result.sessions[0].session).toBe("com.example.App@47164");
  });

  it("returns empty sessions when no apps found", async () => {
    const exec = makeExec([]);
    const result = await uiScan(exec);
    expect(result.sessions).toHaveLength(0);
  });

  it("includes informative message when no sessions", async () => {
    const exec = makeExec([]);
    const result = await uiScan(exec);
    expect(result.message).toMatch(/No Viewglass sessions found/i);
  });

  it("includes found session count in message", async () => {
    const exec = makeExec([
      { bundleIdentifier: "com.foo", port: 47164 },
      { bundleIdentifier: "com.bar", port: 47165 },
    ]);
    const result = await uiScan(exec);
    expect(result.message).toMatch(/2/);
  });

  it("returns empty sessions when exec throws", async () => {
    const exec = vi.fn().mockRejectedValue(new Error("ENOENT"));
    const result = await uiScan(exec as ExecFn);
    expect(result.sessions).toHaveLength(0);
  });
});
