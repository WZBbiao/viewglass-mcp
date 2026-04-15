import { resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { uiQueryWithPlainLocator } from "./locator.js";

export interface UIQueryInput {
  /**
   * Plain locator string. Pass what the user would naturally call the target:
   * visible text, accessibility identifier, class name, or numeric oid.
   * MCP resolves it internally in a fixed order instead of exposing query DSL.
   */
  locator: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

/**
 * Query UI nodes matching a plain locator string. Returns an array of nodes.
 * Use the returned oid values with ui_attr_get, ui_set_attr, or invoke.
 */
export async function uiQuery(
  input: UIQueryInput,
  exec?: ExecFn
): Promise<unknown[]> {
  const session = await resolveSession(input.session, exec);
  return await uiQueryWithPlainLocator(input.locator, session, exec);
}
