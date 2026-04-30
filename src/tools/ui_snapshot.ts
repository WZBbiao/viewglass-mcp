import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

import { loadProjectRecipes, matchProjectRecipes, type ProjectRecipeMatch } from "../project_recipes.js";

export interface UISnapshotInput {
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
  /** Filter hierarchy to nodes of this UIKit class name or query expression. */
  filter?: string;
  /**
   * Default: actionIndex. actionIndex returns a small operation-oriented index
   * for agents. fullIndex preserves the older broader compact node index.
   */
  mode?: "actionIndex" | "fullIndex";
  /**
   * Maximum nodes returned in compact mode. In actionIndex mode this is capped
   * to keep tool responses small. In fullIndex mode, set to 0 to return the
   * full compact node index.
   */
  maxNodes?: number;
  /**
   * When false, include the full rawTree hierarchy in the response.
   * Default: true (agent-first compact index + summary, without rawTree).
   */
  compact?: boolean;
}

type UISnapshotMode = "actionIndex" | "fullIndex";

const DEFAULT_ACTION_INDEX_NODE_LIMIT = 24;
const FILTERED_ACTION_INDEX_NODE_LIMIT = 32;
const MAX_ACTION_INDEX_NODE_LIMIT = 48;
const DEFAULT_FULL_INDEX_NODE_LIMIT = 80;
const FILTERED_FULL_INDEX_NODE_LIMIT = 160;
const MAX_NAVIGATION_CANDIDATES = 8;
const MAX_VISIBLE_TEXT_ITEMS = 16;
const MAX_TEXT_LENGTH = 96;
const MAX_SEARCHABLE_TEXT_PER_NODE = 2;

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
  controllerClass?: string | null;
  controllerOid?: number | null;
  text?: string;
  searchableText: string[];
  accessibilityIdentifier?: string | null;
  visible: boolean;
  interactive: boolean;
  actions: string[];
  role: string;
  actionTargetOid: number;
  groupId?: string;
}

interface UISnapshotGroupItem {
  oid: number;
  label: string;
  frame: RawRect;
  selected: boolean;
  selectedReason?: string;
}

interface UISnapshotGroup {
  id: string;
  role: "bottomNavigation" | "topSwitcher";
  containerClassName?: string;
  frame: RawRect;
  itemOids: number[];
  itemLabels: string[];
  items: UISnapshotGroupItem[];
  selectedOid?: number | null;
  selectedReason?: string;
}

interface UISnapshotSummary {
  visibleText: string[];
  interactiveNodeCount: number;
  controllerHints: string[];
  navigationCandidates?: UISnapshotNavigationCandidate[];
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

interface UISnapshotNavigationCandidate {
  oid: number;
  actionTargetOid: number;
  label?: string;
  accessibilityIdentifier?: string | null;
  className: string;
  role: string;
  areaHint: string;
  frame: RawRect;
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
    mode?: UISnapshotMode;
    screenScale: number;
    screenSize: RawRect;
    hierarchyNodeCount?: number;
    totalNodeCount?: number;
    indexNodeCount?: number;
    returnedNodeCount?: number;
    nodeLimit?: number;
    truncated?: boolean;
    detailHint?: string;
  };
  summary: UISnapshotSummary;
  groups: UISnapshotGroup[];
  nodes: UISnapshotNode[];
  matchedRecipes: ProjectRecipeMatch[];
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
  const compact = input.compact !== false;
  const mode: UISnapshotMode = compact ? (input.mode ?? "actionIndex") : "fullIndex";
  const maxNodes = resolveNodeLimit({ mode, filter: input.filter, maxNodes: input.maxNodes, compact });
  return buildAgentSnapshot(hierarchy, session, compact, maxNodes, mode);
}

