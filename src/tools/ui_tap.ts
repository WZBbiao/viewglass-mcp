import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UITapInput {
  /**
   * Executable node oid from ui_snapshot.
   * ui_tap no longer performs target search or locator resolution.
   * Agents should first call ui_snapshot, inspect groups/nodes,
   * then pass the exact oid here.
   */
  oid: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

/**
 * Tap a UI element and return an execution summary only.
 * Semantic taps currently cover UIControl,
 * UITapGestureRecognizer-backed views, UITableViewCell, and
 * UICollectionViewCell selection flows.
 *
 * Returns { ok, oid }.
 */
export async function uiTap(
  input: UITapInput,
  exec?: ExecFn
): Promise<{
  ok: true;
  oid: string;
}> {
  if (!input.oid || String(input.oid).trim() === "") {
    throw new Error("ui_tap requires an exact oid from ui_snapshot. First inspect ui_snapshot.groups/nodes, then pass that oid to ui_tap.");
  }
  const session = await resolveSession(input.session, exec);
  await runCLI(["tap", input.oid], { session, exec });
  return {
    ok: true,
    oid: input.oid,
  };
}
