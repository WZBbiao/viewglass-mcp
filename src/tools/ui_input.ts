import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveActionLocator } from "./locator.js";

export interface UIInputInput {
  /**
   * Plain locator string: visible text, accessibility identifier,
   * class name, or numeric oid. Must resolve to a UITextField or UITextView.
   */
  target: string;
  /** Text to type into the field. */
  text: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface UIInputResult {
  /** Original target locator. */
  target: string;
  /** Resolved executable target. */
  resolvedTarget: string;
  /** How the target was matched. */
  matchedBy: string;
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
  const session = await resolveSession(input.session, exec);
  const resolved = await resolveActionLocator(input.target, session, "input", exec);
  const cliArgs = ["input", resolved.resolvedTarget, "--text", input.text, "--json"];
  await runCLI(cliArgs, { session, exec });
  return {
    target: input.target,
    resolvedTarget: resolved.resolvedTarget,
    matchedBy: resolved.matchedBy,
    text: input.text,
    ok: true,
  };
}
