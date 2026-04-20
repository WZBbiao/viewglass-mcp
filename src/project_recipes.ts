import fs from "node:fs";
import path from "node:path";
import type { UISnapshotOutput } from "./tools/ui_snapshot.js";

export interface ProjectRecipeStep {
  tool: string;
  role?: string;
  searchableTextAny?: string[];
  classHints?: string[];
  controllerHints?: string[];
  groupRole?: string;
  areaHint?: string;
  input?: string;
}

export interface ProjectRecipe {
  id: string;
  description?: string;
  screen?: {
    controllerHints?: string[];
    visibleTextAny?: string[];
  };
  steps?: ProjectRecipeStep[];
  success?: {
    controllerHints?: string[];
    visibleTextAny?: string[];
  };
}

export interface ProjectRecipeStepMatch {
  index: number;
  tool: string;
  recommendedOid?: number;
  candidateOids: number[];
}

export interface ProjectRecipeMatch {
  id: string;
  description?: string;
  score: number;
  suggestedSteps: ProjectRecipeStepMatch[];
}

interface MutableRecipe extends ProjectRecipe {
  screen: {
    controllerHints?: string[];
    visibleTextAny?: string[];
  };
  steps: ProjectRecipeStep[];
  success: {
    controllerHints?: string[];
    visibleTextAny?: string[];
  };
}

function hasProjectMarkers(dir: string): boolean {
  const names = ["AGENTS.md", "Package.swift", "Podfile", ".git", ".viewglassmcp"];
  for (const name of names) {
    if (fs.existsSync(path.join(dir, name))) return true;
  }
  try {
    const entries = fs.readdirSync(dir);
    return entries.some((name) => name.endsWith(".xcodeproj") || name.endsWith(".xcworkspace"));
  } catch {
    return false;
  }
}

function findProjectRoot(startCwd: string = process.cwd()): string | undefined {
  let current = path.resolve(startCwd);
  const root = path.parse(current).root;
  while (true) {
    if (hasProjectMarkers(current)) return current;
    if (current === root) return undefined;
    current = path.dirname(current);
  }
}

function findRecipesPath(startCwd: string = process.cwd()): string | undefined {
  const projectRoot = findProjectRoot(startCwd);
  if (!projectRoot) return undefined;
  const candidate = path.join(projectRoot, ".viewglassmcp", "recipes.yaml");
  return fs.existsSync(candidate) ? candidate : undefined;
}

function parseScalar(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

export function loadProjectRecipes(startCwd: string = process.cwd()): ProjectRecipe[] {
  const recipesPath = findRecipesPath(startCwd);
  if (!recipesPath) return [];
  return parseRecipesYaml(fs.readFileSync(recipesPath, "utf8"));
}

export function parseRecipesYaml(raw: string): ProjectRecipe[] {
  const recipes: MutableRecipe[] = [];
  let currentRecipe: MutableRecipe | undefined;
  let currentStep: ProjectRecipeStep | undefined;
  let currentSection: "screen" | "success" | "steps" | "source" | "stats" | undefined;
  let currentArrayKey: string | undefined;

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed === "recipes:" || trimmed === "recipes: []" || trimmed.startsWith("version:")) continue;

    if (line.startsWith("  - id:")) {
      currentRecipe = {
        id: parseScalar(trimmed.slice("- id:".length)),
        screen: {},
        steps: [],
        success: {},
      };
      recipes.push(currentRecipe);
      currentStep = undefined;
      currentSection = undefined;
      currentArrayKey = undefined;
      continue;
    }

    if (!currentRecipe) continue;

    if (line.startsWith("    ") && !line.startsWith("      ")) {
      currentArrayKey = undefined;
      currentStep = undefined;
      if (trimmed === "screen:") {
        currentSection = "screen";
        continue;
      }
      if (trimmed === "success:") {
        currentSection = "success";
        continue;
      }
      if (trimmed === "steps:") {
        currentSection = "steps";
        continue;
      }
      if (trimmed === "source:") {
        currentSection = "source";
        continue;
      }
      if (trimmed === "stats:") {
        currentSection = "stats";
        continue;
      }
      if (trimmed.startsWith("description:")) {
        currentRecipe.description = parseScalar(trimmed.slice("description:".length));
        continue;
      }
    }

    if (currentSection === "steps" && line.startsWith("      - tool:")) {
      currentStep = { tool: parseScalar(trimmed.slice("- tool:".length)) };
      currentRecipe.steps.push(currentStep);
      currentArrayKey = undefined;
      continue;
    }

    if (currentSection === "steps" && currentStep && line.startsWith("        ") && !line.startsWith("          - ")) {
      const nested = trimmed;
      if (nested.endsWith(":")) {
        currentArrayKey = nested.slice(0, -1);
        continue;
      }
      const idx = nested.indexOf(":");
      if (idx === -1) continue;
      const key = nested.slice(0, idx).trim();
      const value = parseScalar(nested.slice(idx + 1));
      (currentStep as unknown as Record<string, unknown>)[key] = value;
      currentArrayKey = undefined;
      continue;
    }

    if (currentSection === "steps" && currentStep && currentArrayKey && line.startsWith("          - ")) {
      const value = parseScalar(trimmed.slice(1));
      const current = (((currentStep as unknown as Record<string, unknown>)[currentArrayKey]) as string[] | undefined) ?? [];
      current.push(value);
      (currentStep as unknown as Record<string, unknown>)[currentArrayKey] = current;
      continue;
    }

    if ((currentSection === "screen" || currentSection === "success") && line.startsWith("      ") && !line.startsWith("        - ")) {
      const nested = trimmed;
      if (nested.endsWith(":")) {
        currentArrayKey = nested.slice(0, -1);
        continue;
      }
    }

    if ((currentSection === "screen" || currentSection === "success") && currentArrayKey && line.startsWith("        - ")) {
      const value = parseScalar(trimmed.slice(1));
      const bucket = currentSection === "screen" ? currentRecipe.screen : currentRecipe.success;
      const current = ((bucket as Record<string, unknown>)[currentArrayKey] as string[] | undefined) ?? [];
      current.push(value);
      (bucket as Record<string, unknown>)[currentArrayKey] = current;
      continue;
    }
  }

  return recipes.map((recipe) => ({
    id: recipe.id,
    description: recipe.description,
    screen: recipe.screen,
    steps: recipe.steps,
    success: recipe.success,
  }));
}

