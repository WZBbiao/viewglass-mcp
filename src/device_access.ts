import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import lockfile from "proper-lockfile";

import { runWithDeviceContext } from "./device_context.js";
import { loadProjectConfig } from "./project_config.js";
import { VIEWGLASS_BIN, defaultExec, parseJSON } from "./runner.js";
import type { ExecFn } from "./runner.js";
import {
  compactSelectors,
  deviceKeyOf,
  formatAppCandidate,
  selectByConfigFallback,
  sessionOf,
} from "./session_select.js";
import type { DeviceType, RunningApp, SessionSelector } from "./session_select.js";

const DISCOVERY_TIMEOUT_MS = 30_000;
const DISCOVERY_CACHE_MS = 2_000;
const DEFAULT_STALE_MS = 15_000;
const DEFAULT_UPDATE_MS = 5_000;
const MAX_DEVICE_QUEUE_DEPTH = 8;
const UNGATED_TOOLS = new Set(["ui_feedback", "ui_connect", "ui_scan"]);

export interface DeviceLeaseOwner {
  version: 1;
  ownerToken: string;
  pid: number;
  parentPid: number;
  hostname: string;
  projectCwd: string;
  session: string;
  deviceKey: string;
  deviceType?: string;
  deviceName?: string;
  deviceIdentifier?: string;
  acquiredAt: string;
}

export interface DeviceLeaseSummary {
  exclusive: true;
  deviceKey: string;
  ownerPid: number;
  acquiredAt: string;
}

interface HeldLease {
  owner: DeviceLeaseOwner;
  metadataPath: string;
  release: () => Promise<void>;
}

interface DeviceAccessOptions {
  leaseDirectory?: string;
  staleMs?: number;
  updateMs?: number;
  maxQueueDepth?: number;
  installLifecycleHooks?: boolean;
}

interface QueueState {
  tail: Promise<void>;
  depth: number;
}

export class DeviceAccessError extends Error {}

export class DeviceLeaseConflictError extends DeviceAccessError {
  readonly code = "VIEWGLASS_DEVICE_LEASED";

  constructor(message: string) {
    super(message);
    this.name = "DeviceLeaseConflictError";
  }
}

export class DeviceQueueOverflowError extends DeviceAccessError {
  readonly code = "VIEWGLASS_DEVICE_QUEUE_FULL";

  constructor(message: string) {
    super(message);
    this.name = "DeviceQueueOverflowError";
  }
}

export class DeviceAccessTargetError extends DeviceAccessError {
  readonly code = "VIEWGLASS_DEVICE_TARGET_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "DeviceAccessTargetError";
  }
}

class DeviceOperationQueue {
  private readonly states = new Map<string, QueueState>();

  constructor(private readonly maxDepth: number) {}

  async runExclusive<T>(deviceKey: string, run: () => Promise<T>): Promise<T> {
    const state = this.states.get(deviceKey) ?? { tail: Promise.resolve(), depth: 0 };
    if (state.depth >= this.maxDepth) {
      throw new DeviceQueueOverflowError(
        `Too many queued Viewglass operations for ${deviceKey}. ` +
          `At most ${this.maxDepth - 1} operations may wait behind the active operation; serialize tool calls and retry.`
      );
    }

    let releaseSlot!: () => void;
    const slot = new Promise<void>((resolve) => {
      releaseSlot = resolve;
    });
    const previous = state.tail.catch(() => undefined);
    state.tail = previous.then(() => slot);
    state.depth += 1;
    this.states.set(deviceKey, state);

    await previous;
    try {
      return await run();
    } finally {
      state.depth -= 1;
      releaseSlot();
      if (state.depth === 0) this.states.delete(deviceKey);
    }
  }
}

export class DeviceAccessCoordinator {
  private readonly leaseDirectory: string;
  private readonly staleMs: number;
  private readonly updateMs: number;
  private readonly ownerToken = randomUUID();
  private readonly held = new Map<string, HeldLease>();
  private readonly acquiring = new Map<string, Promise<HeldLease>>();
  private readonly queue: DeviceOperationQueue;
  private lifecycleHooksInstalled = false;
  private readonly shouldInstallLifecycleHooks: boolean;
  private discoveryTail: Promise<void> = Promise.resolve();
  private discoveryCache?: { fetchedAt: number; apps: RunningApp[] };

  constructor(options: DeviceAccessOptions = {}) {
    const configuredLeaseDirectory = process.env.VIEWGLASS_MCP_LEASE_DIR?.trim();
    this.leaseDirectory = options.leaseDirectory ??
      (configuredLeaseDirectory || path.join(os.homedir(), ".viewglass-mcp", "device-leases"));
    this.staleMs = options.staleMs ?? DEFAULT_STALE_MS;
    this.updateMs = options.updateMs ?? DEFAULT_UPDATE_MS;
    this.queue = new DeviceOperationQueue(options.maxQueueDepth ?? MAX_DEVICE_QUEUE_DEPTH);
    this.shouldInstallLifecycleHooks = options.installLifecycleHooks ?? true;
  }

