import { parseJSON, runCLI, resolveSession, ViewglassCLIError } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveUniqueNodeLocator } from "./locator.js";
import { MUTATION_TIMEOUT_MS } from "./timeouts.js";

export type SwipeDirection = "up" | "down" | "left" | "right";

export interface UISwipeInput {
  /**
   * Target locator: '#accessibilityIdentifier', class name, or OID.
   */
  target: string;
  /** Swipe direction. */
  direction: SwipeDirection;
  /** Distance in points (default 200). */
  distance?: number;
  /** Whether to animate the swipe with ease-in-out interpolation (default false). */
  animated?: boolean;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface UISwipeResult {
  target: string;
  resolvedOid: string;
  matchedBy: string;
  candidateCount: number;
  direction: SwipeDirection;
  distance: number;
  ok: true;
  strategyUsed?: string;
  action?: string;
  targetClass?: string;
  mode?: string;
  detail?: string;
  fallbackReason?: string;
  point?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  hitOid?: string;
  hitClass?: string;
}

/**
 * Swipe a UI node in a given direction.
 *
 * UIScrollView targets use semantic contentOffset scrolling. Non-scrollable
 * UIView targets fall back to coordinate semantic swipe for pan recognizers.
 * Prefer ui_scroll for normal page/list scrolling because it resolves
 * wrapper/cell targets first.
 *
 * Returns { target, direction, distance, ok: true } plus CLI strategy details.
 */
export async function uiSwipe(
  input: UISwipeInput,
  exec?: ExecFn
): Promise<UISwipeResult> {
  const session = await resolveSession(input.session, exec);
  const dist = input.distance ?? 200;
  let resolved = await resolveUniqueNodeLocator(input.target, session, exec);

  let stdout: string | undefined;
  let lastError: unknown;
  const retryDelays = [0, 250, 500, 1_000];
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt] > 0) {
      await delay(retryDelays[attempt]);
      resolved = await resolveUniqueNodeLocator(input.target, session, exec);
    }
    try {
      stdout = await runSwipe(resolved.resolvedTarget, input, dist, session, exec);
      break;
    } catch (error) {
      if (!shouldRetryCoordinateSwipe(error) || attempt === retryDelays.length - 1) {
        throw error;
      }
      lastError = error;
    }
  }
  if (stdout === undefined) throw lastError ?? new Error("ui_swipe failed without CLI output");
  const action = parseJSON<{
    strategyUsed?: string;
    action?: string;
    targetClass?: string;
    mode?: string;
    detail?: string;
    fallbackReason?: string;
    pointX?: number;
    pointY?: number;
    endPointX?: number;
    endPointY?: number;
    hitOid?: number | string;
    hitClass?: string;
  }>(stdout, "ui_swipe");
  const output: UISwipeResult = {
    target: input.target,
    resolvedOid: resolved.resolvedTarget,
    matchedBy: resolved.matchedBy,
    candidateCount: resolved.candidateCount,
    direction: input.direction,
    distance: dist,
    ok: true,
  };
  if (action.strategyUsed) output.strategyUsed = action.strategyUsed;
  if (action.action) output.action = action.action;
  if (action.targetClass) output.targetClass = action.targetClass;
  if (action.mode) output.mode = action.mode;
  if (action.detail) output.detail = action.detail;
  if (action.fallbackReason) output.fallbackReason = action.fallbackReason;
  if (typeof action.pointX === "number" && typeof action.pointY === "number") {
    output.point = { x: action.pointX, y: action.pointY };
  }
  if (typeof action.endPointX === "number" && typeof action.endPointY === "number") {
    output.endPoint = { x: action.endPointX, y: action.endPointY };
  }
  if (action.hitOid !== undefined && action.hitOid !== null) output.hitOid = String(action.hitOid);
  if (action.hitClass) output.hitClass = action.hitClass;
  return output;
}

async function runSwipe(
  target: string,
  input: UISwipeInput,
  distance: number,
  session: string,
  exec?: ExecFn
): Promise<string> {
  const cliArgs = [
    "swipe",
    target,
    "--direction",
    input.direction,
    "--distance",
    String(distance),
    "--json",
  ];
  if (input.animated) cliArgs.push("--animated");
  const { stdout } = await runCLI(cliArgs, { session, exec, timeoutMs: MUTATION_TIMEOUT_MS });
  return stdout;
}

function shouldRetryCoordinateSwipe(error: unknown): boolean {
  if (!(error instanceof ViewglassCLIError)) return false;
  const text = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n");
  return /coordinate semantic swipe/i.test(text) && /UIPanGestureRecognizer/i.test(text);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
