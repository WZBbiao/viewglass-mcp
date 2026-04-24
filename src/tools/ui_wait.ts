import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveQueryLocatorExpression } from "./locator.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WaitMode = "appears" | "gone" | "attr";

export interface UIWaitBase {
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
  /** Max seconds to wait (default 10). */
  timeout?: number;
  /** Polling interval in milliseconds (default 500). */
  intervalMs?: number;
}

export type UIWaitInput =
  | ({ mode: "appears" | "gone"; locator: string } & UIWaitBase)
  | ({
      mode: "attr";
      locator: string;
      key: string;
      /** Pass when value equals this string (exact, case-sensitive). */
      equals?: string;
      /** Pass when value contains this substring (case-insensitive). */
      contains?: string;
    } & UIWaitBase);

export interface UIWaitResult {
  /** Whether the condition was met within the timeout. */
  met: boolean;
  /** Human-readable condition description. */
  condition: string;
  /** Elapsed seconds. */
  elapsedSeconds: number;
  /** Number of polls performed. */
  pollCount: number;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Poll until a UI condition is met or a timeout elapses.
 *
 * Three modes:
 *  - appears: wait until locator matches ≥1 visible node
 *  - gone:    wait until locator matches 0 nodes
 *  - attr:    wait until a node attribute equals/contains a value
 *
 * Returns { met, condition, elapsedSeconds, pollCount }.
 * If condition is NOT met within timeout, returns isError: true in the tool response.
 */
export async function uiWait(
  input: UIWaitInput,
  exec?: ExecFn
): Promise<UIWaitResult> {
  const session = await resolveSession(input.session, exec);
  const resolved = await resolveQueryLocatorExpression(
    input.locator,
    session,
    exec,
    input.mode === "appears" ? { fallback: "broad" } : undefined
  );
  const timeoutArgs = input.timeout ? ["--timeout", String(input.timeout)] : [];
  const intervalArgs = input.intervalMs ? ["--interval-ms", String(input.intervalMs)] : [];

  let cliArgs: string[];

  if (input.mode === "appears") {
    cliArgs = ["wait", "appears", resolved.queryExpression, "--json", ...timeoutArgs, ...intervalArgs];
  } else if (input.mode === "gone") {
    cliArgs = ["wait", "gone", resolved.queryExpression, "--json", ...timeoutArgs, ...intervalArgs];
  } else {
    // attr mode — TypeScript narrows to the attr branch here
    const attrInput = input as Extract<UIWaitInput, { mode: "attr" }>;
    if (!attrInput.equals && !attrInput.contains) {
      throw new Error("ui_wait attr mode requires either 'equals' or 'contains'");
    }
    cliArgs = ["wait", "attr", resolved.queryExpression, "--key", attrInput.key, "--json", ...timeoutArgs, ...intervalArgs];
    if (attrInput.equals !== undefined) cliArgs.push("--equals", attrInput.equals);
    if (attrInput.contains !== undefined) cliArgs.push("--contains", attrInput.contains);
  }

  // wait may exit non-zero on timeout — capture instead of throwing
  let stdout = "";
  try {
    const r = await runCLI(cliArgs, { session, exec, timeoutMs: (input.timeout ?? 10) * 1000 + 5000 });
    stdout = r.stdout;
  } catch (err: unknown) {
    // CLI exited with code 1 (timeout) — stdout still has JSON result
    const anyErr = err as { stdout?: string };
    if (anyErr?.stdout) {
      stdout = anyErr.stdout;
    } else {
      throw err;
    }
  }

  return parseJSON<UIWaitResult>(stdout, "ui_wait");
}