function resolveNodeLimit(input: {
  mode: UISnapshotMode;
  filter?: string;
  maxNodes?: number;
  compact: boolean;
}): number {
  if (!input.compact) return 0;

  if (input.mode === "actionIndex") {
    const defaultLimit = input.filter ? FILTERED_ACTION_INDEX_NODE_LIMIT : DEFAULT_ACTION_INDEX_NODE_LIMIT;
    const requested = input.maxNodes && input.maxNodes > 0 ? input.maxNodes : defaultLimit;
    return Math.min(requested, MAX_ACTION_INDEX_NODE_LIMIT);
  }

  return input.maxNodes ?? (input.filter ? FILTERED_FULL_INDEX_NODE_LIMIT : DEFAULT_FULL_INDEX_NODE_LIMIT);
}

function buildAgentSnapshot(
  hierarchy: RawHierarchy,
  session: string,
  compact: boolean,
  maxNodes: number,
  mode: UISnapshotMode
): UISnapshotOutput {
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

  const allNodes = rawNodes
    .map((node) => buildSnapshotNode(node, nodesByOid, actionTargetByOid, groupByActionOid))
    .map((node) => promoteNavigationTapTarget(node, hierarchy.screenSize))
    .filter((node) => shouldIncludeNode(node, groupByActionOid))
    .sort(sortNodes);

  const indexNodes = mode === "actionIndex"
    ? allNodes.filter((node) => shouldIncludeActionIndexNode(node, hierarchy.screenSize))
    : allNodes;
  const budgetedNodes = applyNodeBudget(indexNodes, groups, hierarchy.screenSize, maxNodes);
  const nodes = budgetedNodes.map((node) => prepareOutputNode(node));
  const summary = buildSummary(hierarchy, allNodes, groups);
  const outputGroups = groups.map((group) => prepareOutputGroup(group));
  const partial: UISnapshotOutput = {
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
      mode,
      screenScale: hierarchy.screenScale,
      screenSize: hierarchy.screenSize,
      hierarchyNodeCount: rawNodes.length,
      totalNodeCount: allNodes.length,
      indexNodeCount: indexNodes.length,
      returnedNodeCount: nodes.length,
      nodeLimit: maxNodes > 0 ? maxNodes : undefined,
      truncated: nodes.length < indexNodes.length,
      detailHint: "Default snapshot is an action index. Use ui_screenshot for visual layout and ui_attr_get for long text or full node details.",
    },
    summary,
    groups: outputGroups,
    nodes,
    matchedRecipes: [],
    rawTree: compact ? undefined : hierarchy,
  };
  partial.matchedRecipes = matchProjectRecipes(
    {
      ...partial,
      summary: buildSummary(hierarchy, allNodes, groups, { truncateText: false }),
      groups,
      nodes: allNodes,
      rawTree: undefined,
    },
    loadProjectRecipes()
  );

  return partial;
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
  const actionTarget = nodesByOid.get(actionTargetOid) ?? node;
  const group = groupByActionOid.get(actionTargetOid);
  const actions = inferActions(node, actionTarget, interactive, searchableText);
  const role = inferRole(node, searchableText, actions, group);

  return {
    id: `node_${node.oid}`,
    oid: node.oid,
    primaryOid: node.primaryOid ?? node.oid,
    className: node.className,
    oidType: node.oidType,
    frame: node.frame,
    controllerClass: node.hostViewControllerClassName,
    controllerOid: node.hostViewControllerOid,
    text,
    searchableText,
    accessibilityIdentifier: node.accessibilityIdentifier,
    visible,
    interactive,
    actions,
    role,
    actionTargetOid,
    groupId: group?.id,
  };
}

function inferActions(
  node: RawNode,
  actionTarget: RawNode,
  interactive: boolean,
  searchableText: string[]
): string[] {
  const actions = new Set<string>();
  const className = node.className;

  if (interactive && isLikelySemanticTapTarget(node, actionTarget, searchableText)) actions.add("tap");
  if (/ScrollView|TableView|CollectionView/i.test(className)) actions.add("scroll");
  if (/TextField|TextView/i.test(className)) actions.add("input");
  if (node.hostViewControllerOid || /Controller/i.test(className)) actions.add("dismiss");

  return [...actions];
}

