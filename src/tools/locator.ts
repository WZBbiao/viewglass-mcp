import { runCLI, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { uiSnapshot } from "./ui_snapshot.js";
import { logResolveDecision } from "../log.js";

type QueryLikeNode = {
  oid?: number | string;
  primaryOid?: number | string;
};

type ActionKind = "tap" | "scroll" | "input" | "dismiss";

type SnapshotLikeNode = {
  oid: number;
  primaryOid: number;
  className: string;
  controllerClass?: string | null;
  text?: string;
  searchableText: string[];
  accessibilityIdentifier?: string | null;
  actionTargetOid?: number;
};

export interface ResolvedLocator {
  input: string;
  resolvedTarget: string;
  matchedBy: string;
  candidateCount: number;
}

export interface ResolvedQueryLocator {
  input: string;
  queryExpression: string;
  matchedBy: string;
}

type SnapshotGroupLike = {
  id: string;
  role: "bottomNavigation" | "topSwitcher";
  itemOids: number[];
  itemLabels: string[];
  items?: Array<{ oid: number; label: string; selected?: boolean; selectedReason?: string }>;
  selectedOid?: number | null;
  selectedReason?: string;
};

function escapeContains(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseLegacyLocator(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;

  if (
    value.startsWith("#") ||
    value.startsWith("@") ||
    value.startsWith("contains:") ||
    value.startsWith("oid:") ||
    value.startsWith("controller:") ||
    value.startsWith("ancestor:") ||
    value.startsWith("parent:") ||
    value.startsWith("tag:") ||
    value.startsWith(".") ||
    /\bAND\b|\bOR\b|\bNOT\b|[()]/.test(value)
  ) {
    return value;
  }

  return undefined;
}

export function buildQueryExpressions(raw: string): string[] {
  const value = raw.trim();
  if (!value) throw new Error("locator must be a non-empty string");

  const legacy = parseLegacyLocator(value);
  if (legacy) return [legacy];

  if (/^\d+$/.test(value)) return [value];

  return [`#${value}`, `contains:"${escapeContains(value)}"`, value];
}

async function runQueryExpression(
  expression: string,
  session: string,
  exec?: ExecFn
): Promise<QueryLikeNode[]> {
  const { stdout } = await runCLI(["query", expression, "--json"], { session, exec });
  const result = parseJSON<unknown>(stdout, "locator/query");
  return Array.isArray(result) ? (result as QueryLikeNode[]) : [result as QueryLikeNode];
}

export async function uiQueryWithPlainLocator(
  raw: string,
  session: string,
  exec?: ExecFn
): Promise<QueryLikeNode[]> {
  for (const expression of buildQueryExpressions(raw)) {
    const nodes = await runQueryExpression(expression, session, exec);
    logResolveDecision(session, "query", raw, {
      expression,
      candidateCount: nodes.length,
    });
    if (nodes.length > 0) return nodes;
  }
  return [];
}

function supportsAction(actions: string[], action: ActionKind): boolean {
  if (action === "dismiss") return actions.includes("dismiss") || actions.includes("invoke");
  return actions.includes(action);
}

function uniqueResolvedTarget(
  candidates: Array<{ actionTargetOid?: number }>,
  input: string,
  matchedBy: string
): ResolvedLocator | undefined {
  const unique = [
    ...new Set(
      candidates
        .map((candidate) => candidate.actionTargetOid)
        .filter((oid): oid is number => oid !== undefined)
    ),
  ];
  if (unique.length !== 1) return undefined;
  return {
    input,
    resolvedTarget: String(unique[0]),
    matchedBy,
    candidateCount: candidates.length,
  };
}

function classifySnapshotNodes(raw: string, nodes: SnapshotLikeNode[]) {
  const lower = raw.toLocaleLowerCase();
  return {
    exactAccessibility: nodes.filter(
      (node) => node.accessibilityIdentifier?.toLocaleLowerCase() === lower
    ),
    exactText: nodes.filter((node) =>
      node.searchableText.some((text) => text.toLocaleLowerCase() === lower)
    ),
    containsText: nodes.filter((node) =>
      node.searchableText.some((text) => text.toLocaleLowerCase().includes(lower))
    ),
    classMatches: nodes.filter(
      (node) =>
        node.className.toLocaleLowerCase().includes(lower) ||
        node.controllerClass?.toLocaleLowerCase().includes(lower)
    ),
  };
}

function classifyGroups(raw: string, groups: SnapshotGroupLike[]) {
  const lower = raw.toLocaleLowerCase();
  const entries = groups.flatMap((group) => {
    const items: Array<{ oid: number; label: string; selected?: boolean; selectedReason?: string }> =
      group.items ?? group.itemLabels.map((label, index) => ({ oid: group.itemOids[index], label, selected: false }));
    return items.map((item) => ({ group, itemOid: item.oid, label: item.label, selected: item.selected, selectedReason: item.selectedReason }));
  });
  const exact = entries.filter((entry) => entry.label.toLocaleLowerCase() === lower);
  const contains = entries.filter((entry) => entry.label.toLocaleLowerCase().includes(lower));
  exact.sort((a, b) => Number(Boolean(b.selected)) - Number(Boolean(a.selected)));
  contains.sort((a, b) => Number(Boolean(b.selected)) - Number(Boolean(a.selected)));
  return { exact, contains };
}

export async function resolveQueryLocatorExpression(
  raw: string,
  session: string,
  exec?: ExecFn
): Promise<ResolvedQueryLocator> {
  const value = raw.trim();
  if (!value) throw new Error("locator must be a non-empty string");

  const legacy = parseLegacyLocator(value);
  if (legacy || /^\d+$/.test(value)) {
    return {
      input: value,
      queryExpression: value,
      matchedBy: legacy ? "legacy locator" : "oid",
    };
  }

  const snapshot = await uiSnapshot({ session, compact: true }, exec);
  const { exactAccessibility, exactText, containsText, classMatches } = classifySnapshotNodes(
    value,
    snapshot.nodes
  );
  const { exact: exactGroupLabels, contains: containsGroupLabels } = classifyGroups(value, snapshot.groups);
  logResolveDecision(session, "resolveQueryLocatorExpression", value, {
    exactAccessibility: exactAccessibility.length,
    exactGroupLabels: exactGroupLabels.length,
    containsGroupLabels: containsGroupLabels.length,
    exactText: exactText.length,
    containsText: containsText.length,
    classMatches: classMatches.length,
  });

  if (exactAccessibility.length > 0) {
    return { input: value, queryExpression: `#${value}`, matchedBy: "accessibilityIdentifier" };
  }
  if (exactGroupLabels.length > 0 || containsGroupLabels.length > 0) {
    return { input: value, queryExpression: `contains:"${escapeContains(value)}"`, matchedBy: "group label" };
  }
  if (exactText.length > 0 || containsText.length > 0) {
    return { input: value, queryExpression: `contains:"${escapeContains(value)}"`, matchedBy: "visible text" };
  }
  if (classMatches.length > 0) {
    return { input: value, queryExpression: value, matchedBy: "class name" };
  }

  return {
    input: value,
    queryExpression: buildQueryExpressions(value)[0],
    matchedBy: "default fallback",
  };
}

export async function resolveUniqueNodeLocator(
  raw: string,
  session: string,
  exec?: ExecFn
): Promise<ResolvedLocator> {
  const value = raw.trim();
  if (!value) throw new Error("locator must be a non-empty string");

  const legacy = parseLegacyLocator(value);
  if (legacy || /^\d+$/.test(value)) {
    return {
      input: value,
      resolvedTarget: value,
      matchedBy: legacy ? "legacy locator" : "oid",
      candidateCount: 1,
    };
  }

  const snapshot = await uiSnapshot({ session, compact: true }, exec);
  const { exactAccessibility, exactText, containsText, classMatches } = classifySnapshotNodes(
    value,
    snapshot.nodes
  );
  const { exact: exactGroupLabels, contains: containsGroupLabels } = classifyGroups(value, snapshot.groups);
  logResolveDecision(session, "resolveUniqueNodeLocator", value, {
    exactAccessibility: exactAccessibility.length,
    exactGroupLabels: exactGroupLabels.length,
    containsGroupLabels: containsGroupLabels.length,
    exactText: exactText.length,
    containsText: containsText.length,
    classMatches: classMatches.length,
    groupCount: snapshot.groups.length,
  });

  const chooseUnique = (
    candidates: SnapshotLikeNode[],
    matchedBy: string
  ): ResolvedLocator | undefined => {
    const unique = [...new Set(candidates.map((node) => node.primaryOid).filter(Boolean))];
    if (unique.length !== 1) return undefined;
    return {
      input: value,
      resolvedTarget: String(unique[0]),
      matchedBy,
      candidateCount: candidates.length,
    };
  };

  const exactAccessibilityResolved = chooseUnique(exactAccessibility, "accessibilityIdentifier");
  if (exactAccessibilityResolved) return exactAccessibilityResolved;

  const exactGroupResolved = chooseUnique(
    exactGroupLabels.map((match) => ({ primaryOid: match.itemOid, actionTargetOid: match.itemOid } as SnapshotLikeNode)),
    "group label"
  );
  if (exactGroupResolved) return exactGroupResolved;

  const containsGroupResolved = chooseUnique(
    containsGroupLabels.map((match) => ({ primaryOid: match.itemOid, actionTargetOid: match.itemOid } as SnapshotLikeNode)),
    "group label contains"
  );
  if (containsGroupResolved) return containsGroupResolved;

  const exactTextResolved = chooseUnique(exactText, "visible text");
  if (exactTextResolved) return exactTextResolved;

  const containsResolved = chooseUnique(containsText, "text contains");
  if (containsResolved) return containsResolved;

  const classResolved = chooseUnique(classMatches, "class name");
  if (classResolved) return classResolved;

  const fallbackQueryNodes = await uiQueryWithPlainLocator(value, session, exec);
  const fallbackResolvedTargets = [
    ...new Set(
      fallbackQueryNodes
        .map((node) => node.primaryOid ?? node.oid)
        .filter((oid): oid is number | string => oid !== undefined && oid !== null)
        .map(String)
    ),
  ];
  if (fallbackResolvedTargets.length === 1) {
    return {
      input: value,
      resolvedTarget: fallbackResolvedTargets[0],
      matchedBy: "query fallback",
      candidateCount: 1,
    };
  }

  if (fallbackResolvedTargets.length > 1) {
    logResolveDecision(session, "resolveUniqueNodeLocator.multiple", value, {
      fallbackResolvedTargets,
    });
    throw new Error(
      `Locator '${value}' matched ${fallbackResolvedTargets.length} targets. Refine the plain text label or accessibility identifier.`
    );
  }

  throw new Error(`Locator '${value}' matched no targets.`);
}

export async function resolveActionLocator(
  raw: string,
  session: string,
  action: ActionKind,
  exec?: ExecFn
): Promise<ResolvedLocator> {
  const value = raw.trim();
  if (!value) throw new Error("locator must be a non-empty string");

  const legacy = parseLegacyLocator(value);
  if (legacy || /^\d+$/.test(value)) {
    return {
      input: value,
      resolvedTarget: value,
      matchedBy: legacy ? "legacy locator" : "oid",
      candidateCount: 1,
    };
  }

  const snapshot = await uiSnapshot({ session, compact: true }, exec);
  const actionNodes = snapshot.nodes.filter((node) => supportsAction(node.actions, action));
  const { exactAccessibility, exactText, containsText, classMatches } = classifySnapshotNodes(
    value,
    actionNodes
  );
  const actionGroups = snapshot.groups.filter((group) => group.role === "bottomNavigation" || group.role === "topSwitcher");
  const { exact: exactGroupLabels, contains: containsGroupLabels } = classifyGroups(value, actionGroups);
  logResolveDecision(session, "resolveActionLocator", value, {
    action,
    actionNodeCount: actionNodes.length,
    actionGroupCount: actionGroups.length,
    exactAccessibility: exactAccessibility.length,
    exactGroupLabels: exactGroupLabels.length,
    containsGroupLabels: containsGroupLabels.length,
    exactText: exactText.length,
    containsText: containsText.length,
    classMatches: classMatches.length,
  });
  const exactAccessibilityResolved = uniqueResolvedTarget(exactAccessibility, value, "accessibilityIdentifier");
  if (exactAccessibilityResolved) return exactAccessibilityResolved;

  const exactGroupLabelResolved = uniqueResolvedTarget(
    exactGroupLabels.map((match) => ({ actionTargetOid: match.itemOid })),
    value,
    "group label"
  );
  if (exactGroupLabelResolved) return exactGroupLabelResolved;

  const containsGroupLabelResolved = uniqueResolvedTarget(
    containsGroupLabels.map((match) => ({ actionTargetOid: match.itemOid })),
    value,
    "group label contains"
  );
  if (containsGroupLabelResolved) return containsGroupLabelResolved;

  const exactTextResolved = uniqueResolvedTarget(exactText, value, "visible text");
  if (exactTextResolved) return exactTextResolved;

  const classResolved = uniqueResolvedTarget(classMatches, value, "class name");
  if (classResolved) return classResolved;

  const containsResolved = uniqueResolvedTarget(containsText, value, "text contains");
  if (containsResolved) return containsResolved;

  const fallbackQueryNodes = await uiQueryWithPlainLocator(value, session, exec);
  const fallbackResolvedTargets = [
    ...new Set(
      fallbackQueryNodes
        .map((node) => node.primaryOid ?? node.oid)
        .filter((oid): oid is number | string => oid !== undefined && oid !== null)
        .map(String)
    ),
  ];
  if (fallbackResolvedTargets.length === 1) {
    return {
      input: value,
      resolvedTarget: fallbackResolvedTargets[0],
      matchedBy: "query fallback",
      candidateCount: 1,
    };
  }

  if (fallbackResolvedTargets.length > 1) {
    logResolveDecision(session, "resolveActionLocator.multiple", value, {
      fallbackResolvedTargets,
    });
    throw new Error(
      `Locator '${value}' matched ${fallbackResolvedTargets.length} targets. Refine the plain text label or accessibility identifier.`
    );
  }

  throw new Error(`Locator '${value}' matched no targets.`);
}
