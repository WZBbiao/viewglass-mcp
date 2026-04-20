import fs from "node:fs";
import path from "node:path";
import type { UIScanResult } from "./tools/ui_scan.js";
import type { UISnapshotOutput } from "./tools/ui_snapshot.js";
import { saveProjectBundleId } from "./project_config.js";

const FLOW_GAP_MS = 10 * 60 * 1000;
const MAX_VISIBLE_TEXT = 6;
const MAX_SEARCHABLE_TEXT = 4;

interface FlowStepDraft {
  tool: string;
  role?: string;
  searchableTextAny?: string[];
  classHints?: string[];
  controllerHints?: string[];
  groupRole?: string;
  areaHint?: string;
  input?: string;
}

interface FlowDraftState {
  session: string;
  bundleId: string;
  startedAt: string;
  updatedAt: string;
  startSnapshot?: UISnapshotOutput;
  latestSnapshot?: UISnapshotOutput;
  steps: FlowStepDraft[];
  lastPersistedFingerprint?: string;
}

const latestSnapshotBySession = new Map<string, UISnapshotOutput>();
const flowBySession = new Map<string, FlowDraftState>();

function dedupe(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "flow";
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

function formatArray(items?: string[], indent = "      "): string[] {
  if (!items || items.length === 0) return [];
  return items.map((item) => `${indent}- ${quoteYaml(item)}`);
}

function inferAreaHint(
  frame: { x: number; y: number; width: number; height: number } | undefined,
  screen: { width: number; height: number } | undefined
): string | undefined {
  if (!frame || !screen?.width || !screen?.height) return undefined;
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const x = centerX / screen.width;
  const y = centerY / screen.height;

  const horizontal = x < 0.33 ? "Left" : x > 0.67 ? "Right" : "Center";
  const vertical = y < 0.25 ? "top" : y > 0.75 ? "bottom" : "middle";
  if (vertical === "middle") return horizontal === "Center" ? "center" : `middle${horizontal}`;
  return `${vertical}${horizontal}`;
}

function sessionFromArgsOrParsed(args: unknown, parsed: unknown): string | undefined {
  if (args && typeof args === "object") {
    const maybe = (args as { session?: unknown }).session;
    if (typeof maybe === "string" && maybe.trim()) return maybe;
  }
  if (parsed && typeof parsed === "object") {
    const appSession = (parsed as { app?: { session?: unknown } }).app?.session;
    if (typeof appSession === "string" && appSession.trim()) return appSession;
    const rawSession = (parsed as { session?: unknown }).session;
    if (typeof rawSession === "string" && rawSession.trim()) return rawSession;
  }
  const knownSessions = dedupe([
    ...latestSnapshotBySession.keys(),
    ...flowBySession.keys(),
  ]);
  if (knownSessions.length === 1) return knownSessions[0];
  return undefined;
}

function ensureFlow(session: string, bundleId: string, snapshot?: UISnapshotOutput): FlowDraftState {
  const nowIso = new Date().toISOString();
  const current = flowBySession.get(session);
  if (!current) {
    const created: FlowDraftState = {
      session,
      bundleId,
      startedAt: nowIso,
      updatedAt: nowIso,
      startSnapshot: snapshot,
      latestSnapshot: snapshot,
      steps: [],
    };
    flowBySession.set(session, created);
    return created;
  }

  if (Date.now() - Date.parse(current.updatedAt) > FLOW_GAP_MS) {
    current.steps = [];
    current.startedAt = nowIso;
    current.startSnapshot = snapshot ?? current.latestSnapshot;
  }
  current.bundleId = bundleId;
  current.updatedAt = nowIso;
  if (snapshot) current.latestSnapshot = snapshot;
  return current;
}

function appendRecipeDraft(recipe: {
  id: string;
  description: string;
  bundleId: string;
  session: string;
  capturedAt: string;
  triggerTool: string;
  screenControllerHints: string[];
  screenVisibleText: string[];
  steps: FlowStepDraft[];
  successControllerHints: string[];
  successVisibleText: string[];
}): void {
  const configPath = saveProjectBundleId(recipe.bundleId);
  if (!configPath) return;
  const recipesPath = path.join(path.dirname(configPath), "recipes.yaml");
  if (!fs.existsSync(recipesPath)) {
    fs.writeFileSync(recipesPath, "version: 1\n\nrecipes: []\n", "utf8");
  }

  const blockLines: string[] = [
    `  - id: ${quoteYaml(recipe.id)}`,
    `    description: ${quoteYaml(recipe.description)}`,
    "    source:",
    `      generator: ${quoteYaml("viewglass-mcp")}`,
    `      capturedAt: ${quoteYaml(recipe.capturedAt)}`,
    `      session: ${quoteYaml(recipe.session)}`,
    `      triggerTool: ${quoteYaml(recipe.triggerTool)}`,
    "    screen:",
  ];

  if (recipe.screenControllerHints.length > 0) {
    blockLines.push("      controllerHints:");
    blockLines.push(...formatArray(recipe.screenControllerHints, "        "));
  }
  if (recipe.screenVisibleText.length > 0) {
    blockLines.push("      visibleTextAny:");
    blockLines.push(...formatArray(recipe.screenVisibleText, "        "));
  }
  if (recipe.screenControllerHints.length === 0 && recipe.screenVisibleText.length === 0) {
    blockLines.push("      controllerHints: []");
  }

  blockLines.push("    steps:");
  for (const step of recipe.steps) {
    blockLines.push(`      - tool: ${quoteYaml(step.tool)}`);
    if (step.role) blockLines.push(`        role: ${quoteYaml(step.role)}`);
    if (step.groupRole) blockLines.push(`        groupRole: ${quoteYaml(step.groupRole)}`);
    if (step.areaHint) blockLines.push(`        areaHint: ${quoteYaml(step.areaHint)}`);
    if (step.classHints?.length) {
      blockLines.push("        classHints:");
      blockLines.push(...formatArray(step.classHints, "          "));
    }
    if (step.controllerHints?.length) {
      blockLines.push("        controllerHints:");
      blockLines.push(...formatArray(step.controllerHints, "          "));
    }
    if (step.searchableTextAny?.length) {
      blockLines.push("        searchableTextAny:");
      blockLines.push(...formatArray(step.searchableTextAny, "          "));
    }
    if (step.input) blockLines.push(`        input: ${quoteYaml(step.input)}`);
  }

  blockLines.push("    success:");
  if (recipe.successControllerHints.length > 0) {
    blockLines.push("      controllerHints:");
    blockLines.push(...formatArray(recipe.successControllerHints, "        "));
  }
  if (recipe.successVisibleText.length > 0) {
    blockLines.push("      visibleTextAny:");
    blockLines.push(...formatArray(recipe.successVisibleText, "        "));
  }
  if (recipe.successControllerHints.length === 0 && recipe.successVisibleText.length === 0) {
    blockLines.push("      visibleTextAny: []");
  }
  blockLines.push("    stats:");
  blockLines.push("      successCount: 1");
  blockLines.push("      failureCount: 0");
  blockLines.push(`      lastSuccessAt: ${quoteYaml(recipe.capturedAt)}`);

  const block = `${blockLines.join("\n")}\n`;
  const current = fs.readFileSync(recipesPath, "utf8");
  if (/^recipes:\s*\[\s*\]\s*$/m.test(current)) {
    fs.writeFileSync(recipesPath, current.replace(/^recipes:\s*\[\s*\]\s*$/m, `recipes:\n${block}`), "utf8");
    return;
  }
  fs.writeFileSync(recipesPath, `${current.trimEnd()}\n${block}`, "utf8");
}

function buildStepFromSnapshot(
  tool: string,
  oid: string,
  snapshot: UISnapshotOutput,
  args: unknown
): FlowStepDraft | undefined {
  const node = snapshot.nodes.find(
    (item) => String(item.oid) === oid || String(item.primaryOid) === oid || String(item.actionTargetOid) === oid
  );
  const group = snapshot.groups.find((g) => g.items.some((item) => String(item.oid) === oid) || g.itemOids.some((value) => String(value) === oid));
  const groupItem = group?.items.find((item) => String(item.oid) === oid);
  const searchableTextAny = dedupe([
    groupItem?.label,
    node?.text,
    ...(node?.searchableText ?? []),
  ]).slice(0, MAX_SEARCHABLE_TEXT);

  const step: FlowStepDraft = {
    tool,
    role: group ? "groupItem" : node?.role,
    searchableTextAny,
    classHints: node?.className ? [node.className] : undefined,
    controllerHints: node?.controllerClass ? [node.controllerClass] : undefined,
    groupRole: group?.role,
    areaHint: inferAreaHint(groupItem?.frame ?? node?.frame, snapshot.snapshot.screenSize),
  };

  if (tool === "ui_input") {
    const text = args && typeof args === "object" ? (args as { text?: unknown }).text : undefined;
    step.input = typeof text === "string" && text.trim() !== "" ? "<runtime-input>" : undefined;
  }

  return step;
}

function fingerprintFlow(flow: FlowDraftState, triggerTool: string): string {
  const core = flow.steps.map((step) => `${step.tool}:${step.role ?? ""}:${(step.searchableTextAny ?? []).join("|")}:${step.groupRole ?? ""}`).join("||");
  return `${flow.bundleId}::${triggerTool}::${core}`;
}

function maybePersistFlowDraft(session: string, triggerTool: string): void {
  const flow = flowBySession.get(session);
  if (!flow || flow.steps.length < 2) return;
  if (Date.now() - Date.parse(flow.updatedAt) > FLOW_GAP_MS) return;

  const fingerprint = fingerprintFlow(flow, triggerTool);
  if (flow.lastPersistedFingerprint === fingerprint) return;

  const latest = flow.latestSnapshot;
  const start = flow.startSnapshot ?? latest;
  const capturedAt = new Date().toISOString();
  const id = `auto_${slug(flow.bundleId.split('.').pop() ?? flow.bundleId)}_${capturedAt.replace(/[-:TZ.]/g, "").slice(0, 14)}`;

  appendRecipeDraft({
    id,
    description: "Auto-captured successful flow draft. Refine this entry if the flow becomes a stable repeated task.",
    bundleId: flow.bundleId,
    session: flow.session,
    capturedAt,
    triggerTool,
    screenControllerHints: start?.summary.controllerHints.slice(0, 4) ?? [],
    screenVisibleText: start?.summary.visibleText.slice(0, MAX_VISIBLE_TEXT) ?? [],
    steps: flow.steps,
    successControllerHints: latest?.summary.controllerHints.slice(0, 4) ?? [],
    successVisibleText: latest?.summary.visibleText.slice(0, MAX_VISIBLE_TEXT) ?? [],
  });

  flow.lastPersistedFingerprint = fingerprint;
  flow.steps = [];
  flow.startedAt = capturedAt;
  flow.startSnapshot = latest;
}

export function resetProjectMemoryState(): void {
  latestSnapshotBySession.clear();
  flowBySession.clear();
}

export function noteSuccessfulTool(name: string, args: unknown, parsed: unknown): void {
  if (!parsed || typeof parsed !== "object") return;

  if (name === "ui_connect") {
    const bundleId = (parsed as { bundleId?: unknown }).bundleId;
    if (typeof bundleId === "string") saveProjectBundleId(bundleId);
    return;
  }

  if (name === "ui_scan") {
    const sessions = (parsed as UIScanResult).sessions;
    if (Array.isArray(sessions) && sessions.length === 1 && typeof sessions[0]?.bundleId === "string") {
      saveProjectBundleId(sessions[0].bundleId);
    }
    return;
  }

  if (name === "ui_snapshot") {
    const snapshot = parsed as UISnapshotOutput;
    const session = snapshot.app?.session;
    if (typeof snapshot.app?.bundleIdentifier === "string") {
      saveProjectBundleId(snapshot.app.bundleIdentifier);
    }
    if (typeof session === "string" && session.trim()) {
      latestSnapshotBySession.set(session, snapshot);
      const flow = flowBySession.get(session);
      if (flow) flow.latestSnapshot = snapshot;
    }
    return;
  }

  const session = sessionFromArgsOrParsed(args, parsed);
  if (!session) return;

  const snapshot = latestSnapshotBySession.get(session);
  const bundleId = snapshot?.app.bundleIdentifier || session.split("@")[0];
  if (!bundleId) return;

  if (["ui_tap", "ui_input", "ui_scroll", "ui_dismiss", "ui_swipe", "ui_long_press"].includes(name)) {
    const oidRaw = args && typeof args === "object" ? (args as { oid?: unknown }).oid : undefined;
    const oid = typeof oidRaw === "string" || typeof oidRaw === "number" ? String(oidRaw) : undefined;
    if (!oid || !snapshot) return;
    const flow = ensureFlow(session, bundleId, snapshot);
    if (!flow.startSnapshot) flow.startSnapshot = snapshot;
    const step = buildStepFromSnapshot(name, oid, snapshot, args);
    if (!step) return;
    const last = flow.steps[flow.steps.length - 1];
    const sameAsLast = last && JSON.stringify(last) === JSON.stringify(step);
    if (!sameAsLast) flow.steps.push(step);
    flow.updatedAt = new Date().toISOString();
    return;
  }

  if (["ui_wait", "ui_assert", "ui_attr_get"].includes(name)) {
    maybePersistFlowDraft(session, name);
  }
}