function isLikelySemanticTapTarget(
  node: RawNode,
  actionTarget: RawNode,
  searchableText: string[]
): boolean {
  const className = node.className;
  const targetClassName = actionTarget.className;
  const hasActionableAncestor = (actionTarget.primaryOid ?? actionTarget.oid) !== (node.primaryOid ?? node.oid);

  if (/Button|Control|Switch|Cell|Tab|Segment|ActionView/i.test(targetClassName)) return true;
  if (/Button|Control|Switch|Cell|Tab|Segment|ActionView/i.test(className)) return true;
  if (/Label/i.test(className) && searchableText.length > 0) return true;
  if (/ImageView/i.test(className) && hasActionableAncestor) return true;
  if (node.accessibilityIdentifier && !isGenericContainerClass(className)) return true;
  if (/Card|Tile|Row/i.test(className) && searchableText.length > 0) return true;
  return false;
}

function promoteNavigationTapTarget(node: UISnapshotNode, screenSize: RawRect): UISnapshotNode {
  if (node.actions.includes("tap")) return node;
  if (!node.visible || !node.interactive) return node;
  if (!isEdgeNavigationArea(node.frame, screenSize)) return node;
  if (!isReasonableNavigationTapFrame(node.frame, screenSize)) return node;
  if (/Window|Controller|ScrollView|TableView|CollectionView|TabBar|NavigationBar|Toolbar/i.test(node.className)) return node;
  if (/Label/i.test(node.className) && node.searchableText.length === 0) return node;

  return {
    ...node,
    actions: dedupeStrings([...node.actions, "tap"]),
    role: node.role === "node" ? "edgeTapTarget" : node.role,
  };
}

function isEdgeNavigationArea(frame: RawRect, screenSize: RawRect): boolean {
  if (!intersectsScreen(frame, screenSize)) return false;
  const centerY = frame.y + frame.height / 2;
  return centerY <= screenSize.height * 0.18 || centerY >= screenSize.height * 0.82;
}

function intersectsScreen(frame: RawRect, screenSize: RawRect): boolean {
  const left = Math.max(frame.x, screenSize.x);
  const right = Math.min(frame.x + frame.width, screenSize.x + screenSize.width);
  const top = Math.max(frame.y, screenSize.y);
  const bottom = Math.min(frame.y + frame.height, screenSize.y + screenSize.height);
  return right > left && bottom > top;
}

function isReasonableNavigationTapFrame(frame: RawRect, screenSize: RawRect): boolean {
  if (frame.width < 12 || frame.height < 12) return false;
  if (frame.width > screenSize.width * 0.55) return false;
  if (frame.height > screenSize.height * 0.18) return false;
  return true;
}

function isGenericContainerClass(className: string): boolean {
  return /LayoutContainer|Wrapper|Platter|Transition|ContainerView|ContentView|BackgroundView|VisualEffect/i.test(className);
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

function shouldIncludeNode(node: UISnapshotNode, groupByActionOid: Map<number, UISnapshotGroup>): boolean {
  if (node.groupId) return true;
  if (node.searchableText.length > 0) return true;
  if (node.accessibilityIdentifier) return true;
  if (node.actions.includes("tap")) return true;
  if (node.controllerClass) return true;
  if (/Button|Label|Image|ScrollView|TableView|CollectionView|TextField|TextView|Cell|Tab/i.test(node.className)) return true;
  return groupByActionOid.has(node.actionTargetOid);
}

function shouldIncludeActionIndexNode(node: UISnapshotNode, screenSize: RawRect): boolean {
  if (!node.visible && !node.actions.includes("dismiss")) return false;
  if (node.groupId) return true;
  if (isHighValueActionNode(node)) return true;
  if (node.actions.includes("input")) return true;
  if (node.actions.includes("tap")) return true;
  if (node.actions.includes("scroll") && intersectsScreen(node.frame, screenSize)) return true;
  if (node.role === "edgeTapTarget") return true;
  if (node.accessibilityIdentifier && intersectsScreen(node.frame, screenSize)) return true;
  return false;
}

function prepareOutputNode(node: UISnapshotNode): UISnapshotNode {
  const searchableText = compactTextList(node.searchableText, MAX_SEARCHABLE_TEXT_PER_NODE);
  return {
    ...node,
    className: compactClassName(node.className),
    frame: compactFrame(node.frame),
    text: truncateText(node.text),
    searchableText,
    controllerClass: undefined,
    controllerOid: undefined,
    oidType: undefined,
  };
}

function prepareOutputGroup(group: UISnapshotGroup): UISnapshotGroup {
  return {
    ...group,
    containerClassName: group.containerClassName ? compactClassName(group.containerClassName) : undefined,
    frame: compactFrame(group.frame),
    itemLabels: compactTextList(group.itemLabels, group.itemLabels.length),
    items: group.items.map((item) => ({
      ...item,
      frame: compactFrame(item.frame),
      label: truncateText(item.label) ?? "",
    })),
  };
}

function compactFrame(frame: RawRect): RawRect {
  return {
    x: roundFrameValue(frame.x),
    y: roundFrameValue(frame.y),
    width: roundFrameValue(frame.width),
    height: roundFrameValue(frame.height),
  };
}

function roundFrameValue(value: number): number {
  return Math.round(value * 10) / 10;
}

function compactClassName(className: string): string {
  if (className.length <= 48) return className;
  if (/UITabButton.*Label/i.test(className)) return "UITabButtonLabel";
  const segments = className.split(".");
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && lastSegment.length <= 48) return lastSegment;
  return `${className.slice(0, 47)}…`;
}

