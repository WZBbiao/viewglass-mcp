import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { uiSnapshot } from "./ui_snapshot.js";
import { resolveActionLocator } from "./locator.js";

export type ScrollDirection = "up" | "down" | "left" | "right";

export interface UIScrollInput {
  /** Plain locator string for the scroll view (text, accessibility id, class name, or oid). */
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
 * Scroll a scroll view in the given direction. Returns a lightweight post-action summary.
 *
 * Use direction "down" to reveal content below, "up" to scroll back,
 * "left"/"right" for horizontal scroll views.
 */
export async function uiScroll(
  input: UIScrollInput,
  exec?: ExecFn
): Promise<{
  ok: true;
  locator: string;
  resolvedTarget: string;
  matchedBy: string;
  direction: ScrollDirection;
  distance: number;
  postState: {
    snapshotId: string;
    visibleText: string[];
    controllerHints: string[];
    bottomBarCandidates: unknown[];
    groupCount: number;
  };
}> {
  const session = await resolveSession(input.session, exec);
  const dist = input.distance ?? 300;
  const [dx, dy] = DIRECTION_DELTA[input.direction];
  const byArg = `${dx * dist},${dy * dist}`;
  const resolved = await resolveActionLocator(input.locator, session, "scroll", exec);

  const args = ["scroll", resolved.resolvedTarget, "--by", byArg];
  if (input.animated) args.push("--animated");

  await runCLI(args, { session, exec });
  await runCLI(["refresh"], { session, exec });
  const snapshot = await uiSnapshot({ session, compact: true }, exec);
  return {
    ok: true,
    locator: input.locator,
    resolvedTarget: resolved.resolvedTarget,
    matchedBy: resolved.matchedBy,
    direction: input.direction,
    distance: dist,
    postState: {
      snapshotId: snapshot.snapshot.snapshotId,
      visibleText: snapshot.summary.visibleText.slice(0, 12),
      controllerHints: snapshot.summary.controllerHints.slice(0, 4),
      bottomBarCandidates: snapshot.summary.bottomBarCandidates,
      groupCount: snapshot.summary.groupCount,
    },
  };
}
