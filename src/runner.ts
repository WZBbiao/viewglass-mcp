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
  opts: { session?: string; timeoutMs?: number; exec?: ExecFn } = {}
): Promise<RunResult> {
  const exec = opts.exec ?? defaultExec;
  const sessionArgs = opts.session ? ["--session", opts.session] : [];
  const fullArgs = [...args, ...sessionArgs];
  const timeout = opts.timeoutMs ?? 15_000;
  const startedAt = Date.now();
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
    throw error;
  }
}

/**
 * Auto-detect the first running Viewglass session.
 * Returns "bundleId@port" or undefined if none found.
 */
export async function detectSession(exec?: ExecFn): Promise<string | undefined> {
  const fn = exec ?? defaultExec;
  try {
    const { stdout } = await fn(VIEWGLASS_BIN, ["apps", "list", "--json"], {
      timeout: 15_000,
    });
    const apps = JSON.parse(stdout) as Array<{
      bundleIdentifier: string;
      port: number;
    }>;

    const config = loadProjectConfig();
    const bundleId = config?.sessionDefaults?.bundleId?.trim();
    if (bundleId) {
      const match =
        apps.find((app) => app.bundleIdentifier === bundleId) ??
        apps.find((app) => app.bundleIdentifier.toLowerCase().includes(bundleId.toLowerCase()));
      if (match) {
        return `${match.bundleIdentifier}@${match.port}`;
      }
    }

    if (apps.length > 0) {
      const a = apps[0];
      return `${a.bundleIdentifier}@${a.port}`;
    }
  } catch {
    // no app running or binary not found
  }
  return undefined;
}

/**
 * Resolve session: use provided value, or auto-detect, or throw.
 */
export async function resolveSession(
  session?: string,
  exec?: ExecFn
): Promise<string> {
  const s = session ?? (await detectSession(exec));
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
