import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { uiSnapshot } from "./ui_snapshot.js";
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
  /** Lightweight post-action summary so agent can confirm the screen changed. */
  postState: {
    snapshotId: string;
    visibleText: string[];
    controllerHints: string[];
    bottomBarCandidates: unknown[];
    groupCount: number;
  };
}

/**
 * Dismiss a UIViewController (modal dismiss or navigation pop).
 *
 * The target can be a view, a view controller, or any node — Viewglass
 * automatically finds the hosting UIViewController and calls dismiss/pop.
 *
 * Returns { target, ok: true, resolvedTarget, matchedBy, postState } with a lightweight post-action summary.
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
  await runCLI(["refresh"], { session, exec });
  const snapshot = await uiSnapshot({ session, compact: true }, exec);
  return {
    target: input.target,
    ok: true,
    resolvedTarget: resolved.resolvedTarget,
    matchedBy: resolved.matchedBy,
    postState: {
      snapshotId: snapshot.snapshot.snapshotId,
      visibleText: snapshot.summary.visibleText.slice(0, 12),
      controllerHints: snapshot.summary.controllerHints.slice(0, 4),
      bottomBarCandidates: snapshot.summary.bottomBarCandidates,
      groupCount: snapshot.summary.groupCount,
    },
  };
}
