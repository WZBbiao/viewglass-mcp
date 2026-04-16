import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";

export type ScrollDirection = "up" | "down" | "left" | "right";

export interface UIScrollInput {
  /** Executable node oid from ui_snapshot. */
  oid: string;
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
 * Scroll a scroll view in the given direction and return an execution summary only.
 *
 * Use direction "down" to reveal content below, "up" to scroll back,
 * "left"/"right" for horizontal scroll views.
 */
export async function uiScroll(
  input: UIScrollInput,
  exec?: ExecFn
): Promise<{
  ok: true;
  oid: string;
  direction: ScrollDirection;
  distance: number;
}> {
  if (!input.oid || String(input.oid).trim() === "") {
    throw new Error("ui_scroll requires an exact oid from ui_snapshot. First inspect ui_snapshot.groups/nodes, then pass that oid to ui_scroll.");
  }
  const session = await resolveSession(input.session, exec);
  const dist = input.distance ?? 300;
  const [dx, dy] = DIRECTION_DELTA[input.direction];
  const byArg = `${dx * dist},${dy * dist}`;

  const args = ["scroll", input.oid, "--by", byArg];
  if (input.animated) args.push("--animated");

  await runCLI(args, { session, exec });
  return {
    ok: true,
    oid: input.oid,
    direction: input.direction,
    distance: dist,
  };
}
