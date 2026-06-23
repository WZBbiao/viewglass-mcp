import { parseJSON, runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveActionLocator } from "./locator.js";

export interface UIDismissInput {
  /** Stable locator such as an accessibilityIdentifier. Preferred for replay. */
  locator?: string;
  /** Runtime OID from ui_snapshot. The target can be a UIViewController node or any view hosted by one. */
  oid?: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface UIDismissResult {
  oid: string;
  locator?: string;
  resolvedOid?: string;
  matchedBy?: string;
  candidateCount?: number;
  ok: true;
}

interface RawNode {
  oid: number;
  primaryOid?: number;
  parentOid?: number;
  className?: string;
  hostViewControllerOid?: number | null;
}

interface RawTree {
  node: RawNode;
  children?: RawTree[];
}

interface RawHierarchy {
  windows?: RawTree[];
}

/**
 * Dismiss a UIViewController (modal dismiss or navigation pop).
 *
 * The target can be a view, a view controller, or any node — Viewglass
 * automatically finds the hosting UIViewController and calls dismiss/pop.
 *
 * Returns { target, ok: true, resolvedTarget, matchedBy }.
 * No automatic post-action summary is returned because animated transitions can make
 * immediate snapshots stale. Call ui_snapshot or ui_wait explicitly if verification is needed.
 * Prefer this over calling ui_invoke with popViewControllerAnimated: for
 * standard navigation patterns.
 */
export async function uiDismiss(
  input: UIDismissInput,
  exec?: ExecFn
): Promise<UIDismissResult> {
  if (!input.locator && !input.oid) {
    throw new Error("ui_dismiss requires either 'locator' or 'oid'. Prefer locator for reusable flows.");
  }
  const session = await resolveSession(input.session, exec);
  const locatorResolved = input.locator
    ? await resolveActionLocator(input.locator, session, "dismiss", exec)
    : undefined;
  const target = locatorResolved?.resolvedTarget ?? input.oid!;
  const resolvedOid = await resolveDismissTargetOid(target, session, exec);
  await runCLI(["dismiss", resolvedOid, "--json"], { session, exec });
  const result: UIDismissResult = {
    oid: target,
    ok: true,
  };
  if (input.locator) result.locator = input.locator;
  if (locatorResolved) {
    result.matchedBy = locatorResolved.matchedBy;
    result.candidateCount = locatorResolved.candidateCount;
  }
  if (resolvedOid !== target) result.resolvedOid = resolvedOid;
  return result;
}

async function resolveDismissTargetOid(oid: string, session: string, exec?: ExecFn): Promise<string> {
  const numericOid = Number(oid);
  if (!Number.isInteger(numericOid)) return oid;

  const { stdout } = await runCLI(["hierarchy", "--json"], { session, exec });
  const hierarchy = parseJSON<RawHierarchy>(stdout, "ui_dismiss/hierarchy");
  const nodes = flattenTrees(hierarchy.windows ?? []);
  const byOid = new Map(nodes.map((node) => [node.oid, node]));
  const start = byOid.get(numericOid) ?? nodes.find((node) => node.primaryOid === numericOid);
  if (!start) return oid;

  let probe: RawNode | undefined = start;
  for (let steps = 0; probe && steps < 20; steps += 1) {
    if (probe.hostViewControllerOid) return String(probe.hostViewControllerOid);
    probe = probe.parentOid ? byOid.get(probe.parentOid) : undefined;
  }

  return oid;
}

function flattenTrees(trees: RawTree[]): RawNode[] {
  const result: RawNode[] = [];
  const walk = (tree: RawTree) => {
    result.push(tree.node);
    for (const child of tree.children ?? []) walk(child);
  };
  for (const tree of trees) walk(tree);
  return result;
}
