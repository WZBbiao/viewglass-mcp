import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { uiConnect } from "../tools/ui_connect.js";
import type { ExecFn } from "../runner.js";

type AppFixture = {
  bundleIdentifier: string;
  port: number;
  deviceType?: "device" | "simulator";
  deviceName?: string;
  deviceIdentifier?: string;
  serverVersion?: string;
};

const APPS: AppFixture[] = [
  { bundleIdentifier: "com.wzb.ViewglassDemo", port: 1234, deviceType: "simulator" as const },
  {
    bundleIdentifier: "com.myapp.FooApp",
    port: 5678,
    deviceType: "device" as const,
    deviceName: "iPhone",
    deviceIdentifier: "UDID-1",
    serverVersion: "1.2.3",
  },
];

const SAME_BUNDLE_APPS: AppFixture[] = [
  {
    bundleIdentifier: "com.same.App",
    port: 47164,
    deviceType: "simulator" as const,
    deviceName: "iPhone 17",
  },
  {
    bundleIdentifier: "com.same.App",
    port: 47175,
    deviceType: "device" as const,
    deviceName: "iPhone",
    deviceIdentifier: "UDID-DEVICE",
  },
];

function makeExec(apps: AppFixture[], error?: Error): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, _args: string[]) => {
    if (error) throw error;
    return { stdout: JSON.stringify(apps), stderr: "" };
  });
}

describe("uiConnect", () => {
  it("returns session for exact bundleId match", async () => {
    const exec = makeExec(APPS);
    const result = await uiConnect({ bundleId: "com.myapp.FooApp" }, exec);
    expect(result.session).toBe("com.myapp.FooApp@5678");
    expect(result.bundleId).toBe("com.myapp.FooApp");
    expect(result.port).toBe(5678);
    expect(result.deviceType).toBe("device");
    expect(result.deviceName).toBe("iPhone");
    expect(result.deviceIdentifier).toBe("UDID-1");
    expect(result.serverVersion).toBe("1.2.3");
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

  it("prefers physical device when the same bundle is running on simulator and device", async () => {
    const exec = makeExec(SAME_BUNDLE_APPS);
    const result = await uiConnect({ bundleId: "com.same.App" }, exec);
    expect(result.session).toBe("com.same.App@47175");
    expect(result.deviceType).toBe("device");
    expect(result.deviceIdentifier).toBe("UDID-DEVICE");
  });

  it("honors explicit simulator deviceType for same-bundle matches", async () => {
    const exec = makeExec(SAME_BUNDLE_APPS);
    const result = await uiConnect({ bundleId: "com.same.App", deviceType: "simulator" }, exec);
    expect(result.session).toBe("com.same.App@47164");
    expect(result.deviceType).toBe("simulator");
  });

  it("honors configured deviceType for same-bundle matches", async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-connect-device-type-"));
    fs.mkdirSync(path.join(project, ".viewglassmcp"), { recursive: true });
    fs.writeFileSync(
      path.join(project, ".viewglassmcp", "config.yaml"),
      'schemaVersion: 1\nsessionDefaults:\n  bundleId: "com.same.App"\n  deviceType: "simulator"\n'
    );

    const exec = makeExec(SAME_BUNDLE_APPS);
    const result = await uiConnect({ bundleId: "com.same.App" }, exec, project);
    expect(result.session).toBe("com.same.App@47164");
    expect(result.deviceType).toBe("simulator");
  });

  it("does not silently fall back when requested deviceType is unavailable", async () => {
    const exec = makeExec([{ bundleIdentifier: "com.same.App", port: 47164, deviceType: "simulator" as const }]);
    await expect(uiConnect({ bundleId: "com.same.App", deviceType: "device" }, exec)).rejects.toThrow(
      "No device session matched"
    );
  });

  it("persists the resolved bundle id into .viewglassmcp/config.yaml", async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-connect-"));
    fs.mkdirSync(path.join(project, ".git"));

    const exec = makeExec(APPS);
    const result = await uiConnect({ bundleId: "FooApp" }, exec, project);
    expect(result.bundleId).toBe("com.myapp.FooApp");

    const configPath = path.join(project, ".viewglassmcp", "config.yaml");
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(configPath, "utf8")).toContain('bundleId: "com.myapp.FooApp"');
    expect(fs.readFileSync(configPath, "utf8")).toContain('deviceType: "device"');
  });

  it("throws with available list when app not found", async () => {
    const exec = makeExec(APPS);
    await expect(uiConnect({ bundleId: "com.unknown.App" }, exec)).rejects.toThrow("com.wzb.ViewglassDemo");
    await expect(uiConnect({ bundleId: "com.unknown.App" }, exec)).rejects.toThrow("com.myapp.FooApp");
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
