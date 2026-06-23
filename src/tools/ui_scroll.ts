import { parseJSON, runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveActionLocator } from "./locator.js";
import { MUTATION_TIMEOUT_MS } from "./timeouts.js";

export type ScrollDirection = "up" | "down" | "left" | "right";

export interface UIScrollInput {
  /** Stable locator such as an accessibilityIdentifier. Preferred for replay. */
  locator?: string;
  /** Runtime OID from ui_snapshot. Not stable across app launches. */
  oid?: string;
  /** Scroll direction. */
  direction: ScrollDirection;
  /** Distance in pts. Defaults to 300 if omitted. */
  distance?: number;
  /** Whether to animate the swipe. Defaults to true for human-like scrolling. */
  animated?: boolean;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

const SWIPE_DIRECTION: Record<ScrollDirection, ScrollDirection> = {
  // User-facing scroll direction describes content movement. Finger movement is
  // opposite: swipe up to reveal content below, swipe down to scroll back.
  down: "up",
  up: "down",
  right: "left",
  left: "right",
};

interface RawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RawAttributeValue {
  string?: { _0?: string };
}

interface RawAttribute {
  key?: string;
  displayName?: string;
  value?: RawAttributeValue;
}

interface RawAttributeGroup {
  attributes?: RawAttribute[];
}

interface RawNode {
  oid: number;
  primaryOid?: number;
  viewOid?: number;
  className: string;
  frame: RawRect;
  bounds?: RawRect;
  parentOid?: number;
  childrenOids?: number[];
  isHidden?: boolean;
  alpha?: number;
  attributeGroups?: RawAttributeGroup[];
}

interface RawTree {
  node: RawNode;
  children?: RawTree[];
}

interface RawHierarchy {
  windows?: RawTree[];
  screenSize?: RawRect;
}

interface ScrollResolution {
  oid: string;
  resolvedFromOid?: string;
  className?: string;
}

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
  locator?: string;
  resolvedOid?: string;
  matchedBy?: string;
  candidateCount?: number;
  direction: ScrollDirection;
  distance: number;
  strategyUsed: "swipe";
  targetClass?: string;
}> {
  if (!input.locator && !input.oid) {
    throw new Error("ui_scroll requires either 'locator' or 'oid'. Prefer locator for reusable flows.");
  }
  const session = await resolveSession(input.session, exec);
  const dist = input.distance ?? 300;
  const locatorResolved = input.locator
    ? await resolveActionLocator(input.locator, session, "scroll", exec)
    : undefined;
  const target = locatorResolved?.resolvedTarget ?? input.oid!;
  const resolved = await resolveScrollTarget(target, session, exec);
  const swipeDirection = SWIPE_DIRECTION[input.direction];
  const args = [
    "swipe",
    resolved.oid,
    "--direction",
    swipeDirection,
    "--distance",
    String(dist),
    "--json",
  ];
  if (input.animated !== false) args.push("--animated");

  const { stdout } = await runCLI(args, { session, exec, timeoutMs: MUTATION_TIMEOUT_MS });
  const action = parseJSON<{ targetClass?: string }>(stdout, "ui_scroll/swipe");
  const result: {
    ok: true;
    oid: string;
    locator?: string;
    resolvedOid?: string;
    matchedBy?: string;
    candidateCount?: number;
    direction: ScrollDirection;
    distance: number;
    strategyUsed: "swipe";
    targetClass?: string;
  } = {
    ok: true,
    oid: target,
    direction: input.direction,
    distance: dist,
    strategyUsed: "swipe",
  };
  if (input.locator) result.locator = input.locator;
  if (locatorResolved) {
    result.resolvedOid = resolved.oid;
    result.matchedBy = locatorResolved.matchedBy;
    result.candidateCount = locatorResolved.candidateCount;
  }
  if (resolved.resolvedFromOid) result.resolvedOid = resolved.oid;
  if (action.targetClass ?? resolved.className) result.targetClass = action.targetClass ?? resolved.className;
  return result;
}

