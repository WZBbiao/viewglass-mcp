import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UIQueryInput {
  /**
   * Locator string — one of:
   *  - `#accessibilityIdentifier` (e.g. `#submit_button`)
   *  - UIKit class name (e.g. `UIButton`)
   *  - Numeric OID string (e.g. `"4295229440"`)
   */
  locator: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

/**
 * Query UI nodes matching a locator. Returns an array of matching nodes,
 * each with oid, className, frame, accessibilityIdentifier, and more.
 * Use the returned oid values with ui_attr_get, ui_set_attr, or invoke.
 */
export async function uiQuery(
  input: UIQueryInput,
  exec?: ExecFn
): Promise<unknown[]> {
  const session = await resolveSession(input.session, exec);
  const { stdout } = await runCLI(["query", input.locator, "--json"], {
    session,
    exec,
  });
  const result = parseJSON<unknown>(stdout, "ui_query");
  // CLI may return a single object or an array; normalize to array
  return Array.isArray(result) ? result : [result];
}
