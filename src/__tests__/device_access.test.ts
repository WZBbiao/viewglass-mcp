import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DeviceAccessCoordinator,
  DeviceLeaseConflictError,
} from "../device_access.js";
import { currentDeviceExecution } from "../device_context.js";
import { resolveSession } from "../runner.js";
import { deviceKeyOf } from "../session_select.js";
import type { RunningApp } from "../session_select.js";

const tempRoots: string[] = [];
const coordinators: DeviceAccessCoordinator[] = [];

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-device-access-"));
  tempRoots.push(root);
  return root;
}

function coordinator(root: string, maxQueueDepth = 8): DeviceAccessCoordinator {
  const value = new DeviceAccessCoordinator({
    leaseDirectory: path.join(root, "leases"),
    maxQueueDepth,
    installLifecycleHooks: false,
  });
  coordinators.push(value);
  return value;
}

const SIMULATOR: RunningApp = {
  bundleIdentifier: "com.example.App",
  port: 47164,
  deviceType: "simulator",
  deviceName: "Viewglass Test",
  deviceIdentifier: "SIM-UDID-1",
};

const OTHER_DEVICE: RunningApp = {
  bundleIdentifier: "com.example.App",
  port: 47175,
  deviceType: "device",
  deviceName: "iPhone",
  deviceIdentifier: "DEVICE-UDID-2",
};

afterEach(async () => {
  await Promise.all(coordinators.splice(0).map((value) => value.releaseAll()));
  tempRoots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

describe("device identity", () => {
  it("uses stable deviceIdentifier instead of volatile session or port", () => {
    expect(deviceKeyOf(SIMULATOR)).toBe("id:sim-udid-1");
    expect(deviceKeyOf({ ...SIMULATOR, bundleIdentifier: "com.other", port: 49999 }))
      .toBe("id:sim-udid-1");
  });

  it("falls back conservatively when an older CLI omits the identifier", () => {
    expect(deviceKeyOf({
      bundleIdentifier: "com.example.App",
      port: 47164,
      deviceType: "simulator",
      deviceName: "Named Simulator",
    })).toBe("fallback:simulator:named simulator");
  });
});

describe("exclusive device lease", () => {
  it("lets discovery scan while another agent owns the device without acquiring a lease", async () => {
    const root = tempRoot();
    const owner = coordinator(root);
    const scanner = coordinator(root);
    const contender = coordinator(root);
    await owner.runForApp(SIMULATOR, [SIMULATOR], root, async () => undefined);

    await expect(scanner.runTool("ui_scan", {}, async () => "scanned", vi.fn(), root))
      .resolves.toBe("scanned");
    await expect(contender.runForApp(SIMULATOR, [SIMULATOR], root, async () => undefined))
      .rejects.toBeInstanceOf(DeviceLeaseConflictError);
  });

  it("rejects a second agent and points it at another discovered instance", async () => {
    const root = tempRoot();
    const first = coordinator(root);
    const second = coordinator(root);
    await first.runForApp(SIMULATOR, [SIMULATOR, OTHER_DEVICE], root, async () => undefined);

    await expect(second.runForApp(SIMULATOR, [SIMULATOR, OTHER_DEVICE], root, async () => undefined))
      .rejects.toMatchObject({ name: "DeviceLeaseConflictError", code: "VIEWGLASS_DEVICE_LEASED" });
    await expect(second.runForApp(SIMULATOR, [SIMULATOR, OTHER_DEVICE], root, async () => undefined))
      .rejects.toThrow("DEVICE-UDID-2");
  });

  it("lets another agent acquire after the owner releases", async () => {
    const root = tempRoot();
    const first = coordinator(root);
    const second = coordinator(root);
    await first.runForApp(SIMULATOR, [SIMULATOR], root, async () => undefined);
    await first.releaseAll();

    const result = await second.runForApp(SIMULATOR, [SIMULATOR], root, async () => "acquired");
    expect(result).toBe("acquired");
  });

  it("allows two agents to control different devices", async () => {
    const root = tempRoot();
    const first = coordinator(root);
    const second = coordinator(root);

    expect(await first.runForApp(SIMULATOR, [SIMULATOR, OTHER_DEVICE], root, async () => "sim")).toBe("sim");
    expect(await second.runForApp(OTHER_DEVICE, [SIMULATOR, OTHER_DEVICE], root, async () => "device")).toBe("device");
  });
});

describe("same-agent serialization", () => {
  it("runs concurrent operations sequentially and exposes the resolved session context", async () => {
    const root = tempRoot();
    const access = coordinator(root);
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = access.runForApp(SIMULATOR, [SIMULATOR], root, async () => {
      events.push("first:start");
      expect(currentDeviceExecution()?.session).toBe("com.example.App@47164");
      await firstGate;
      events.push("first:end");
    });
    const second = access.runForApp(SIMULATOR, [SIMULATOR], root, async () => {
      events.push("second:start");
      events.push("second:end");
    });

    await vi.waitFor(() => expect(events).toEqual(["first:start"]));
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("rejects queue overflow instead of building an unbounded backlog", async () => {
    const root = tempRoot();
    const access = coordinator(root, 2);
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = access.runForApp(SIMULATOR, [SIMULATOR], root, async () => firstGate);
    const second = access.runForApp(SIMULATOR, [SIMULATOR], root, async () => undefined);

    await expect(access.runForApp(SIMULATOR, [SIMULATOR], root, async () => undefined))
      .rejects.toThrow("Too many queued Viewglass operations");
    releaseFirst();
    await Promise.all([first, second]);
  });

  it("gates tools that skip ui_connect and avoids a second auto-detection scan", async () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, ".viewglassmcp"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".viewglassmcp", "config.yaml"),
      'schemaVersion: 1\nsessionDefaults:\n  bundleId: "com.example.App"\n  deviceIdentifier: "SIM-UDID-1"\n'
    );
    const access = coordinator(root);
    const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify([SIMULATOR]), stderr: "" });

    const session = await access.runTool("ui_snapshot", {}, async () => resolveSession(undefined, exec, root), exec, root);
    expect(session).toBe("com.example.App@47164");
    expect(exec).toHaveBeenCalledTimes(1);
  });
});

it("exposes a typed contention error", () => {
  expect(new DeviceLeaseConflictError("busy").code).toBe("VIEWGLASS_DEVICE_LEASED");
});
