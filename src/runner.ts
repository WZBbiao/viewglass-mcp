import { execFile } from "node:child_process";
import { promisify } from "node:util";

const _execFile = promisify(execFile);

/** Path to viewglass binary. Override with VIEWGLASS_BIN env var. */
export const VIEWGLASS_BIN = process.env.VIEWGLASS_BIN ?? "viewglass";

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
  return exec(VIEWGLASS_BIN, [...args, ...sessionArgs], {
    timeout: opts.timeoutMs ?? 15_000,
  });
}

/**
 * Auto-detect the first running Viewglass session.
 * Returns "bundleId@port" or undefined if none found.
 */
export async function detectSession(exec?: ExecFn): Promise<string | undefined> {
  const fn = exec ?? defaultExec;
  try {
    const { stdout } = await fn(VIEWGLASS_BIN, ["apps", "list", "--json"], {
      timeout: 5_000,
    });
    const apps = JSON.parse(stdout) as Array<{
      bundleIdentifier: string;
      port: number;
    }>;
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
