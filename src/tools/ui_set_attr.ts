import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UISetAttrInput {
  /** Node OID obtained from ui_query. */
  oid: string;
  /** Attribute key to set (e.g. "backgroundColor", "alpha", "hidden", "text"). */
  attr: string;
  /**
   * New value as a string. Examples:
   *  - backgroundColor: "#FF0000" or "rgba(1,0,0,1)"
   *  - alpha: "0.5"
   *  - hidden: "true" / "false"
   *  - text: "Hello"
   */
  value: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

/**
 * Set an attribute on a UI node at runtime. Mutations are live — the app
 * UI changes immediately without recompile. Use for visual debugging and
 * design verification (e.g. tweak colors/fonts to match design spec).
 *
 * WARNING: Changes are ephemeral — they reset on next app launch.
 */
export async function uiSetAttr(
  input: UISetAttrInput,
  exec?: ExecFn
): Promise<{ oid: string; attr: string; value: string; ok: true }> {
  const session = await resolveSession(input.session, exec);
  await runCLI(["attr", "set", input.oid, "--attr", input.attr, input.value], {
    session,
    exec,
  });
  return { oid: input.oid, attr: input.attr, value: input.value, ok: true };
}
