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
  /** Whether to animate the scroll. Defaults to true. */
  animated?: boolean;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

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
  const args = [
    "scroll",
    input.locator,
    "--direction",
    input.direction,
  ];
  if (input.distance !== undefined) args.push("--distance", String(input.distance));
  if (input.animated === false) args.push("--animated", "false");

  await runCLI(args, { session, exec });
  await runCLI(["refresh"], { session, exec });
  const { stdout } = await runCLI(["hierarchy", "--json"], { session, exec });
  const hierarchy = parseJSON(stdout, "ui_scroll/hierarchy");
  return { scrolled: input.locator, direction: input.direction, hierarchy };
}
