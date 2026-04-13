import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UIInputInput {
  /**
   * Target locator: '#accessibilityIdentifier', class name, or OID.
   * Must resolve to a UITextField or UITextView.
   */
  target: string;
  /** Text to type into the field. */
  text: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface UIInputResult {
  /** Target locator used. */
  target: string;
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
 * Returns { target, text, ok: true } on success.
 */
export async function uiInput(
  input: UIInputInput,
  exec?: ExecFn
): Promise<UIInputResult> {
  const session = await resolveSession(input.session, exec);
  const cliArgs = ["input", input.target, "--text", input.text, "--json"];
  await runCLI(cliArgs, { session, exec });
  return { target: input.target, text: input.text, ok: true };
}
