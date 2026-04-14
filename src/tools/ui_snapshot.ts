import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UISnapshotInput {
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
  /** Filter hierarchy to nodes of this UIKit class name or query expression. */
  filter?: string;
  /**
   * When false, include the full rawTree hierarchy in the response.
   * Default: true (agent-first compact index + summary, without rawTree).
   */
  compact?: boolean;
}

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
  groupName?: string;
  attributes?: RawAttribute[];
}

interface RawNode {
  oid: number;
  primaryOid?: number;
  oidType?: string;
  viewOid?: number;
  layerOid?: number;
  className: string;
  frame: RawRect;
  bounds?: RawRect;
  parentOid?: number;
  childrenOids?: number[];
  depth?: number;
  isHidden?: boolean;
  alpha?: number;
  isUserInteractionEnabled?: boolean;
  accessibilityIdentifier?: string | null;
  accessibilityLabel?: string | null;
  hostViewControllerClassName?: string | null;
  hostViewControllerOid?: number | null;
  customDisplayTitle?: string | null;
  attributeGroups?: RawAttributeGroup[];
}

interface RawTree {
  node: RawNode;
  children: RawTree[];
}

interface RawHierarchy {
  appInfo: {
    appName: string;
    bundleIdentifier: string;
    deviceType?: string;
    deviceName?: string;
    host?: string;
    port?: number;
    remotePort?: number;
    serverVersion?: string;
  };
  fetchedAt: string;
  screenScale: number;
  screenSize: RawRect;
  serverVersion?: string;
  snapshotId: string;
  windows: RawTree[];
}

interface UISnapshotNode {
  id: string;
  oid: number;
  primaryOid: number;
  className: string;
  oidType?: string;
  frame: RawRect;
  depth: number;
  parentOid?: number;
  parentClassName?: string;
  childrenOids: number[];
  hostViewControllerClassName?: string | null;
  hostViewControllerOid?: number | null;
  text?: string;
  searchableText: string[];
  textSources: Record<string, string>;
  accessibilityIdentifier?: string | null;
  accessibilityLabel?: string | null;
  visible: boolean;
  interactive: boolean;
  actions: string[];
  role: string;
  actionTargetOid: number;
  groupId?: string;
  hints: string[];
}

interface UISnapshotGroup {
  id: string;
  kind: "switcher";
  role: "bottomNavigation" | "topSwitcher";
  containerOid?: number;
  containerClassName?: string;
  frame: RawRect;
  itemOids: number[];
  itemLabels: string[];
  selectedOid?: number | null;
  selectionMode: "single";
  hints: string[];
}

interface UISnapshotSummary {
  visibleText: string[];
  interactiveNodeCount: number;
  textSearchHints: {
    primaryTextFields: string[];
    weakTextFields: string[];
  };
  controllerHints: string[];
  bottomBarCandidates: Array<{
    groupId: string;
    className?: string;
    labelHints: string[];
    selectedLabel?: string | null;
    selectedNodeId?: string | null;
    frame: RawRect;
  }>;
  groupCount: number;
}

export interface UISnapshotOutput {
  app: {
    appName: string;
    bundleIdentifier: string;
    deviceType?: string;
    deviceName?: string;
    session?: string;
    serverVersion?: string;
  };
  snapshot: {
    snapshotId: string;
    fetchedAt: string;
    screenScale: number;
    screenSize: RawRect;
  };
  summary: UISnapshotSummary;
  groups: UISnapshotGroup[];
  nodes: UISnapshotNode[];
  rawTree?: RawHierarchy;
}

/**
 * Capture a UI hierarchy snapshot from the running app and return an
 * agent-first structure:
 * - app / snapshot: session metadata
 * - summary: fast page overview
 * - groups: inferred switcher/navigation clusters
 * - nodes: flattened searchable/actionable node index
 * - rawTree: optional full hierarchy when compact=false
 */
export async function uiSnapshot(
  input: UISnapshotInput,
  exec?: ExecFn
): Promise<UISnapshotOutput> {
  const session = await resolveSession(input.session, exec);
  const args = ["hierarchy", "--json"];
  if (input.filter) args.push("--filter", input.filter);
  const { stdout } = await runCLI(args, { session, exec });
  const hierarchy = parseJSON<RawHierarchy>(stdout, "ui_snapshot");
  return buildAgentSnapshot(hierarchy, session, input.compact !== false);
}

