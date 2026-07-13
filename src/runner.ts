import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { logCliFinish, logCliStart } from "./log.js";
import { currentDeviceExecution } from "./device_context.js";
import { loadProjectConfig } from "./project_config.js";
import {
  applySessionSelectors,
  compactSelectors,
  deviceKeyOf,
  matchingBundleCandidates,
  selectByConfigFallback,
  sessionOf,
} from "./session_select.js";
import type { DeviceType, RunningApp, SessionSelector } from "./session_select.js";

const _execFile = promisify(execFile);
const DIST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(DIST_DIR, "..");

/**
 * Resolve bundled viewglass binary shipped inside the npm package.
 * Layout: <package-root>/bin/viewglass-darwin-{arm64|x64}
 * Returns undefined in development (no bin/ dir) — falls back to PATH.
 */
function findBundledBinary(): string | undefined {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const p = join(PACKAGE_ROOT, "bin", `viewglass-darwin-${arch}`);
  return existsSync(p) ? p : undefined;
}

function findPathBinary(): string | undefined {
  const pathValue = process.env.PATH;
  if (!pathValue) return undefined;

  for (const dir of pathValue.split(":")) {
    if (!dir) continue;
    const candidate = join(dir, "viewglass");
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function findLocalDevelopmentBinary(): string | undefined {
  const candidates = [
    join(PACKAGE_ROOT, "..", "lookin", ".build", "debug", "viewglass"),
    join(PACKAGE_ROOT, "..", "lookin", ".build", "release", "viewglass"),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

export function getViewglassBinaryDiagnostics(): string {
  const searched = [
    process.env.VIEWGLASS_BIN
      ? `VIEWGLASS_BIN=${process.env.VIEWGLASS_BIN}`
      : "VIEWGLASS_BIN is not set",
    "PATH entries for viewglass",
    join(PACKAGE_ROOT, "bin", `viewglass-darwin-${process.arch === "arm64" ? "arm64" : "x64"}`),
    join(PACKAGE_ROOT, "..", "lookin", ".build", "debug", "viewglass"),
    join(PACKAGE_ROOT, "..", "lookin", ".build", "release", "viewglass"),
  ];

  return [
    `Resolved binary: ${VIEWGLASS_BIN}`,
    `Searched: ${searched.join("; ")}`,
    "Fix: install viewglass, set VIEWGLASS_BIN=/absolute/path/to/viewglass, or build the sibling lookin repo with `swift build`.",
  ].join("\n");
}

/**
 * Resolution order:
 *  1. VIEWGLASS_BIN env var (explicit override)
 *  2. "viewglass" in $PATH (Homebrew/global install)
 *  3. Bundled binary shipped with this npm package
 *  4. Sibling lookin SwiftPM build artifact (local development checkout)
 */
export const VIEWGLASS_BIN =
  process.env.VIEWGLASS_BIN ?? findPathBinary() ?? findBundledBinary() ?? findLocalDevelopmentBinary() ?? "viewglass";

export interface RunResult {
  stdout: string;
  stderr: string;
}

export class ViewglassCLIError extends Error {
  readonly code?: number | string;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly args: string[];

  constructor(args: string[], error: { code?: number | string; stdout?: string; stderr?: string; message?: string }) {
    super(formatCLIErrorMessage(args, error));
    this.name = "ViewglassCLIError";
    this.code = error.code;
    this.stdout = error.stdout;
    this.stderr = error.stderr;
    this.args = args;
  }
}

/** Testable exec function type — matches promisified execFile signature. */
export type ExecFn = (
  file: string,
  args: string[],
  opts: { timeout: number }
) => Promise<RunResult>;

/** Default exec function using Node's child_process. */
export const defaultExec: ExecFn = (file, args, opts) =>
  _execFile(file, args, { ...opts, maxBuffer: 50 * 1024 * 1024 }) as Promise<RunResult>;

/**
 * Run a viewglass CLI sub-command and return stdout/stderr.
 * Throws on non-zero exit.
 */
export async function runCLI(
  args: string[],
  opts: { session?: string; timeoutMs?: number; exec?: ExecFn; projectCwd?: string } = {}
): Promise<RunResult> {
  const exec = opts.exec ?? defaultExec;
  const sessionArgs = opts.session ? ["--session", opts.session] : [];
  const fullArgs = [...args, ...sessionArgs];
  const timeout = opts.timeoutMs ?? 15_000;
  const startedAt = Date.now();
  try {
    return await runCLIOnce(exec, fullArgs, timeout, startedAt);
  } catch (error: unknown) {
    const retrySession = await recoverSessionAfterFailure(opts.session, error, exec, opts.projectCwd);
    if (!retrySession || retrySession === opts.session) {
      throw error;
    }
    const retryArgs = [...args, "--session", retrySession];
    return await runCLIOnce(exec, retryArgs, timeout, Date.now());
  }
}

async function runCLIOnce(
  exec: ExecFn,
  fullArgs: string[],
  timeout: number,
  startedAt: number
): Promise<RunResult> {
  logCliStart(VIEWGLASS_BIN, fullArgs, timeout);
  try {
    const result = await exec(VIEWGLASS_BIN, fullArgs, { timeout });
    logCliFinish({
      file: VIEWGLASS_BIN,
      args: fullArgs,
      durationMs: Date.now() - startedAt,
      exitStatus: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    return result;
  } catch (error: unknown) {
    const anyError = error as { code?: number | string; stdout?: string; stderr?: string };
    logCliFinish({
      file: VIEWGLASS_BIN,
      args: fullArgs,
      durationMs: Date.now() - startedAt,
      exitStatus: anyError.code ?? "error",
      stdout: anyError.stdout,
      stderr: anyError.stderr ?? String(error),
    });
    throw new ViewglassCLIError(fullArgs, {
      code: anyError.code,
      stdout: anyError.stdout,
      stderr: anyError.stderr,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function formatCLIErrorMessage(
  args: string[],
  error: { code?: number | string; stdout?: string; stderr?: string; message?: string }
): string {
  const parts = [
    `Viewglass CLI failed: ${["viewglass", ...args].join(" ")}`,
    error.code !== undefined ? `exitCode: ${error.code}` : undefined,
    error.stderr ? `stderr: ${truncate(error.stderr.trim(), 4000)}` : undefined,
    error.stdout ? `stdout: ${truncate(error.stdout.trim(), 4000)}` : undefined,
    error.message ? `message: ${truncate(error.message.trim(), 1000)}` : undefined,
  ].filter(Boolean);
  return parts.join("\n");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}… <truncated ${value.length - maxLength} chars>`;
}

/**
 * Auto-detect a single unambiguous running Viewglass session.
 * Returns "bundleId@port" or undefined if none found.
 */
export async function detectSession(
  exec?: ExecFn,
  projectCwd: string = process.cwd()
): Promise<string | undefined> {
  const fn = exec ?? defaultExec;
  try {
    const { stdout } = await fn(VIEWGLASS_BIN, ["apps", "list", "--json"], {
      timeout: 15_000,
    });
    const apps = JSON.parse(stdout) as RunningApp[];

    const config = loadProjectConfig(projectCwd);
    const bundleId = config?.sessionDefaults?.bundleId?.trim();
    if (bundleId) {
      const selectors = selectorsFromConfig(config?.sessionDefaults);
      const { candidates: bundleCandidates } = matchingBundleCandidates(apps, bundleId);
      const { candidates } = selectByConfigFallback(bundleCandidates, selectors);
      const match = chooseUnambiguousApp(candidates);
      return match ? sessionOf(match) : undefined;
    }

    const match = chooseUnambiguousApp(apps);
    return match ? sessionOf(match) : undefined;
  } catch {
    // no app running or binary not found
  }
  return undefined;
}

function chooseUnambiguousApp<T>(apps: T[]): T | undefined {
  return apps.length === 1 ? apps[0] : undefined;
}

function bundleIdFromSession(session?: string): string | undefined {
  if (!session) return undefined;
  const at = session.lastIndexOf("@");
  if (at <= 0) return undefined;
  return session.slice(0, at);
}

function staleSessionError(error: unknown): boolean {
  const err = error as { stdout?: string; stderr?: string; message?: string };
  const text = [err.stderr, err.stdout, err.message, String(error)]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return [
    "session not connected",
    "connection failed",
    "connect failed",
    "connection closed",
    "connection reset",
    "connection refused",
    "usb read timeout",
    "read timeout",
    "app not found",
  ].some((needle) => text.includes(needle));
}

async function recoverSessionAfterFailure(
  session: string | undefined,
  error: unknown,
  exec: ExecFn,
  projectCwd: string = process.cwd()
): Promise<string | undefined> {
  if (!staleSessionError(error)) return undefined;
  const bundleId = bundleIdFromSession(session);
  if (!bundleId) return undefined;

  try {
    const { stdout } = await exec(VIEWGLASS_BIN, ["apps", "list", "--json"], {
      timeout: 15_000,
    });
    const apps = JSON.parse(stdout) as RunningApp[];
    const config = loadProjectConfig(projectCwd);
    const matches = apps.filter((app) => app.bundleIdentifier === bundleId);
    const selectors = selectorsFromConfig(config?.sessionDefaults);
    const { candidates } = selectByConfigFallback(matches, selectors);
    const app = chooseUnambiguousApp(candidates);
    if (!app) return undefined;
    const activeDeviceKey = currentDeviceExecution()?.deviceKey;
    if (activeDeviceKey && deviceKeyOf(app) !== activeDeviceKey) {
      return undefined;
    }
    return sessionOf(app);
  } catch {
    return undefined;
  }
}

/**
 * Resolve session: use provided value, or auto-detect, or throw.
 */
export async function resolveSession(
  session?: string,
  exec?: ExecFn,
  projectCwd: string = process.cwd()
): Promise<string> {
  const s = session ?? currentDeviceExecution()?.session ?? (await detectSession(exec, projectCwd));
  if (!s) {
    throw new Error(
      "No unambiguous Viewglass session found. Start the app with Viewglass enabled, pass session as bundleId@port, " +
        "or configure sessionDefaults.bundleId plus deviceIdentifier/deviceName/deviceType in .viewglassmcp/config.yaml."
    );
  }
  return s;
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

/** Parse JSON output from a CLI command, throwing a descriptive error on failure. */
export function parseJSON<T = unknown>(raw: string, cmd: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Failed to parse JSON from '${cmd}': ${raw.slice(0, 200)}`);
  }
}
