#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const mode = process.argv[2];

const app = {
  bundleIdentifier: "com.example.LeaseRace",
  port: 47164,
  deviceType: "simulator",
  deviceName: "Lease Race Simulator",
  deviceIdentifier: "LEASE-RACE-UDID",
};

if (mode === "--worker") {
  const leaseDirectory = process.argv[3];
  const holdMs = Number(process.argv[4] ?? 500);
  const deviceIdentifier = process.argv[5] ?? app.deviceIdentifier;
  const { DeviceAccessCoordinator } = await import("../dist/device_access.js");
  const access = new DeviceAccessCoordinator({
    leaseDirectory,
    staleMs: 5_000,
    updateMs: 1_000,
    installLifecycleHooks: false,
  });
  const target = { ...app, deviceIdentifier, port: deviceIdentifier === app.deviceIdentifier ? 47164 : 47175 };
  try {
    await access.runForApp(target, [target], process.cwd(), async () => {
      process.stdout.write("ACQUIRED\n");
      await new Promise((resolve) => setTimeout(resolve, holdMs));
    });
    await access.releaseAll();
    process.exit(0);
  } catch (error) {
    if (error?.code === "VIEWGLASS_DEVICE_LEASED") {
      process.stdout.write("BUSY\n");
      process.exit(0);
    }
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exit(1);
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-lease-race-"));
const leaseDirectory = path.join(root, "leases");

function worker({ holdMs = 500, deviceIdentifier = app.deviceIdentifier } = {}) {
  const child = spawn(process.execPath, [scriptPath, "--worker", leaseDirectory, String(holdMs), deviceIdentifier], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  return { child, completed, output: () => stdout };
}

async function waitForOutput(handle, text, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!handle.output().includes(text)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${text}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

try {
  const racers = Array.from({ length: 8 }, () => worker({ holdMs: 1_000 }));
  const raceResults = await Promise.all(racers.map((handle) => handle.completed));
  const acquired = raceResults.filter((result) => result.stdout.includes("ACQUIRED"));
  const busy = raceResults.filter((result) => result.stdout.includes("BUSY"));
  if (raceResults.some((result) => result.code !== 0) || acquired.length !== 1 || busy.length !== 7) {
    throw new Error(`Expected one winner and seven busy results: ${JSON.stringify(raceResults)}`);
  }

  const firstDevice = worker({ holdMs: 500, deviceIdentifier: "DEVICE-A" });
  const secondDevice = worker({ holdMs: 500, deviceIdentifier: "DEVICE-B" });
  const distinctResults = await Promise.all([firstDevice.completed, secondDevice.completed]);
  if (distinctResults.some((result) => result.code !== 0 || !result.stdout.includes("ACQUIRED"))) {
    throw new Error(`Different devices did not acquire concurrently: ${JSON.stringify(distinctResults)}`);
  }

  const crashedOwner = worker({ holdMs: 60_000 });
  await waitForOutput(crashedOwner, "ACQUIRED");
  crashedOwner.child.kill("SIGKILL");
  await crashedOwner.completed;
  await new Promise((resolve) => setTimeout(resolve, 6_000));
  const successor = await worker({ holdMs: 10 }).completed;
  if (successor.code !== 0 || !successor.stdout.includes("ACQUIRED")) {
    throw new Error(`Lease was not recovered after owner crash: ${JSON.stringify(successor)}`);
  }

  process.stdout.write("device lease race: 1 winner, 7 rejected; distinct devices concurrent; crash recovery passed\n");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
