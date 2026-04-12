import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UIAttrGetInput {
  /** Node OID obtained from ui_query. */
  oid: string;
  /**
   * Attribute keys to return (e.g. ["frame", "backgroundColor", "text"]).
   * If omitted, all attributes are returned.
   * Common keys: frame, bounds, backgroundColor, alpha, hidden, text, fontName, fontSize,
   *   contentMode, accessibilityIdentifier, accessibilityLabel, cornerRadius.
   */
  attrs?: string[];
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

/**
 * Get attributes of a UI node by OID.
 * Returns a map of { attrKey: value }. Use ui_query first to get the OID.
 */
export async function uiAttrGet(
  input: UIAttrGetInput,
  exec?: ExecFn
): Promise<Record<string, unknown>> {
  const session = await resolveSession(input.session, exec);
  const { stdout } = await runCLI(["attr", "get", input.oid, "--json"], {
    session,
    exec,
  });
  const result = parseJSON<{ attributes?: Record<string, unknown> }>(stdout, "ui_attr_get");
  const allAttrs: Record<string, unknown> = result.attributes ?? (result as Record<string, unknown>);

  // Filter to requested keys if specified
  if (input.attrs?.length) {
    const filtered: Record<string, unknown> = {};
    for (const key of input.attrs) {
      if (key in allAttrs) filtered[key] = allAttrs[key];
    }
    return filtered;
  }
  return allAttrs;
}
