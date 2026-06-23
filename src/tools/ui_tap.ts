import { parseJSON, runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveUniqueNodeLocator } from "./locator.js";
import { MUTATION_TIMEOUT_MS } from "./timeouts.js";

export interface UITapInput {
  /**
   * Stable locator such as an accessibilityIdentifier. Preferred for replay.
   * Bare strings are resolved as accessibility identifiers first, then text.
   */
  locator?: string;
  /**
   * Runtime OID from ui_snapshot. Useful as a last-known handle or cache hint,
   * but it is not stable across app launches.
   */
  oid?: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

/**
 * Tap a UI element and return an execution summary.
 * Semantic taps currently cover UIControl,
 * UITapGestureRecognizer-backed views, UITableViewCell, and
 * UICollectionViewCell selection flows.
 *
 * Returns { ok, oid, strategyUsed } plus diagnostic details from the CLI.
 */
export async function uiTap(
  input: UITapInput,
  exec?: ExecFn
): Promise<{
  ok: true;
  oid: string;
  locator?: string;
  resolvedOid?: string;
  matchedBy?: string;
  candidateCount?: number;
  strategyUsed: "semantic" | "coordinateSemantic" | string;
  action?: string;
  targetClass?: string;
  mode?: string;
  detail?: string;
  fallbackReason?: string;
  point?: { x: number; y: number };
  hitOid?: string;
  hitClass?: string;
}> {
  if (!input.locator && !input.oid) {
    throw new Error("ui_tap requires either 'locator' or 'oid'. Prefer locator for reusable flows.");
  }
  const session = await resolveSession(input.session, exec);
  const resolved = input.locator
    ? await resolveUniqueNodeLocator(input.locator, session, exec)
    : undefined;
  const target = resolved?.resolvedTarget ?? input.oid!;
  const result = await runCLI(["tap", target, "--json"], { session, exec, timeoutMs: MUTATION_TIMEOUT_MS });
  const action = parseJSON<{
    strategyUsed?: string;
    action?: string;
    targetClass?: string;
    mode?: string;
    detail?: string;
    fallbackReason?: string;
    pointX?: number;
    pointY?: number;
    hitOid?: number | string;
    hitClass?: string;
  }>(result.stdout, "tap");
  const output: {
    ok: true;
    oid: string;
    locator?: string;
    resolvedOid?: string;
    matchedBy?: string;
    candidateCount?: number;
    strategyUsed: string;
    action?: string;
    targetClass?: string;
    mode?: string;
    detail?: string;
    fallbackReason?: string;
    point?: { x: number; y: number };
    hitOid?: string;
    hitClass?: string;
  } = {
    ok: true,
    oid: target,
    strategyUsed: action.strategyUsed ?? "semantic",
  };
  if (input.locator) output.locator = input.locator;
  if (resolved) {
    output.resolvedOid = resolved.resolvedTarget;
    output.matchedBy = resolved.matchedBy;
    output.candidateCount = resolved.candidateCount;
  }
  if (action.action) output.action = action.action;
  if (action.targetClass) output.targetClass = action.targetClass;
  if (action.mode) output.mode = action.mode;
  if (action.detail) output.detail = action.detail;
  if (action.fallbackReason) output.fallbackReason = action.fallbackReason;
  if (typeof action.pointX === "number" && typeof action.pointY === "number") {
    output.point = { x: action.pointX, y: action.pointY };
  }
  if (action.hitOid !== undefined) output.hitOid = String(action.hitOid);
  if (action.hitClass) output.hitClass = action.hitClass;
  return output;
}
