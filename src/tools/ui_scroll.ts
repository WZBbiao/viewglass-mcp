import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

export type ScrollDirection = "up" | "down" | "left" | "right";

export interface UIScrollInput {
  /** Locator for the scroll view (UIScrollView, UITableView, UICollectionView). */
  locator: string;
  /** Scroll direction. */
  direction: ScrollDirection;
  /** Distance in pts. Defaults to 300 if omitted. */
  distance?: number;
  /** Whether to animate the scroll. Defaults to false. */
  animated?: boolean;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

const DIRECTION_DELTA: Record<ScrollDirection, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/**
 * Scroll a scroll view in the given direction. Returns post-action hierarchy.
 *
 * Use direction "down" to reveal content below, "up" to scroll back,
 * "left"/"right" for horizontal scroll views.
 */
export async function uiScroll(
  input: UIScrollInput,
  exec?: ExecFn
): Promise<{ scrolled: string; direction: ScrollDirection; hierarchy: unknown }> {
  const session = await resolveSession(input.session, exec);
  const dist = input.distance ?? 300;
  const [dx, dy] = DIRECTION_DELTA[input.direction];
  const byArg = `${dx * dist},${dy * dist}`;

  const args = ["scroll", input.locator, "--by", byArg];
  if (input.animated) args.push("--animated");

  await runCLI(args, { session, exec });
  await runCLI(["refresh"], { session, exec });
  const { stdout } = await runCLI(["hierarchy", "--json"], { session, exec });
  const hierarchy = parseJSON(stdout, "ui_scroll/hierarchy");
  return { scrolled: input.locator, direction: input.direction, hierarchy };
}