function truncateText(value: string | undefined | null, maxLength = MAX_TEXT_LENGTH): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function compactTextList(values: string[], maxItems: number): string[] {
  return dedupeStrings(values.map((value) => truncateText(value))).slice(0, maxItems);
}

function isUsefulVisibleText(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (text.startsWith("_")) return false;
  if (/^com\.apple\./i.test(text)) return false;
  if (/AccessibilityLabel$/i.test(text)) return false;
  if (/^UI[A-Z].*View$/i.test(text)) return false;
  return true;
}

function sortNodes(a: UISnapshotNode, b: UISnapshotNode): number {
  if (a.frame.y !== b.frame.y) return a.frame.y - b.frame.y;
  if (a.frame.x !== b.frame.x) return a.frame.x - b.frame.x;
  return a.oid - b.oid;
}

function applyNodeBudget(
  nodes: UISnapshotNode[],
  groups: UISnapshotGroup[],
  screenSize: RawRect,
  maxNodes: number
): UISnapshotNode[] {
  if (maxNodes <= 0 || nodes.length <= maxNodes) return nodes;

  const keep = new Set<number>();
  for (const group of groups) {
    for (const oid of group.itemOids) keep.add(oid);
  }

  const scored = nodes
    .map((node) => ({
      node,
      score: scoreNodeForBudget(node, screenSize),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return sortNodes(a.node, b.node);
    });

  for (const item of scored) {
    if (keep.size >= maxNodes) break;
    keep.add(item.node.oid);
  }

  return nodes.filter((node) => keep.has(node.oid)).sort(sortNodes);
}

function scoreNodeForBudget(node: UISnapshotNode, screenSize: RawRect): number {
  let score = 0;
  const area = node.frame.width * node.frame.height;

  if (node.groupId) score += 140;
  if (isHighValueActionNode(node)) score += 180;
  if (node.actions.includes("tap")) score += 110;
  if (node.actions.includes("input")) score += 110;
  if (node.actions.includes("scroll")) score += 45;
  if (node.actions.includes("dismiss")) score += 25;
  if (node.accessibilityIdentifier) score += 180;
  if (node.searchableText.length > 0) score += 60;
  if (node.text && node.text.length <= 24) score += 12;
  if (node.controllerClass) score += 20;
  if (isEdgeNavigationArea(node.frame, screenSize)) score += 35;
  if (node.role === "button" || node.role === "switcherItem" || node.role === "tapTarget") score += 25;
  if (node.role === "edgeTapTarget") score += 65;
  if (/Button|Control|Cell|Tab|Segment/i.test(node.className)) score += 25;
  if (/ImageView/i.test(node.className) && node.searchableText.length === 0) score -= 12;
  if (isGenericContainerClass(node.className) && node.searchableText.length === 0) score -= 25;
  if (area > screenSize.width * screenSize.height * 0.35 && node.searchableText.length === 0) score -= 35;
  if (!intersectsScreen(node.frame, screenSize)) score -= 60;

  return score;
}

function resolveActionTargetOid(node: RawNode, nodesByOid: Map<number, RawNode>): number {
  let best = node;
  let probe = node;
  let steps = 0;

  while (steps < 6 && probe.parentOid) {
    const parent = nodesByOid.get(probe.parentOid);
    if (!parent) break;
    if ((parent.isHidden ?? false) || (parent.alpha ?? 1) <= 0) break;

    if (shouldPreferAncestorAsActionTarget(best, parent)) {
      best = parent;
    }
    probe = parent;
    steps += 1;
  }

  return best.primaryOid ?? best.oid;
}

function shouldPreferAncestorAsActionTarget(best: RawNode, ancestor: RawNode): boolean {
  const bestClass = best.className;
  const ancestorClass = ancestor.className;
  const bestArea = Math.max(1, best.frame.width * best.frame.height);
  const ancestorArea = Math.max(1, ancestor.frame.width * ancestor.frame.height);
  const bestIsLeafLike = /Label|ImageView|ButtonLabel/i.test(bestClass);
  const bestLooksSelectedWrapper = /Selected/i.test(bestClass);
  const ancestorLooksActionable =
    Boolean(ancestor.isUserInteractionEnabled) ||
    /Button|Cell|Tab|Segment|Control/i.test(ancestorClass);

  if (!ancestorLooksActionable) {
    return false;
  }
  const bestAlreadyActionable = Boolean(best.isUserInteractionEnabled) && /Button|Cell|Tab|Segment|Control/i.test(bestClass);
  if (bestAlreadyActionable && ancestorArea > bestArea * 1.5 && !bestLooksSelectedWrapper) {
    return false;
  }
  if (bestIsLeafLike && ancestorArea >= bestArea * 1.2) {
    return true;
  }
  if (/UIButton|Cell|Tab|Segment|Control/i.test(ancestorClass)) {
    return true;
  }
  if (bestLooksSelectedWrapper && ancestorArea >= bestArea) {
    return true;
  }
  if (bestIsLeafLike && /Tab|Segment|Control/i.test(ancestorClass) && ancestorArea >= bestArea) {
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
      if (!hasText || !visible) return false;
      const actionOid = actionTargetByOid.get(node.oid) ?? node.primaryOid ?? node.oid;
      const actionTarget = nodesByOid.get(actionOid) ?? node;
      const actionTargetVisible =
        (actionTarget.isHidden ?? false) === false &&
        (actionTarget.alpha ?? 1) > 0 &&
        actionTarget.frame.width > 0 &&
        actionTarget.frame.height > 0 &&
        intersectsScreen(actionTarget.frame, screenSize);
      const actionTargetActionable =
        Boolean(actionTarget.isUserInteractionEnabled) ||
        /Button|Cell|Tab|Segment|Control/i.test(actionTarget.className);
      return actionTargetVisible && actionTargetActionable && isLikelyGroupItemTarget(actionTarget, screenSize);
    })
    .map((node) => {
      const actionOid = actionTargetByOid.get(node.oid) ?? node.primaryOid ?? node.oid;
      return {
        source: node,
        target: nodesByOid.get(actionOid) ?? node,
        texts: dedupeStrings([
          ...Object.values(extractTextSources(node)),
          ...Object.values(extractTextSources(nodesByOid.get(actionOid) ?? node)),
        ]),
        selectedReason: inferSelectedReason(node, nodesByOid.get(actionOid) ?? node, nodesByOid),
      };
    });

  const uniqueTargets = new Map<number, { target: RawNode; texts: string[]; selectedReason?: string }>();
  for (const candidate of candidates) {
    const oid = candidate.target.oid;
    const existing = uniqueTargets.get(oid);
    if (!existing) {
      uniqueTargets.set(oid, { target: candidate.target, texts: candidate.texts, selectedReason: candidate.selectedReason });
    } else {
      existing.texts = dedupeStrings([...existing.texts, ...candidate.texts]);
      existing.selectedReason = existing.selectedReason ?? candidate.selectedReason;
    }
  }

  const bottomTargets = dedupeGroupItems([...uniqueTargets.values()])
    .filter(({ target, texts }) => texts.length > 0 && intersectsScreen(target.frame, screenSize) && target.frame.y >= screenSize.height * 0.7)
    .sort((a, b) => a.target.frame.x - b.target.frame.x);

  const groups: UISnapshotGroup[] = [];
  if (bottomTargets.length >= 2) {
    const group = makeGroup("group_bottom_1", "bottomNavigation", bottomTargets);
    if (group && isReasonableSwitcherGroup(group, screenSize)) groups.push(group);
  }

  const topTargets = dedupeGroupItems([...uniqueTargets.values()])
    .filter(({ target, texts }) => texts.length > 0 && intersectsScreen(target.frame, screenSize) && target.frame.y <= screenSize.height * 0.25)
    .sort((a, b) => a.target.frame.x - b.target.frame.x);

  if (topTargets.length >= 2) {
    const group = makeGroup("group_top_1", "topSwitcher", topTargets);
    if (group && isReasonableSwitcherGroup(group, screenSize)) groups.push(group);
  }

  return groups;
}

