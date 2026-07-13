import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { uiConnect } from "../tools/ui_connect.js";
import { DeviceAccessCoordinator } from "../device_access.js";
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

const SAME_BUNDLE_SIMULATORS: AppFixture[] = [
  {
    bundleIdentifier: "com.same.App",
    port: 47164,
    deviceType: "simulator" as const,
    deviceName: "iPhone 16",
  },
  {
    bundleIdentifier: "com.same.App",
    port: 47165,
    deviceType: "simulator" as const,
    deviceName: "ViewglassMCP E2E",
  },
];

function makeExec(apps: AppFixture[], error?: Error): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, _args: string[]) => {
    if (error) throw error;
    return { stdout: JSON.stringify(apps), stderr: "" };
  });
}

async function withTempProject<T>(fn: (project: string) => Promise<T> | T): Promise<T> {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-connect-test-"));
  try {
    return await fn(project);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
}

describe("uiConnect", () => {
  it("does not persist a busy device as the project default", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-connect-busy-"));
    const project = path.join(root, "project");
    const leaseDirectory = path.join(root, "leases");
    const first = new DeviceAccessCoordinator({ leaseDirectory, installLifecycleHooks: false });
    const second = new DeviceAccessCoordinator({ leaseDirectory, installLifecycleHooks: false });
    const app = SAME_BUNDLE_APPS[1];
    try {
      await first.runForApp(app, SAME_BUNDLE_APPS, project, async () => undefined);
      await expect(uiConnect(
        { bundleId: "com.same.App", deviceIdentifier: "UDID-DEVICE" },
        makeExec(SAME_BUNDLE_APPS),
        project,
        second
      )).rejects.toThrow("already connected");
      expect(fs.existsSync(path.join(project, ".viewglassmcp", "config.yaml"))).toBe(false);
    } finally {
      await first.releaseAll();
      await second.releaseAll();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns session for exact bundleId match", async () => {
    const exec = makeExec(APPS);
    await withTempProject(async (project) => {
      const result = await uiConnect({ bundleId: "com.myapp.FooApp" }, exec, project);
      expect(result.session).toBe("com.myapp.FooApp@5678");
      expect(result.bundleId).toBe("com.myapp.FooApp");
      expect(result.port).toBe(5678);
      expect(result.deviceType).toBe("device");
      expect(result.deviceName).toBe("iPhone");
      expect(result.deviceIdentifier).toBe("UDID-1");
      expect(result.serverVersion).toBe("1.2.3");
    });
  });

  it("uses a 30s timeout when listing running apps", async () => {
    const exec = makeExec(APPS) as ReturnType<typeof vi.fn>;
    await withTempProject(async (project) => {
      await uiConnect({ bundleId: "com.myapp.FooApp" }, exec, project);
      expect(exec.mock.calls[0]?.[2]).toEqual({ timeout: 30_000 });
    });
  });

  it("returns session for partial bundleId match", async () => {
    const exec = makeExec(APPS);
    await withTempProject(async (project) => {
      const result = await uiConnect({ bundleId: "FooApp" }, exec, project);
      expect(result.session).toBe("com.myapp.FooApp@5678");
    });
  });

  it("partial match is case-insensitive", async () => {
    const exec = makeExec(APPS);
    await withTempProject(async (project) => {
      const result = await uiConnect({ bundleId: "fooapp" }, exec, project);
      expect(result.session).toBe("com.myapp.FooApp@5678");
    });
  });

  it("prefers exact match over partial match", async () => {
    const exec = makeExec(APPS);
    await withTempProject(async (project) => {
      const result = await uiConnect({ bundleId: "com.wzb.ViewglassDemo" }, exec, project);
      expect(result.session).toBe("com.wzb.ViewglassDemo@1234");
    });
  });

  it("does not guess when the same bundle is running on multiple targets", async () => {
    const exec = makeExec(SAME_BUNDLE_APPS);
    await withTempProject(async (project) => {
      await expect(uiConnect({ bundleId: "com.same.App" }, exec, project)).rejects.toThrow(
        "Multiple sessions match this bundle"
      );
      await expect(uiConnect({ bundleId: "com.same.App" }, exec, project)).rejects.toThrow(
        "com.same.App@47164"
      );
      await expect(uiConnect({ bundleId: "com.same.App" }, exec, project)).rejects.toThrow(
        "com.same.App@47175"
      );
    });
  });

  it("honors explicit simulator deviceType for same-bundle matches", async () => {
    const exec = makeExec(SAME_BUNDLE_APPS);
    await withTempProject(async (project) => {
      const result = await uiConnect({ bundleId: "com.same.App", deviceType: "simulator" }, exec, project);
      expect(result.session).toBe("com.same.App@47164");
      expect(result.deviceType).toBe("simulator");
    });
  });

  it("does not guess when deviceType still leaves multiple same-bundle simulators", async () => {
    const exec = makeExec(SAME_BUNDLE_SIMULATORS);
    await withTempProject(async (project) => {
      await expect(uiConnect({ bundleId: "com.same.App", deviceType: "simulator" }, exec, project)).rejects.toThrow(
        "Multiple sessions match this bundle"
      );
      await expect(uiConnect({ bundleId: "com.same.App", deviceType: "simulator" }, exec, project)).rejects.toThrow(
        "deviceName"
      );
    });
  });

  it("honors explicit deviceName for multiple same-bundle simulators", async () => {
    const exec = makeExec(SAME_BUNDLE_SIMULATORS);
    await withTempProject(async (project) => {
      const result = await uiConnect({
        bundleId: "com.same.App",
        deviceType: "simulator",
        deviceName: "ViewglassMCP E2E",
      }, exec, project);
      expect(result.session).toBe("com.same.App@47165");
      expect(result.deviceType).toBe("simulator");
      expect(result.deviceName).toBe("ViewglassMCP E2E");
    });
  });

  it("honors explicit deviceIdentifier for same-bundle matches", async () => {
    const exec = makeExec(SAME_BUNDLE_APPS);
    await withTempProject(async (project) => {
      const result = await uiConnect({ bundleId: "com.same.App", deviceIdentifier: "UDID-DEVICE" }, exec, project);
      expect(result.session).toBe("com.same.App@47175");
      expect(result.deviceType).toBe("device");
      expect(result.deviceIdentifier).toBe("UDID-DEVICE");
    });
  });

  it("honors explicit port for same-bundle matches", async () => {
    const exec = makeExec(SAME_BUNDLE_APPS);
    await withTempProject(async (project) => {
      const result = await uiConnect({ bundleId: "com.same.App", port: 47164 }, exec, project);
      expect(result.session).toBe("com.same.App@47164");
      expect(result.deviceType).toBe("simulator");
    });
  });

  it("honors explicit session for same-bundle matches", async () => {
    const exec = makeExec(SAME_BUNDLE_APPS);
    await withTempProject(async (project) => {
      const result = await uiConnect({ bundleId: "com.same.App", session: "com.same.App@47175" }, exec, project);
      expect(result.session).toBe("com.same.App@47175");
      expect(result.deviceType).toBe("device");
    });
  });

  it("rejects a mismatched explicit session", async () => {
    const exec = makeExec(SAME_BUNDLE_APPS);
    await withTempProject(async (project) => {
      await expect(uiConnect({ bundleId: "com.same.App", session: "com.other.App@47175" }, exec, project)).rejects.toThrow(
        "does not match requested bundle"
      );
    });
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

  it("uses configured deviceIdentifier before stale last-known session", async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-connect-stale-session-"));
    fs.mkdirSync(path.join(project, ".viewglassmcp"), { recursive: true });
    fs.writeFileSync(
      path.join(project, ".viewglassmcp", "config.yaml"),
      'schemaVersion: 1\nsessionDefaults:\n  bundleId: "com.same.App"\n  session: "com.same.App@49999"\n  port: 49999\n  deviceIdentifier: "UDID-DEVICE"\n'
    );

    const exec = makeExec(SAME_BUNDLE_APPS);
    const result = await uiConnect({ bundleId: "com.same.App" }, exec, project);
    expect(result.session).toBe("com.same.App@47175");
    expect(result.deviceIdentifier).toBe("UDID-DEVICE");
  });

  it("throws ambiguity when configured last-known session is stale and no stable selector remains", async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-connect-stale-only-"));
    fs.mkdirSync(path.join(project, ".viewglassmcp"), { recursive: true });
    fs.writeFileSync(
      path.join(project, ".viewglassmcp", "config.yaml"),
      'schemaVersion: 1\nsessionDefaults:\n  bundleId: "com.same.App"\n  session: "com.same.App@49999"\n  port: 49999\n'
    );

    const exec = makeExec(SAME_BUNDLE_APPS);
    await expect(uiConnect({ bundleId: "com.same.App" }, exec, project)).rejects.toThrow(
      "Multiple sessions match this bundle"
    );
  });

  it("does not silently fall back when requested deviceType is unavailable", async () => {
    const exec = makeExec([{ bundleIdentifier: "com.same.App", port: 47164, deviceType: "simulator" as const }]);
    await withTempProject(async (project) => {
      await expect(uiConnect({ bundleId: "com.same.App", deviceType: "device" }, exec, project)).rejects.toThrow(
        "Applied selectors: deviceType=device"
      );
    });
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
    expect(fs.readFileSync(configPath, "utf8")).toContain('session: "com.myapp.FooApp@5678"');
    expect(fs.readFileSync(configPath, "utf8")).toContain("port: 5678");
    expect(fs.readFileSync(configPath, "utf8")).toContain('deviceType: "device"');
    expect(fs.readFileSync(configPath, "utf8")).toContain('deviceIdentifier: "UDID-1"');
  });

  it("throws with available list when app not found", async () => {
    const exec = makeExec(APPS);
    await withTempProject(async (project) => {
      await expect(uiConnect({ bundleId: "com.unknown.App" }, exec, project)).rejects.toThrow("com.wzb.ViewglassDemo");
      await expect(uiConnect({ bundleId: "com.unknown.App" }, exec, project)).rejects.toThrow("com.myapp.FooApp");
    });
  });

  it("throws with 'none' when no apps are running", async () => {
    const exec = makeExec([]);
    await withTempProject(async (project) => {
      await expect(uiConnect({ bundleId: "com.any.App" }, exec, project)).rejects.toThrow("none");
    });
  });

  it("throws when CLI fails", async () => {
    const exec = makeExec(APPS, new Error("binary not found"));
    await withTempProject(async (project) => {
      await expect(uiConnect({ bundleId: "com.any.App" }, exec, project)).rejects.toThrow(
        "Failed to list running apps"
      );
      await expect(uiConnect({ bundleId: "com.any.App" }, exec, project)).rejects.toThrow(
        "Underlying error: binary not found"
      );
      await expect(uiConnect({ bundleId: "com.any.App" }, exec, project)).rejects.toThrow(
        "VIEWGLASS_BIN"
      );
    });
  });
});