function uniqueNormalized(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function overlapCount(a: string[] | undefined, b: string[] | undefined): number {
  const right = new Set(uniqueNormalized(b).map((value) => value.toLocaleLowerCase()));
  return uniqueNormalized(a).filter((value) => right.has(value.toLocaleLowerCase())).length;
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

function scoreNodeForStep(
  step: ProjectRecipeStep,
  node: UISnapshotOutput["nodes"][number],
  group: UISnapshotOutput["groups"][number] | undefined,
  screen: UISnapshotOutput["snapshot"]["screenSize"]
): number {
  let score = 0;
  if (step.role && node.role === step.role) score += 5;
  if (step.groupRole && group?.role === step.groupRole) score += 6;
  score += overlapCount(step.searchableTextAny, node.searchableText) * 8;
  if (step.classHints?.length) {
    const classMatches = step.classHints.filter((hint) =>
      node.className.toLocaleLowerCase().includes(hint.toLocaleLowerCase())
    ).length;
    score += classMatches * 3;
  }
  if (step.controllerHints?.length && node.controllerClass) {
    score += step.controllerHints.some((hint) =>
      node.controllerClass?.toLocaleLowerCase().includes(hint.toLocaleLowerCase())
    )
      ? 2
      : 0;
  }
  if (step.areaHint) {
    const area = inferAreaHint(node.frame, screen);
    if (area === step.areaHint) score += 2;
  }
  return score;
}

function scoreRecipeScreen(recipe: ProjectRecipe, snapshot: UISnapshotOutput): number {
  let score = 0;
  score += overlapCount(recipe.screen?.controllerHints, snapshot.summary.controllerHints) * 6;
  score += overlapCount(recipe.screen?.visibleTextAny, snapshot.summary.visibleText) * 2;
  return score;
}

export function matchProjectRecipes(
  snapshot: UISnapshotOutput,
  recipes: ProjectRecipe[]
): ProjectRecipeMatch[] {
  const groupsById = new Map(snapshot.groups.map((group) => [group.id, group]));
  const matches: ProjectRecipeMatch[] = [];

  for (const recipe of recipes) {
    const screenScore = scoreRecipeScreen(recipe, snapshot);
    if (screenScore <= 0) continue;

    const suggestedSteps: ProjectRecipeStepMatch[] = [];
    let total = screenScore;

    for (const [index, step] of (recipe.steps ?? []).entries()) {
      if (!["ui_tap", "ui_input", "ui_scroll", "ui_dismiss", "ui_long_press", "ui_swipe"].includes(step.tool)) {
        continue;
      }
      const scored = snapshot.nodes
        .map((node) => ({
          oid: node.actionTargetOid || node.oid,
          score: scoreNodeForStep(step, node, node.groupId ? groupsById.get(node.groupId) : undefined, snapshot.snapshot.screenSize),
        }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score || a.oid - b.oid);

      if (scored.length === 0) continue;

      const dedupedOids = Array.from(new Set(scored.map((candidate) => candidate.oid)));
      const recommendedOid = dedupedOids[0];
      const bestScore = scored.find((candidate) => candidate.oid === recommendedOid)?.score ?? 0;
      total += bestScore;
      suggestedSteps.push({
        index,
        tool: step.tool,
        recommendedOid,
        candidateOids: dedupedOids.slice(0, 5),
      });
    }

    if (suggestedSteps.length === 0) continue;
    matches.push({
      id: recipe.id,
      description: recipe.description,
      score: total,
      suggestedSteps,
    });
  }

  return matches.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 5);
}
