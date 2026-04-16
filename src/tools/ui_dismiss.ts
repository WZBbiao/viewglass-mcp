import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UIDismissInput {
  /** Executable node oid from ui_snapshot. The target can be a UIViewController node or any view hosted by one. */
  oid: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface UIDismissResult {
  oid: string;
  ok: true;
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
  if (!input.oid || String(input.oid).trim() === "") {
    throw new Error("ui_dismiss requires an exact oid from ui_snapshot. First inspect ui_snapshot.groups/nodes, then pass that oid to ui_dismiss.");
  }
  const session = await resolveSession(input.session, exec);
  await runCLI(["dismiss", input.oid, "--json"], { session, exec });
  return {
    oid: input.oid,
    ok: true,
  };
}
