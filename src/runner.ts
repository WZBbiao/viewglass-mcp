import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { logCliFinish, logCliStart } from "./log.js";
import { loadProjectConfig } from "./project_config.js";

const _execFile = promisify(execFile);

/**
 * Resolve bundled viewglass binary shipped inside the npm package.
 * Layout: <package-root>/bin/viewglass-darwin-{arm64|x64}
 * Returns undefined in development (no bin/ dir) — falls back to PATH.
 */
function findBundledBinary(): string | undefined {
  const distDir = dirname(fileURLToPath(import.meta.url));
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const p = join(distDir, "..", "bin", `viewglass-darwin-${arch}`);
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

/**
 * Resolution order:
 *  1. VIEWGLASS_BIN env var (explicit override)
 *  2. "viewglass" in $PATH (development / Homebrew install)
 *  3. Bundled binary shipped with this npm package
 */
export const VIEWGLASS_BIN =
  process.env.VIEWGLASS_BIN ?? findPathBinary() ?? findBundledBinary() ?? "viewglass";

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
 * Auto-detect the first running Viewglass session.
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
    const apps = JSON.parse(stdout) as Array<{
      bundleIdentifier: string;
      deviceType?: string;
      port: number;
    }>;

    const config = loadProjectConfig(projectCwd);
    const bundleId = config?.sessionDefaults?.bundleId?.trim();
    const preferredDeviceType = config?.sessionDefaults?.deviceType;
    if (bundleId) {
      const exactMatches = apps.filter((app) => app.bundleIdentifier === bundleId);
      const partialMatches = apps.filter((app) => app.bundleIdentifier.toLowerCase().includes(bundleId.toLowerCase()));
      const match = choosePreferredApp(exactMatches.length > 0 ? exactMatches : partialMatches, preferredDeviceType);
      if (match) {
        return `${match.bundleIdentifier}@${match.port}`;
      }
    }

    if (apps.length > 0) {
      const a = choosePreferredApp(apps, preferredDeviceType) ?? apps[0];
      return `${a.bundleIdentifier}@${a.port}`;
    }
  } catch {
    // no app running or binary not found
  }
  return undefined;
}

function choosePreferredApp<T extends { deviceType?: string }>(
  apps: T[],
  preferredDeviceType?: "device" | "simulator"
): T | undefined {
  if (apps.length === 0) return undefined;

  if (preferredDeviceType) {
    const match = apps.find((app) => app.deviceType === preferredDeviceType);
    if (match) return match;
  }

  return apps.find((app) => app.deviceType === "device") ?? apps[0];
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
    const apps = JSON.parse(stdout) as Array<{
      bundleIdentifier: string;
      deviceType?: string;
      port: number;
    }>;
    const config = loadProjectConfig(projectCwd);
    const preferredDeviceType = config?.sessionDefaults?.deviceType;
    const matches = apps.filter((app) => app.bundleIdentifier === bundleId);
    const app = choosePreferredApp(matches, preferredDeviceType);
    if (!app) return undefined;
    return `${app.bundleIdentifier}@${app.port}`;
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
  const s = session ?? (await detectSession(exec, projectCwd));
  if (!s) {
    throw new Error(
      "No Viewglass session found. Start the app with Viewglass enabled, or pass session as bundleId@port."
    );
  }
  return s;
}

/** Parse JSON output from a CLI command, throwing a descriptive error on failure. */
export function parseJSON<T = unknown>(raw: string, cmd: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Failed to parse JSON from '${cmd}': ${raw.slice(0, 200)}`);
  }
}