function buildAgentSnapshot(hierarchy: RawHierarchy, session: string, compact: boolean): UISnapshotOutput {
  const rawNodes = flattenTrees(hierarchy.windows);
  const nodesByOid = new Map(rawNodes.map((node) => [node.oid, node]));
  const actionTargetByOid = new Map<number, number>();

  for (const node of rawNodes) {
    actionTargetByOid.set(node.oid, resolveActionTargetOid(node, nodesByOid));
  }

  const groups = buildSwitcherGroups(rawNodes, nodesByOid, actionTargetByOid, hierarchy.screenSize);
  const groupByActionOid = new Map<number, UISnapshotGroup>();
  for (const group of groups) {
    for (const oid of group.itemOids) {
      groupByActionOid.set(oid, group);
    }
  }

  const nodes = rawNodes
    .map((node) => buildSnapshotNode(node, nodesByOid, actionTargetByOid, groupByActionOid))
    .filter((node) => shouldIncludeNode(node, groupByActionOid))
    .sort(sortNodes);

  const summary = buildSummary(hierarchy, nodes, groups);

  return {
    app: {
      appName: hierarchy.appInfo.appName,
      bundleIdentifier: hierarchy.appInfo.bundleIdentifier,
      deviceType: hierarchy.appInfo.deviceType,
      deviceName: hierarchy.appInfo.deviceName,
      session,
      serverVersion: hierarchy.appInfo.serverVersion ?? hierarchy.serverVersion,
    },
    snapshot: {
      snapshotId: hierarchy.snapshotId,
      fetchedAt: hierarchy.fetchedAt,
      screenScale: hierarchy.screenScale,
      screenSize: hierarchy.screenSize,
    },
    summary,
    groups,
    nodes,
    rawTree: compact ? undefined : hierarchy,
  };
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

function extractTextSources(node: RawNode): Record<string, string> {
  const out: Record<string, string> = {};

  if (node.customDisplayTitle && node.customDisplayTitle.trim() !== "") {
    out.customDisplayTitle = node.customDisplayTitle.trim();
  }
  if (node.accessibilityLabel && node.accessibilityLabel.trim() !== "") {
    out.accessibilityLabel = node.accessibilityLabel.trim();
  }
  if (node.accessibilityIdentifier && node.accessibilityIdentifier.trim() !== "") {
    out.accessibilityIdentifier = node.accessibilityIdentifier.trim();
  }

  for (const group of node.attributeGroups ?? []) {
    for (const attr of group.attributes ?? []) {
      const name = attr.displayName ?? attr.key;
      const value = attr.value?.string?._0?.trim();
      if (!name || !value) continue;
      if (["displayText", "text", "title", "accessibilityLabel"].includes(name)) {
        out[name] = value;
      }
    }
  }

  return out;
}

function dedupeStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function buildSnapshotNode(
  node: RawNode,
  nodesByOid: Map<number, RawNode>,
  actionTargetByOid: Map<number, number>,
  groupByActionOid: Map<number, UISnapshotGroup>
): UISnapshotNode {
  const textSources = extractTextSources(node);
  const searchableText = dedupeStrings([
    textSources.customDisplayTitle,
    textSources.displayText,
    textSources.text,
    textSources.title,
    textSources.accessibilityLabel,
    textSources.accessibilityIdentifier,
  ]);
  const text = searchableText[0];
  const visible = (node.isHidden ?? false) === false && (node.alpha ?? 1) > 0 && node.frame.width > 0 && node.frame.height > 0;
  const interactive = Boolean(node.isUserInteractionEnabled) && visible;
  const actionTargetOid = actionTargetByOid.get(node.oid) ?? node.primaryOid ?? node.oid;
  const group = groupByActionOid.get(actionTargetOid);
  const parentClassName = node.parentOid ? nodesByOid.get(node.parentOid)?.className : undefined;
  const actions = inferActions(node, interactive);
  const role = inferRole(node, searchableText, actions, group);
  const hints = inferHints(node, searchableText, group);

  return {
    id: `node_${node.oid}`,
    oid: node.oid,
    primaryOid: node.primaryOid ?? node.oid,
    className: node.className,
    oidType: node.oidType,
    frame: node.frame,
    depth: node.depth ?? 0,
    parentOid: node.parentOid,
    parentClassName,
    childrenOids: node.childrenOids ?? [],
    hostViewControllerClassName: node.hostViewControllerClassName,
    hostViewControllerOid: node.hostViewControllerOid,
    text,
    searchableText,
    textSources,
    accessibilityIdentifier: node.accessibilityIdentifier,
    accessibilityLabel: node.accessibilityLabel,
    visible,
    interactive,
    actions,
    role,
    actionTargetOid,
    groupId: group?.id,
    hints,
  };
}

function inferActions(node: RawNode, interactive: boolean): string[] {
  const actions = new Set<string>();
  const className = node.className;

  if (interactive) actions.add("tap");
  if (/ScrollView|TableView|CollectionView/i.test(className)) actions.add("scroll");
  if (/TextField|TextView/i.test(className)) actions.add("input");
  if (node.hostViewControllerOid || /Controller/i.test(className)) actions.add("dismiss");
  actions.add("invoke");

  return [...actions];
}

function inferRole(node: RawNode, searchableText: string[], actions: string[], group?: UISnapshotGroup): string {
  const className = node.className;
  if (group) return "switcherItem";
  if (/TextField|TextView/i.test(className)) return "input";
  if (/ScrollView|TableView|CollectionView/i.test(className)) return "scrollContainer";
  if (/Button|Control/i.test(className)) return "button";
  if (/Label/i.test(className) && searchableText.length > 0) return "label";
  if (/ImageView/i.test(className)) return "image";
  if (actions.includes("tap") && searchableText.length > 0) return "tapTarget";
  return "node";
}

function inferHints(node: RawNode, searchableText: string[], group?: UISnapshotGroup): string[] {
  const hints: string[] = [];
  if (group?.role === "bottomNavigation") hints.push("bottom_bar");
  if (group?.role === "topSwitcher") hints.push("top_switcher");
  if (group) hints.push("switcher_candidate");
  if (searchableText.length > 0) hints.push("text_visible");
  if (node.hostViewControllerClassName) hints.push("controller_hosted");
  if (/Cell/i.test(node.className)) hints.push("list_cell");
  return hints;
}

function shouldIncludeNode(node: UISnapshotNode, groupByActionOid: Map<number, UISnapshotGroup>): boolean {
  if (node.groupId) return true;
  if (node.searchableText.length > 0) return true;
  if (node.accessibilityIdentifier || node.accessibilityLabel) return true;
  if (node.hostViewControllerClassName) return true;
  if (/Button|Label|Image|ScrollView|TableView|CollectionView|TextField|TextView|Cell|Tab|Navigation/i.test(node.className)) return true;
  return groupByActionOid.has(node.actionTargetOid);
}

function sortNodes(a: UISnapshotNode, b: UISnapshotNode): number {
  if (a.frame.y !== b.frame.y) return a.frame.y - b.frame.y;
  if (a.frame.x !== b.frame.x) return a.frame.x - b.frame.x;
  return a.oid - b.oid;
}

function resolveActionTargetOid(node: RawNode, nodesByOid: Map<number, RawNode>): number {
  let current = node;
  let steps = 0;

  while (steps < 5 && current.parentOid) {
    const parent = nodesByOid.get(current.parentOid);
    if (!parent) break;
    if (!parent.isUserInteractionEnabled) break;
    if ((parent.isHidden ?? false) || (parent.alpha ?? 1) <= 0) break;

    if (shouldPreferAncestorAsActionTarget(current, parent)) {
      current = parent;
      steps += 1;
      continue;
    }
    break;
  }

  return current.primaryOid ?? current.oid;
}

function shouldPreferAncestorAsActionTarget(node: RawNode, parent: RawNode): boolean {
  const nodeClass = node.className;
  const parentClass = parent.className;
  const nodeArea = Math.max(1, node.frame.width * node.frame.height);
  const parentArea = Math.max(1, parent.frame.width * parent.frame.height);
  const nodeIsLeafLike = /Label|ImageView|ButtonLabel/i.test(nodeClass);

  if (nodeIsLeafLike && parentArea >= nodeArea * 1.2) {
    return true;
  }
  if (/UIButton/i.test(parentClass) || /Cell/i.test(parentClass)) {
    return true;
  }
  if (nodeIsLeafLike && /Tab|Segment|Control/i.test(parentClass) && parentArea >= nodeArea) {
    return true;
  }
  return false;
}

function buildSwitcherGroups(
  rawNodes: RawNode[],
  nodesByOid: Map<number, RawNode>,
  actionTargetByOid: Map<number, number>,
  screenSize: RawRect
): UISnapshotGroup[] {
  const candidates = rawNodes
    .filter((node) => {
      const texts = extractTextSources(node);
      const hasText = dedupeStrings([
        texts.customDisplayTitle,
        texts.displayText,
        texts.text,
        texts.title,
        texts.accessibilityLabel,
      ]).length > 0;
      const visible = (node.isHidden ?? false) === false && (node.alpha ?? 1) > 0 && node.frame.width > 0 && node.frame.height > 0;
      return hasText && visible && Boolean(node.isUserInteractionEnabled);
    })
    .map((node) => {
      const actionOid = actionTargetByOid.get(node.oid) ?? node.primaryOid ?? node.oid;
      return {
        source: node,
        target: nodesByOid.get(actionOid) ?? node,
        texts: dedupeStrings(Object.values(extractTextSources(node))),
      };
    });

  const uniqueTargets = new Map<number, { target: RawNode; texts: string[] }>();
  for (const candidate of candidates) {
    const oid = candidate.target.oid;
    const existing = uniqueTargets.get(oid);
    if (!existing) {
      uniqueTargets.set(oid, { target: candidate.target, texts: candidate.texts });
    } else {
      existing.texts = dedupeStrings([...existing.texts, ...candidate.texts]);
    }
  }

  const bottomTargets = [...uniqueTargets.values()]
    .filter(({ target, texts }) => texts.length > 0 && target.frame.y >= screenSize.height * 0.7)
    .sort((a, b) => a.target.frame.x - b.target.frame.x);

  const groups: UISnapshotGroup[] = [];
  if (bottomTargets.length >= 2) {
    const group = makeGroup("group_bottom_1", "bottomNavigation", bottomTargets);
    if (group) groups.push(group);
  }

  const topTargets = [...uniqueTargets.values()]
    .filter(({ target, texts }) => texts.length > 0 && target.frame.y <= screenSize.height * 0.25)
    .sort((a, b) => a.target.frame.x - b.target.frame.x);

  if (topTargets.length >= 2) {
    const group = makeGroup("group_top_1", "topSwitcher", topTargets);
    if (group) groups.push(group);
  }

  return groups;
}

function makeGroup(
  id: string,
  role: "bottomNavigation" | "topSwitcher",
  items: Array<{ target: RawNode; texts: string[] }>
): UISnapshotGroup | undefined {
  const labels = items.map((item) => item.texts[0]).filter(Boolean) as string[];
  if (labels.length < 2) return undefined;

  const itemOids = items.map((item) => item.target.primaryOid ?? item.target.oid);
  const xs = items.map((item) => item.target.frame.x);
  const ys = items.map((item) => item.target.frame.y);
  const rights = items.map((item) => item.target.frame.x + item.target.frame.width);
  const bottoms = items.map((item) => item.target.frame.y + item.target.frame.height);

  return {
    id,
    kind: "switcher",
    role,
    containerOid: items[0]?.target.parentOid,
    containerClassName: undefined,
    frame: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...rights) - Math.min(...xs),
      height: Math.max(...bottoms) - Math.min(...ys),
    },
    itemOids,
    itemLabels: labels,
    selectedOid: null,
    selectionMode: "single",
    hints: role === "bottomNavigation" ? ["bottom_edge", "switcher"] : ["top_edge", "switcher"],
  };
}

function buildSummary(hierarchy: RawHierarchy, nodes: UISnapshotNode[], groups: UISnapshotGroup[]): UISnapshotSummary {
  const visibleText = dedupeStrings(nodes.flatMap((node) => node.searchableText)).slice(0, 40);
  const controllerHints = dedupeStrings(nodes.map((node) => node.hostViewControllerClassName ?? undefined));
  const bottomBarCandidates = groups
    .filter((group) => group.role === "bottomNavigation")
    .map((group) => ({
      groupId: group.id,
      className: group.containerClassName,
      labelHints: group.itemLabels,
      selectedLabel: undefined,
      selectedNodeId: group.selectedOid ? `node_${group.selectedOid}` : undefined,
      frame: group.frame,
    }));

  return {
    visibleText,
    interactiveNodeCount: nodes.filter((node) => node.interactive).length,
    textSearchHints: {
      primaryTextFields: ["customDisplayTitle", "displayText"],
      weakTextFields: ["accessibilityLabel", "accessibilityIdentifier"],
    },
    controllerHints,
    bottomBarCandidates,
    groupCount: groups.length,
  };
}
