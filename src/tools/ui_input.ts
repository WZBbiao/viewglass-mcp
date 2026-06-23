import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveActionLocator } from "./locator.js";

export interface UIInputInput {
  /** Stable locator such as an accessibilityIdentifier. Preferred for replay. */
  locator?: string;
  /** Runtime OID from ui_snapshot. Must resolve to a UITextField or UITextView. */
  oid?: string;
  /** Text to type into the field. */
  text: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface UIInputResult {
  /** Executed target oid. */
  oid: string;
  /** Stable locator used, when provided. */
  locator?: string;
  /** How the locator was matched. */
  matchedBy?: string;
  /** Number of candidates considered for the locator. */
  candidateCount?: number;
  /** Text that was entered. */
  text: string;
  /** true on success. */
  ok: true;
}

/**
 * Enter text into a UITextField or UITextView.
 *
 * Dispatches the text semantically via the text field's input mechanism.
 * Clears existing text if any, then types the new text.
 *
 * Returns { target, resolvedTarget, matchedBy, text, ok: true } on success.
 */
export async function uiInput(
  input: UIInputInput,
  exec?: ExecFn
): Promise<UIInputResult> {
  if (!input.locator && !input.oid) {
    throw new Error("ui_input requires either 'locator' or 'oid'. Prefer locator for reusable flows.");
  }
  const session = await resolveSession(input.session, exec);
  const resolved = input.locator
    ? await resolveActionLocator(input.locator, session, "input", exec)
    : undefined;
  const target = resolved?.resolvedTarget ?? input.oid!;
  const cliArgs = ["input", target, "--text", input.text, "--json"];
  await runCLI(cliArgs, { session, exec });
  const output: UIInputResult = {
    oid: target,
    text: input.text,
    ok: true,
  };
  if (input.locator) output.locator = input.locator;
  if (resolved) {
    output.matchedBy = resolved.matchedBy;
    output.candidateCount = resolved.candidateCount;
  }
  return output;
}