  async runTool<T>(
    name: string,
    args: object,
    run: () => Promise<T>,
    exec: ExecFn = defaultExec,
    projectCwd: string = process.cwd()
  ): Promise<T> {
    if (UNGATED_TOOLS.has(name)) return run();

    const session = sessionFromArgs(args);
    const { app, apps } = await this.resolveToolTarget(session, exec, projectCwd);
    return this.runForApp(app, apps, projectCwd, run);
  }

  async runForApp<T>(
    app: RunningApp,
    allApps: RunningApp[],
    projectCwd: string,
    run: (lease: DeviceLeaseSummary) => Promise<T>
  ): Promise<T> {
    const key = deviceKeyOf(app);
    const session = sessionOf(app);
    const held = await this.acquire(app, allApps, session, projectCwd);
    const summary: DeviceLeaseSummary = {
      exclusive: true,
      deviceKey: key,
      ownerPid: held.owner.pid,
      acquiredAt: held.owner.acquiredAt,
    };

    return this.queue.runExclusive(key, () =>
      runWithDeviceContext({ session, deviceKey: key }, () => run(summary))
    );
  }

  async listRunningApps(exec: ExecFn = defaultExec, force = false): Promise<RunningApp[]> {
    if (exec === defaultExec && !force && this.discoveryCache && Date.now() - this.discoveryCache.fetchedAt < DISCOVERY_CACHE_MS) {
      return this.discoveryCache.apps;
    }

    let releaseDiscovery!: () => void;
    const slot = new Promise<void>((resolve) => {
      releaseDiscovery = resolve;
    });
    const previous = this.discoveryTail.catch(() => undefined);
    this.discoveryTail = previous.then(() => slot);
    await previous;
    try {
      if (exec === defaultExec && !force && this.discoveryCache && Date.now() - this.discoveryCache.fetchedAt < DISCOVERY_CACHE_MS) {
        return this.discoveryCache.apps;
      }
      const { stdout } = await exec(VIEWGLASS_BIN, ["apps", "list", "--json"], {
        timeout: DISCOVERY_TIMEOUT_MS,
      });
      const apps = parseJSON<RunningApp[]>(stdout, "apps list");
      if (exec === defaultExec) this.discoveryCache = { fetchedAt: Date.now(), apps };
      return apps;
    } finally {
      releaseDiscovery();
    }
  }

  async releaseAll(): Promise<void> {
    const leases = [...this.held.values()];
    this.held.clear();
    await Promise.allSettled(leases.map(async (lease) => {
      try {
        await lease.release();
      } finally {
        this.removeOwnedMetadata(lease.metadataPath, lease.owner.ownerToken);
      }
    }));
  }

  private async resolveToolTarget(
    explicitSession: string | undefined,
    exec: ExecFn,
    projectCwd: string
  ): Promise<{ app: RunningApp; apps: RunningApp[] }> {
    const apps = await this.listRunningApps(exec);
    if (explicitSession) {
      const app = apps.find((candidate) => sessionOf(candidate) === explicitSession);
      if (!app) {
        throw new DeviceAccessTargetError(
          `Viewglass session "${explicitSession}" is not currently available. ` +
            `Available sessions: ${apps.map(formatAppCandidate).join(", ") || "none"}.`
        );
      }
      return { app, apps };
    }

    const config = loadProjectConfig(projectCwd);
    const bundleId = config?.sessionDefaults?.bundleId?.trim();
    let candidates = apps;
    if (bundleId) {
      candidates = apps.filter((app) => app.bundleIdentifier === bundleId);
      const selected = selectByConfigFallback(candidates, selectorsFromConfig(config?.sessionDefaults));
      candidates = selected.candidates;
    }
    if (candidates.length !== 1) {
      throw new DeviceAccessTargetError(
        "No unambiguous Viewglass device target found. Call ui_connect with deviceIdentifier, deviceName, or deviceType first. " +
          `Available sessions: ${apps.map(formatAppCandidate).join(", ") || "none"}.`
      );
    }
    return { app: candidates[0], apps };
  }

  private async acquire(
    app: RunningApp,
    allApps: RunningApp[],
    session: string,
    projectCwd: string
  ): Promise<HeldLease> {
    const key = deviceKeyOf(app);
    const existing = this.held.get(key);
    if (existing) return existing;
    const pending = this.acquiring.get(key);
    if (pending) return pending;

    const acquisition = this.acquireOnce(app, allApps, session, projectCwd);
    this.acquiring.set(key, acquisition);
    try {
      return await acquisition;
    } finally {
      this.acquiring.delete(key);
    }
  }

