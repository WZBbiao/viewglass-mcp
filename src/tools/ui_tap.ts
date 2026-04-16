import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
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
 * Tap a UI element and return an execution summary only.
 * Semantic taps currently cover UIControl,
 * UITapGestureRecognizer-backed views, UITableViewCell, and
 * UICollectionViewCell selection flows.
 *
 * Returns { ok, locator, resolvedTarget, matchedBy }.
 */
export async function uiTap(
  input: UITapInput,
  exec?: ExecFn
): Promise<{
  ok: true;
  locator: string;
  resolvedTarget: string;
  matchedBy: string;
}> {
  const session = await resolveSession(input.session, exec);
  const resolved = await resolveActionLocator(input.locator, session, "tap", exec);
  await runCLI(["tap", resolved.resolvedTarget], { session, exec });
  return {
    ok: true,
    locator: input.locator,
    resolvedTarget: resolved.resolvedTarget,
    matchedBy: resolved.matchedBy,
  };
}
