import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveUniqueNodeLocator } from "./locator.js";

export interface UIAttrGetInput {
  /** Stable locator such as an accessibilityIdentifier. Preferred for replay. */
  locator?: string;
  /** Runtime OID obtained from ui_snapshot. Not stable across app launches. */
  oid?: string;
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
 * Get attributes of a UI node by stable locator or OID.
 * Returns a map of { attrKey: value }. Prefer ui_snapshot.recommendedLocator
 * or #accessibilityIdentifier for reusable flows.
 */
export async function uiAttrGet(
  input: UIAttrGetInput,
  exec?: ExecFn
): Promise<Record<string, unknown>> {
  if (!input.locator && !input.oid) {
    throw new Error("ui_attr_get requires either 'locator' or 'oid'. Prefer locator for reusable flows.");
  }
  const session = await resolveSession(input.session, exec);
  const resolved = input.locator
    ? await resolveUniqueNodeLocator(input.locator, session, exec)
    : undefined;
  const target = resolved?.resolvedTarget ?? input.oid!;
  const { stdout } = await runCLI(["attr", "get", target, "--json"], {
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
