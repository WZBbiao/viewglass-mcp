import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UIDismissInput {
  /**
   * Target locator: '#accessibilityIdentifier', class name, or OID.
   * The target can be a UIViewController node or any view hosted by one.
   * The UIViewController will be dismissed (modal) or popped (navigation).
   */
  target: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface UIDismissResult {
  target: string;
  ok: true;
  /** Post-action hierarchy so agent can confirm the screen changed. */
  hierarchy: unknown;
}

/**
 * Dismiss a UIViewController (modal dismiss or navigation pop).
 *
 * The target can be a view, a view controller, or any node — Viewglass
 * automatically finds the hosting UIViewController and calls dismiss/pop.
 *
 * Returns { target, ok: true, hierarchy } with the post-action UI state.
 * Prefer this over calling ui_invoke with popViewControllerAnimated: for
 * standard navigation patterns.
 */
export async function uiDismiss(
  input: UIDismissInput,
  exec?: ExecFn
): Promise<UIDismissResult> {
  const session = await resolveSession(input.session, exec);
  await runCLI(["dismiss", input.target, "--json"], { session, exec });
  await runCLI(["refresh"], { session, exec });
  const { stdout } = await runCLI(["hierarchy", "--json"], { session, exec });
  const hierarchy = parseJSON(stdout, "ui_dismiss/hierarchy");
  return { target: input.target, ok: true, hierarchy };
}
