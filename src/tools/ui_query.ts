import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UIQueryInput {
  /**
   * Locator string. Bare class/controller words use case-insensitive fuzzy matching by default,
   * including lowercase inputs like `tableview`, `tabbar`, or `alert`.
   * To search by visible text, use:
   *  - `contains:"partial string"` — full-text search across UILabel.text, button title,
   *    accessibilityLabel, and accessibilityIdentifier (case-insensitive, supports Chinese)
   *
   * Other supported formats:
   *  - `#accessibilityIdentifier` — exact accessibility identifier match
   *  - `@"exact label"` or `@label` — exact accessibilityLabel match
   *  - UIKit class / controller name (e.g. `UIButton`, `Label`, `tableview`, `UITabBar`, `tabbar`, `controller:Alert`)
   *  - `oid:123` or bare number — match by object ID
   *  - `.visible` / `.hidden` / `.interactive` — visibility filter
   *  - `ancestor:UIScrollView` — nodes inside a specific ancestor class
   *  - `parent:UIView` — nodes whose direct parent matches
   *  - `tag:42` — match by view tag
   *  - Logical: `UIButton AND .visible`, `UILabel OR UITextView`, `NOT .hidden`
   *  - Grouping: `(UIButton OR UILabel) AND ancestor:UITableViewCell`
   */
  locator: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

/**
 * Query UI nodes matching a locator. Returns an array of matching nodes,
 * each with oid, className, frame, accessibilityIdentifier, and more.
 * Bare class and controller locators use case-insensitive fuzzy matching by default,
 * including lowercase inputs like `tableview`, `tabbar`, and `alert`.
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
