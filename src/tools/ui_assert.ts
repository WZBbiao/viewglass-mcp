import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveQueryLocatorExpression } from "./locator.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UIAssertBase {
  /** Locator: class name, OID, accessibility identifier, or query expression. */
  locator: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export type UIAssertInput =
  | ({ mode: "visible" } & UIAssertBase)
  | ({ mode: "text"; expected: string; contains?: boolean } & UIAssertBase)
  | ({
      mode: "count";
      expected?: number;
      min?: number;
      max?: number;
    } & UIAssertBase)
  | ({
      mode: "attr";
      key: string;
      equals?: string;
      contains?: string;
    } & UIAssertBase);

export interface UIAssertResult {
  passed: boolean;
  assertion: string;
  locator: string;
  matchCount: number;
  message: string;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Assert a UI condition. Returns { passed: true, ... } on success.
 * On failure, responds with isError: true and a descriptive message.
 *
 * Four modes:
 *  - visible: assert ≥1 node matches and is visible
 *  - text:    assert node's display text equals/contains expected value
 *  - count:   assert match count equals/min/max
 *  - attr:    assert node attribute equals/contains expected value
 */
export async function uiAssert(
  input: UIAssertInput,
  exec?: ExecFn
): Promise<UIAssertResult> {
  const session = await resolveSession(input.session, exec);
  const resolved = await resolveQueryLocatorExpression(input.locator, session, exec);

  let cliArgs: string[];

  if (input.mode === "visible") {
    cliArgs = ["assert", "visible", resolved.queryExpression, "--json"];
  } else if (input.mode === "text") {
    cliArgs = ["assert", "text", resolved.queryExpression, input.expected, "--json"];
    if (input.contains) cliArgs.push("--contains");
  } else if (input.mode === "count") {
    cliArgs = ["assert", "count", resolved.queryExpression, "--json"];
    if (input.expected !== undefined) cliArgs.push(String(input.expected));
    if (input.min !== undefined) cliArgs.push("--min", String(input.min));
    if (input.max !== undefined) cliArgs.push("--max", String(input.max));
  } else {
    // attr mode
    if (!input.equals && !input.contains) {
      throw new Error("ui_assert attr mode requires either 'equals' or 'contains'");
    }
    cliArgs = ["assert", "attr", resolved.queryExpression, "--key", input.key, "--json"];
    if (input.equals !== undefined) cliArgs.push("--equals", input.equals);
    if (input.contains !== undefined) cliArgs.push("--contains", input.contains);
  }

  // assert exits non-zero on failure — capture stdout regardless
  let stdout = "";
  try {
    const r = await runCLI(cliArgs, { session, exec });
    stdout = r.stdout;
  } catch (err: unknown) {
    const anyErr = err as { stdout?: string };
    if (anyErr?.stdout) {
      stdout = anyErr.stdout;
    } else {
      throw err;
    }
  }

  return parseJSON<UIAssertResult>(stdout, "ui_assert");
}