  private async acquireOnce(
    app: RunningApp,
    allApps: RunningApp[],
    session: string,
    projectCwd: string
  ): Promise<HeldLease> {
    const key = deviceKeyOf(app);
    fs.mkdirSync(this.leaseDirectory, { recursive: true, mode: 0o700 });
    const digest = createHash("sha256").update(key).digest("hex");
    const resourcePath = path.join(this.leaseDirectory, `${digest}.device`);
    const metadataPath = `${resourcePath}.owner.json`;
    fs.closeSync(fs.openSync(resourcePath, "a", 0o600));

    let release: (() => Promise<void>) | undefined;
    try {
      release = await lockfile.lock(resourcePath, {
        realpath: false,
        retries: 0,
        stale: this.staleMs,
        update: this.updateMs,
        onCompromised: (error) => {
          this.held.delete(key);
          process.stderr.write(`[viewglass-mcp] Device lease compromised for ${key}: ${error.message}\n`);
        },
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ELOCKED") {
        throw new DeviceLeaseConflictError(this.formatConflict(app, allApps, metadataPath));
      }
      throw error;
    }

    const owner: DeviceLeaseOwner = {
      version: 1,
      ownerToken: this.ownerToken,
      pid: process.pid,
      parentPid: process.ppid,
      hostname: os.hostname(),
      projectCwd,
      session,
      deviceKey: key,
      deviceType: app.deviceType,
      deviceName: app.deviceName,
      deviceIdentifier: app.deviceIdentifier,
      acquiredAt: new Date().toISOString(),
    };

    try {
      writeJSONAtomic(metadataPath, owner);
    } catch (error) {
      await release();
      throw error;
    }

    const held = { owner, metadataPath, release };
    this.held.set(key, held);
    this.installLifecycleHooks();
    return held;
  }

  private formatConflict(app: RunningApp, allApps: RunningApp[], metadataPath: string): string {
    const owner = readOwner(metadataPath);
    const ownerDescription = owner
      ? `pid ${owner.pid}, project ${owner.projectCwd}, since ${owner.acquiredAt}`
      : "another active MCP agent";
    const key = deviceKeyOf(app);
    const alternatives = uniqueDevices(allApps.filter((candidate) => deviceKeyOf(candidate) !== key));
    const alternativeText = alternatives.length > 0
      ? alternatives.map(formatAppCandidate).join(", ")
      : "none currently discovered";
    return (
      `Device ${formatAppCandidate(app)} is already connected to ${ownerDescription}. ` +
      "Only one agent may control a device at a time. Do not retry this device; " +
      `call ui_connect with deviceIdentifier/deviceName/deviceType for another instance. Available alternatives: ${alternativeText}. ` +
      "If this device is required, ask the user to stop the owning agent first."
    );
  }

  private installLifecycleHooks(): void {
    if (!this.shouldInstallLifecycleHooks) return;
    if (this.lifecycleHooksInstalled) return;
    this.lifecycleHooksInstalled = true;
    const release = () => {
      void this.releaseAll();
    };
    const shutdown = (exitCode: number) => {
      void this.releaseAll().finally(() => process.exit(exitCode));
    };
    process.once("SIGINT", () => shutdown(130));
    process.once("SIGTERM", () => shutdown(143));
    process.stdin.once("close", release);
    process.once("beforeExit", release);
  }

  private removeOwnedMetadata(metadataPath: string, ownerToken: string): void {
    const owner = readOwner(metadataPath);
    if (owner?.ownerToken === ownerToken) {
      try {
        fs.unlinkSync(metadataPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

function sessionFromArgs(args: object): string | undefined {
  if (!("session" in args)) return undefined;
  const value = (args as { session?: unknown }).session;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function selectorsFromConfig(
  sessionDefaults?: SessionSelector & { bundleId?: string }
): SessionSelector {
  return compactSelectors({
    session: sessionDefaults?.session,
    port: sessionDefaults?.port,
    deviceType: parseDeviceType(sessionDefaults?.deviceType),
    deviceName: sessionDefaults?.deviceName,
    deviceIdentifier: sessionDefaults?.deviceIdentifier,
  });
}

function parseDeviceType(value?: string): DeviceType | undefined {
  return value === "device" || value === "simulator" ? value : undefined;
}

function uniqueDevices(apps: RunningApp[]): RunningApp[] {
  const seen = new Set<string>();
  return apps.filter((app) => {
    const key = deviceKeyOf(app);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readOwner(metadataPath: string): DeviceLeaseOwner | undefined {
  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8")) as DeviceLeaseOwner;
  } catch {
    return undefined;
  }
}

function writeJSONAtomic(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

export const deviceAccess = new DeviceAccessCoordinator();