function isReasonableSwitcherGroup(group: UISnapshotGroup, screenSize: RawRect): boolean {
  if (group.role === "topSwitcher" && group.frame.height > screenSize.height * 0.12) return false;
  if (group.role === "bottomNavigation" && group.frame.height > screenSize.height * 0.18) return false;
  return true;
}

function makeGroup(
  id: string,
  role: "bottomNavigation" | "topSwitcher",
  items: Array<{ target: RawNode; texts: string[]; selectedReason?: string }>
): UISnapshotGroup | undefined {
  const groupItems = items
    .map((item) => ({
      oid: item.target.primaryOid ?? item.target.oid,
      label: item.texts[0],
      frame: item.target.frame,
      selected: Boolean(item.selectedReason),
      selectedReason: item.selectedReason,
    }))
    .filter((item) => Boolean(item.label)) as UISnapshotGroupItem[];
  if (groupItems.length < 2) return undefined;

  const labels = groupItems.map((item) => item.label);
  const itemOids = groupItems.map((item) => item.oid);
  const xs = items.map((item) => item.target.frame.x);
  const ys = items.map((item) => item.target.frame.y);
  const rights = items.map((item) => item.target.frame.x + item.target.frame.width);
  const bottoms = items.map((item) => item.target.frame.y + item.target.frame.height);
  const selectedItems = groupItems.filter((item) => item.selected);
  const selectedOid = selectedItems.length === 1 ? selectedItems[0].oid : null;
  const selectedReason = selectedItems.length === 1 ? selectedItems[0].selectedReason : undefined;

  return {
    id,
    role,
    containerClassName: undefined,
    frame: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...rights) - Math.min(...xs),
      height: Math.max(...bottoms) - Math.min(...ys),
    },
    itemOids,
    itemLabels: labels,
    items: groupItems,
    selectedOid,
    selectedReason,
  };
}

