import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveActionLocator } from "./locator.js";

export interface UIDismissInput {
  /**
   * Plain locator string: visible text, accessibility identifier, class name, or numeric oid.
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
  resolvedTarget: string;
  matchedBy: string;
}

/**
 * Dismiss a UIViewController (modal dismiss or navigation pop).
 *
 * The target can be a view, a view controller, or any node — Viewglass
 * automatically finds the hosting UIViewController and calls dismiss/pop.
 *
 * Returns { target, ok: true, resolvedTarget, matchedBy }.
 * No automatic post-action summary is returned because animated transitions can make
 * immediate snapshots stale. Call ui_snapshot or ui_wait explicitly if verification is needed.
 * Prefer this over calling ui_invoke with popViewControllerAnimated: for
 * standard navigation patterns.
 */
export async function uiDismiss(
  input: UIDismissInput,
  exec?: ExecFn
): Promise<UIDismissResult> {
  const session = await resolveSession(input.session, exec);
  const resolved = await resolveActionLocator(input.target, session, "dismiss", exec);
  await runCLI(["dismiss", resolved.resolvedTarget, "--json"], { session, exec });
  return {
    target: input.target,
    ok: true,
    resolvedTarget: resolved.resolvedTarget,
    matchedBy: resolved.matchedBy,
  };
}
