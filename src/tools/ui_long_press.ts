import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveUniqueNodeLocator } from "./locator.js";

export interface UILongPressInput {
  /**
   * Target locator: '#accessibilityIdentifier', class name, or OID.
   */
  target: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface UILongPressResult {
  target: string;
  ok: true;
}

/**
 * Trigger a semantic long press on a UI node.
 *
 * Dispatches a long press gesture recognizer event on the target element.
 * Useful for triggering context menus, preview interactions, and
 * custom long-press handlers.
 *
 * Returns { target, ok: true }.
 */
export async function uiLongPress(
  input: UILongPressInput,
  exec?: ExecFn
): Promise<UILongPressResult> {
  const session = await resolveSession(input.session, exec);
  const resolved = await resolveUniqueNodeLocator(input.target, session, exec);
  await runCLI(["long-press", resolved.resolvedTarget, "--json"], { session, exec });
  return { target: input.target, ok: true };
}