function dedupeGroupItems(
  items: Array<{ target: RawNode; texts: string[]; selectedReason?: string }>
): Array<{ target: RawNode; texts: string[]; selectedReason?: string }> {
  const deduped: Array<{ target: RawNode; texts: string[]; selectedReason?: string }> = [];

  for (const item of items.sort((a, b) => a.target.frame.x - b.target.frame.x)) {
    const labelKey = item.texts[0]?.trim().toLocaleLowerCase();
    const centerX = item.target.frame.x + item.target.frame.width / 2;
    const existing = deduped.find((candidate) => {
      const candidateLabel = candidate.texts[0]?.trim().toLocaleLowerCase();
      const candidateCenterX = candidate.target.frame.x + candidate.target.frame.width / 2;
      const centerClose = Math.abs(candidateCenterX - centerX) <= Math.max(18, Math.min(candidate.target.frame.width, item.target.frame.width) * 0.6);
      const overlaps = horizontalOverlap(candidate.target.frame, item.target.frame) >= 0.4;
      return Boolean(candidateLabel) && Boolean(labelKey) && candidateLabel === labelKey && (centerClose || overlaps);
    });
    if (!existing) {
      deduped.push(item);
      continue
    }
    existing.texts = dedupeStrings([...existing.texts, ...item.texts]);
    existing.selectedReason = existing.selectedReason ?? item.selectedReason;
    if (shouldReplaceGroupCandidate(existing, item)) {
      existing.target = item.target;
    }
  }

  return deduped;
}

