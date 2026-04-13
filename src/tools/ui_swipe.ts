import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";

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
  direction: SwipeDirection;
  distance: number;
  ok: true;
}

/**
 * Swipe a UIScrollView node in a given direction.
 *
 * Unlike ui_scroll (which uses contentOffset manipulation), ui_swipe triggers
 * a real swipe gesture, making it suitable for gesture-driven interactions,
 * paging scroll views, or carousel components.
 *
 * Returns { target, direction, distance, ok: true }.
 */
export async function uiSwipe(
  input: UISwipeInput,
  exec?: ExecFn
): Promise<UISwipeResult> {
  const session = await resolveSession(input.session, exec);
  const dist = input.distance ?? 200;
  const cliArgs = [
    "swipe",
    input.target,
    "--direction",
    input.direction,
    "--distance",
    String(dist),
    "--json",
  ];
  if (input.animated) cliArgs.push("--animated");

  await runCLI(cliArgs, { session, exec });
  return {
    target: input.target,
    direction: input.direction,
    distance: dist,
    ok: true,
  };
}
