import { parseJSON, runCLI, resolveSession } from "../runner.js";
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
 * Returns { ok, oid, strategyUsed }.
 */
export async function uiTap(
  input: UITapInput,
  exec?: ExecFn
): Promise<{
  ok: true;
  oid: string;
  strategyUsed: "semantic" | "coordinateSemantic" | string;
  fallbackReason?: string;
  point?: { x: number; y: number };
  hitOid?: string;
  hitClass?: string;
}> {
  if (!input.oid || String(input.oid).trim() === "") {
    throw new Error("ui_tap requires an exact oid from ui_snapshot. First inspect ui_snapshot.groups/nodes, then pass that oid to ui_tap.");
  }
  const session = await resolveSession(input.session, exec);
  const result = await runCLI(["tap", input.oid, "--json"], { session, exec });
  const action = parseJSON<{
    strategyUsed?: string;
    fallbackReason?: string;
    pointX?: number;
    pointY?: number;
    hitOid?: number | string;
    hitClass?: string;
  }>(result.stdout, "tap");
  const output: {
    ok: true;
    oid: string;
    strategyUsed: string;
    fallbackReason?: string;
    point?: { x: number; y: number };
    hitOid?: string;
    hitClass?: string;
  } = {
    ok: true,
    oid: input.oid,
    strategyUsed: action.strategyUsed ?? "semantic",
  };
  if (action.fallbackReason) output.fallbackReason = action.fallbackReason;
  if (typeof action.pointX === "number" && typeof action.pointY === "number") {
    output.point = { x: action.pointX, y: action.pointY };
  }
  if (action.hitOid !== undefined) output.hitOid = String(action.hitOid);
  if (action.hitClass) output.hitClass = action.hitClass;
  return output;
}