function horizontalOverlap(a: RawRect, b: RawRect): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const overlap = Math.max(0, right - left);
  const minWidth = Math.max(1, Math.min(a.width, b.width));
  return overlap / minWidth;
}

function shouldReplaceGroupCandidate(
  current: { target: RawNode; texts: string[]; selectedReason?: string },
  incoming: { target: RawNode; texts: string[]; selectedReason?: string }
): boolean {
  if (!current.selectedReason && incoming.selectedReason) return true;
  const currentArea = Math.max(1, current.target.frame.width * current.target.frame.height);
  const incomingArea = Math.max(1, incoming.target.frame.width * incoming.target.frame.height);
  if (incomingArea > currentArea * 1.05) return true;
  return false;
}

function isLikelyGroupItemTarget(target: RawNode, screenSize: RawRect): boolean {
  const className = target.className;
  if (!intersectsScreen(target.frame, screenSize)) return false;
  if (target.frame.width <= 0 || target.frame.height <= 0) return false;

  const looksLikeLeafAction = /Button|Cell|Segment|Control|ActionView/i.test(className);
  const looksLikeContainer = /Window|NavigationBar|Toolbar|TabBar$|ScrollView|TableView|CollectionView|Controller|LayoutContainer|Transition|ContainerView|ContentView/i.test(className);
  if (looksLikeContainer && !looksLikeLeafAction) return false;

  if (target.frame.width > screenSize.width * 0.72 && !/Cell/i.test(className)) return false;
  if (target.frame.height > screenSize.height * 0.2 && !/Cell/i.test(className)) return false;
  return true;
}

function inferSelectedReason(
  source: RawNode,
  target: RawNode,
  nodesByOid: Map<number, RawNode>
): string | undefined {
  const selectedPattern = /Selected/i;
  if (selectedPattern.test(source.className)) return `source class ${source.className}`;
  if (selectedPattern.test(target.className)) return `target class ${target.className}`;
  let probe = source;
  let steps = 0;
  while (probe.parentOid && steps < 4) {
    const parent = nodesByOid.get(probe.parentOid);
    if (!parent) break;
    if (selectedPattern.test(parent.className)) return `ancestor class ${parent.className}`;
    if ((parent.primaryOid ?? parent.oid) === (target.primaryOid ?? target.oid)) break;
    probe = parent;
    steps += 1;
  }
  return undefined;
}

function buildSummary(
  hierarchy: RawHierarchy,
  nodes: UISnapshotNode[],
  groups: UISnapshotGroup[],
  options: { truncateText?: boolean } = { truncateText: true }
): UISnapshotSummary {
  const visibleTextSource = dedupeStrings(nodes.flatMap((node) => node.searchableText)).filter(isUsefulVisibleText);
  const visibleText = options.truncateText === false
    ? visibleTextSource.slice(0, 40)
    : compactTextList(visibleTextSource, MAX_VISIBLE_TEXT_ITEMS);
  const controllerHints = dedupeStrings(nodes.map((node) => node.controllerClass ? compactClassName(node.controllerClass) : undefined)).slice(0, 8);
  const navigationCandidates = buildNavigationCandidates(nodes, hierarchy.screenSize);
  const bottomBarCandidates = groups
    .filter((group) => group.role === "bottomNavigation")
    .map((group) => ({
      groupId: group.id,
      className: group.containerClassName,
      labelHints: compactTextList(group.itemLabels, group.itemLabels.length),
      selectedLabel: truncateText(group.items.find((item) => item.selected)?.label),
      selectedNodeId: group.selectedOid ? `node_${group.selectedOid}` : undefined,
      frame: compactFrame(group.frame),
    }));

  return {
    visibleText,
    interactiveNodeCount: nodes.filter((node) => node.interactive).length,
    controllerHints,
    navigationCandidates,
    bottomBarCandidates,
    groupCount: groups.length,
  };
}

