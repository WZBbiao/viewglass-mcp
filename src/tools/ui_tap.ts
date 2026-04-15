import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { uiSnapshot } from "./ui_snapshot.js";
import { resolveActionLocator } from "./locator.js";

export interface UITapInput {
  /**
   * Plain locator string: visible text, accessibility identifier,
   * class name, or numeric oid. MCP resolves it internally.
   * Locator must resolve to exactly one visible node. Supports semantic taps on
   * UIControl, UITapGestureRecognizer targets, UITableViewCell, and
   * UICollectionViewCell, including taps on labels nested inside a cell.
   */
  locator: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

/**
 * Tap a UI element. After tapping, automatically refreshes and returns
 * a lightweight post-action summary instead of the full hierarchy.
 * Semantic taps currently cover UIControl,
 * UITapGestureRecognizer-backed views, UITableViewCell, and
 * UICollectionViewCell selection flows.
 *
 * Returns { ok, locator, resolvedTarget, matchedBy, postState }.
 */
export async function uiTap(
  input: UITapInput,
  exec?: ExecFn
): Promise<{
  ok: true;
  locator: string;
  resolvedTarget: string;
  matchedBy: string;
  postState: {
    snapshotId: string;
    visibleText: string[];
    controllerHints: string[];
    bottomBarCandidates: unknown[];
    groupCount: number;
  };
}> {
  const session = await resolveSession(input.session, exec);
  const resolved = await resolveActionLocator(input.locator, session, "tap", exec);
  // Perform the tap
  await runCLI(["tap", resolved.resolvedTarget], { session, exec });
  // Refresh and return post-action state
  await runCLI(["refresh"], { session, exec });
  const snapshot = await uiSnapshot({ session, compact: true }, exec);
  return {
    ok: true,
    locator: input.locator,
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