async function resolveScrollTarget(oid: string, session: string, exec?: ExecFn): Promise<ScrollResolution> {
  const numericOid = Number(oid);
  if (!Number.isInteger(numericOid)) return { oid };

  try {
    const { stdout } = await runCLI(["hierarchy", "--json"], { session, exec });
    const hierarchy = parseJSON<RawHierarchy>(stdout, "ui_scroll/hierarchy");
    const nodes = flattenTrees(hierarchy.windows ?? []);
    const byOid = new Map(nodes.map((node) => [node.oid, node]));
    const target = byOid.get(numericOid) ?? nodes.find((node) => node.primaryOid === numericOid || node.viewOid === numericOid);
    if (!target) return { oid };

    const targetScroll = toExecutableScrollTarget(target);
    if (targetScroll) return targetScroll;

    const descendant = bestDescendantScrollTarget(target, nodes);
    if (descendant) return { ...descendant, resolvedFromOid: oid };

    const ancestor = nearestAncestorScrollTarget(target, byOid);
    if (ancestor) return { ...ancestor, resolvedFromOid: oid };
  } catch {
    return { oid };
  }

  return { oid };
}

function flattenTrees(trees: RawTree[]): RawNode[] {
  const result: RawNode[] = [];
  const walk = (tree: RawTree, parent?: RawNode) => {
    const node = parent
      ? {
          ...tree.node,
          frame: {
            x: parent.frame.x + tree.node.frame.x - (parent.bounds?.x ?? 0),
            y: parent.frame.y + tree.node.frame.y - (parent.bounds?.y ?? 0),
            width: tree.node.frame.width,
            height: tree.node.frame.height,
          },
        }
      : { ...tree.node, frame: { ...tree.node.frame } };
    result.push(node);
    for (const child of tree.children ?? []) walk(child, node);
  };
  for (const tree of trees) walk(tree);
  return result;
}

function bestDescendantScrollTarget(target: RawNode, nodes: RawNode[]): ScrollResolution | undefined {
  const candidates = nodes
    .filter((node) => node.oid !== target.oid && isDescendantOf(node, target, nodes))
    .map(toExecutableScrollTarget)
    .filter((node): node is ScrollResolution => Boolean(node));
  return candidates[0];
}

function nearestAncestorScrollTarget(target: RawNode, byOid: Map<number, RawNode>): ScrollResolution | undefined {
  let probe = target.parentOid ? byOid.get(target.parentOid) : undefined;
  let steps = 0;
  while (probe && steps < 20) {
    const scrollTarget = toExecutableScrollTarget(probe);
    if (scrollTarget) return scrollTarget;
    probe = probe.parentOid ? byOid.get(probe.parentOid) : undefined;
    steps += 1;
  }
  return undefined;
}

function isDescendantOf(node: RawNode, ancestor: RawNode, nodes: RawNode[]): boolean {
  const byOid = new Map(nodes.map((item) => [item.oid, item]));
  let probe = node.parentOid ? byOid.get(node.parentOid) : undefined;
  let steps = 0;
  while (probe && steps < 40) {
    if (probe.oid === ancestor.oid) return true;
    probe = probe.parentOid ? byOid.get(probe.parentOid) : undefined;
    steps += 1;
  }
  return false;
}

function toExecutableScrollTarget(node: RawNode): ScrollResolution | undefined {
  if (!isVisible(node)) return undefined;
  if (!hasContentOffset(node)) return undefined;
  return {
    oid: String(node.viewOid ?? node.primaryOid ?? node.oid),
    className: node.className,
  };
}

function isVisible(node: RawNode): boolean {
  return (node.isHidden ?? false) === false &&
    (node.alpha ?? 1) > 0 &&
    node.frame.width > 0 &&
    node.frame.height > 0;
}

function hasContentOffset(node: RawNode): boolean {
  for (const group of node.attributeGroups ?? []) {
    for (const attr of group.attributes ?? []) {
      if (attr.key === "contentOffset" || attr.key === "sv_o_o") return true;
      if (attr.displayName === "contentOffset" || attr.displayName === "sv_o_o") return true;
    }
  }
  return false;
}