function buildNavigationCandidates(nodes: UISnapshotNode[], screenSize: RawRect): UISnapshotNavigationCandidate[] {
  const bestByTarget = new Map<number, UISnapshotNode>();
  for (const node of nodes) {
    if (!node.actions.includes("tap")) continue;
    if (!isEdgeNavigationArea(node.frame, screenSize) && !node.groupId && !isHighValueActionNode(node)) continue;
    if (shouldSkipNavigationCandidate(node, screenSize)) continue;

    const existing = bestByTarget.get(node.actionTargetOid);
    if (!existing || scoreNodeForBudget(node, screenSize) > scoreNodeForBudget(existing, screenSize)) {
      bestByTarget.set(node.actionTargetOid, node);
    }
  }

  return [...bestByTarget.values()]
    .sort((a, b) => {
      const scoreDelta = scoreNavigationCandidate(b, screenSize) - scoreNavigationCandidate(a, screenSize);
      if (scoreDelta !== 0) return scoreDelta;
      return sortNodes(a, b);
    })
    .slice(0, MAX_NAVIGATION_CANDIDATES)
    .sort(sortNodes)
    .map((node) => ({
      oid: node.oid,
      actionTargetOid: node.actionTargetOid,
      label: truncateText(node.text),
      accessibilityIdentifier: node.accessibilityIdentifier,
      className: compactClassName(node.className),
      role: node.role,
      areaHint: areaHintForFrame(node.frame, screenSize),
      frame: compactFrame(node.frame),
    }));
}

function scoreNavigationCandidate(node: UISnapshotNode, screenSize: RawRect): number {
  let score = scoreNodeForBudget(node, screenSize);
  const areaHint = areaHintForFrame(node.frame, screenSize);
  if (areaHint === "topRight" || areaHint === "topLeft") score += 25;
  if (isHighValueActionNode(node)) score += 120;
  if (node.text || node.accessibilityIdentifier) score += 20;
  if (node.groupId) score += 30;
  return score;
}

function shouldSkipNavigationCandidate(node: UISnapshotNode, screenSize: RawRect): boolean {
  if (isHighValueActionNode(node)) return false;
  if (!node.groupId && node.frame.width > screenSize.width * 0.72 && node.frame.height > 80) return true;
  if (/NavigationBar|Toolbar/i.test(node.className) && node.frame.width > screenSize.width * 0.7) return true;
  if (/TabBar$/i.test(node.className) && node.frame.width > screenSize.width * 0.7) return true;
  if (/Window|Controller|LayoutContainer|Transition/i.test(node.className)) return true;
  if (/ContainerView/i.test(node.className) && (node.frame.width > screenSize.width * 0.7 || node.frame.height > screenSize.height * 0.2)) {
    return true;
  }
  return false;
}

function isHighValueActionNode(node: UISnapshotNode): boolean {
  if (!node.actions.includes("tap")) return false;
  return node.searchableText.some((text) =>
    /^(create post|publish|send|submit|save|done|next|continue|review|post now|发布|发表|发帖|发送|提交|保存|完成|下一步|继续)$/.test(
      text.trim().toLocaleLowerCase()
    )
  );
}

function areaHintForFrame(frame: RawRect, screenSize: RawRect): string {
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const vertical = centerY <= screenSize.height * 0.25
    ? "top"
    : centerY >= screenSize.height * 0.75
      ? "bottom"
      : "middle";
  const horizontal = centerX <= screenSize.width / 3
    ? "Left"
    : centerX >= (screenSize.width * 2) / 3
      ? "Right"
      : "Center";
  return `${vertical}${horizontal}`;
}
