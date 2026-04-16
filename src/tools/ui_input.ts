import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UIInputInput {
  /** Executable node oid from ui_snapshot. Must resolve to a UITextField or UITextView. */
  oid: string;
  /** Text to type into the field. */
  text: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface UIInputResult {
  /** Executed target oid. */
  oid: string;
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
  if (!input.oid || String(input.oid).trim() === "") {
    throw new Error("ui_input requires an exact oid from ui_snapshot. First inspect ui_snapshot.groups/nodes, then pass that oid to ui_input.");
  }
  const session = await resolveSession(input.session, exec);
  const cliArgs = ["input", input.oid, "--text", input.text, "--json"];
  await runCLI(cliArgs, { session, exec });
  return {
    oid: input.oid,
    text: input.text,
    ok: true,
  };
}
