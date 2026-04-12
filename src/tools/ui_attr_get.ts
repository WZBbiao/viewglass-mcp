import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UIAttrGetInput {
  /** Node OID obtained from ui_query. */
  oid: string;
  /**
   * Attribute keys to fetch (e.g. ["frame", "backgroundColor", "font", "text"]).
   * Pass multiple keys to fetch several in one call.
   */
  attrs: string[];
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

/**
 * Get one or more attributes of a UI node by OID.
 * Returns a map of { attrKey: value }. Use ui_query first to get the OID.
 *
 * Common attribute keys: frame, backgroundColor, alpha, hidden, text,
 *   font, contentMode, accessibilityIdentifier, accessibilityLabel
 */
export async function uiAttrGet(
  input: UIAttrGetInput,
  exec?: ExecFn
): Promise<Record<string, unknown>> {
  const session = await resolveSession(input.session, exec);
  const args = ["attr", "get", input.oid, "--attr", ...input.attrs, "--json"];
  const { stdout } = await runCLI(args, { session, exec });
  return parseJSON<Record<string, unknown>>(stdout, "ui_attr_get");
}
