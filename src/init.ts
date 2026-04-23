import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT_DEFINITIONS = [
  { id: "claude", name: "Claude Code", skillsSubdir: ".claude/skills" },
  { id: "agents", name: "Agents Skills", skillsSubdir: ".agents/skills" },
] as const;

const AGENTS_FILE_NAME = "AGENTS.md";
const AGENTS_GUIDANCE_LINE =
  "- If using ViewglassMCP, use the installed ViewglassMCP skill before calling Viewglass tools, and after any reusable live task succeeds, update .viewglassmcp/recipes.yaml in the same session.";
const AGENTS_LEGACY_LINE =
  "- If using ViewglassMCP, first find and read the installed ViewglassMCP skill before calling Viewglass tools, and after any reusable live task succeeds, update .viewglassmcp/recipes.yaml in the same session.";

type SkillType = "mcp" | "cli";

type InitOptions = {
  client?: string;
  dest?: string;
  force?: boolean;
  projectRoot?: string;
  print?: boolean;
  skill?: SkillType;
};

type InstallResult = {
  installed: Array<{ client: string; location: string }>;
  agentsStatus?: "created" | "updated" | "no_change";
};

function packageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function skillDirName(skillType: SkillType): string {
  return skillType === "mcp" ? "viewglassmcp" : "viewglassmcp-cli";
}

function expandHome(inputPath: string): string {
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function resolvePath(inputPath: string): string {
  return path.resolve(expandHome(inputPath));
}

function detectClients() {
  const home = os.homedir();
  return CLIENT_DEFINITIONS.filter((def) => fs.existsSync(path.join(home, def.skillsSubdir.split("/")[0]))).map(
    (def) => ({
      id: def.id,
      name: def.name,
      skillsDir: path.join(home, def.skillsSubdir),
    })
  );
}

export function getSkillContent(skillType: SkillType): string {
  const source = path.join(packageRoot(), "skills", skillDirName(skillType), "SKILL.md");
  if (!fs.existsSync(source)) {
    throw new Error(`Skill source not found: ${source}`);
  }
  return fs.readFileSync(source, "utf8");
}

function resolveTargets(client?: string, dest?: string) {
  if (dest) {
    const resolvedDest = resolvePath(dest);
    if (resolvedDest === path.parse(resolvedDest).root) {
      throw new Error("Refusing to use filesystem root as skills destination.");
    }
    return [{ id: "custom", name: "Custom", skillsDir: resolvedDest }];
  }

  if (client && client !== "auto") {
    const def = CLIENT_DEFINITIONS.find((item) => item.id === client);
    if (!def) {
      throw new Error(`Unknown client: ${client}. Valid clients: claude, agents`);
    }
    return [{ id: def.id, name: def.name, skillsDir: path.join(os.homedir(), def.skillsSubdir) }];
  }

  const detected = detectClients();
  if (detected.length === 0) {
    throw new Error(
      "No supported AI clients detected. Use --client to specify a client or --dest to specify a custom path."
    );
  }
  return detected;
}

function installSkill(skillsDir: string, clientName: string, skillType: SkillType, force = false) {
  const targetDir = path.join(skillsDir, skillDirName(skillType));
  const targetFile = path.join(targetDir, "SKILL.md");
  if (fs.existsSync(targetFile) && !force) {
    throw new Error(`Skill already installed at ${targetFile}. Use --force to overwrite.`);
  }
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetFile, getSkillContent(skillType), "utf8");
  return { client: clientName, location: targetFile };
}

function ensureProjectMemoryFiles(projectRoot: string, force = false): void {
  const memoryDir = path.join(projectRoot, ".viewglassmcp");
  fs.mkdirSync(memoryDir, { recursive: true });
  for (const fileName of ["README.md", "recipes.yaml", "config.yaml"]) {
    const target = path.join(memoryDir, fileName);
    if (fs.existsSync(target) && !force) continue;
    const source = path.join(packageRoot(), "templates", ".viewglassmcp", fileName);
    if (!fs.existsSync(source)) continue;
    fs.writeFileSync(target, fs.readFileSync(source, "utf8"), "utf8");
  }
}

function ensureAgentsGuidance(projectRoot: string, force = false): "created" | "updated" | "no_change" {
  const agentsPath = path.join(projectRoot, AGENTS_FILE_NAME);
  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, `# ${AGENTS_FILE_NAME}\n\n${AGENTS_GUIDANCE_LINE}\n`, "utf8");
    return "created";
  }

  const current = fs.readFileSync(agentsPath, "utf8");
  if (current.includes(AGENTS_GUIDANCE_LINE)) {
    return "no_change";
  }
  if (current.includes(AGENTS_LEGACY_LINE)) {
    fs.writeFileSync(agentsPath, current.replace(AGENTS_LEGACY_LINE, AGENTS_GUIDANCE_LINE), "utf8");
    return "updated";
  }
  if (!force) {
    throw new Error(`${agentsPath} exists and needs an appended ViewglassMCP guidance line. Re-run with --force.`);
  }

  const updated = current.endsWith("\n")
    ? `${current}${AGENTS_GUIDANCE_LINE}\n`
    : `${current}\n${AGENTS_GUIDANCE_LINE}\n`;
  fs.writeFileSync(agentsPath, updated, "utf8");
  return "updated";
}

export function initProject(options: InitOptions = {}): InstallResult {
  const skill = options.skill ?? "mcp";
  if (options.print) {
    process.stdout.write(getSkillContent(skill));
    return { installed: [], agentsStatus: "no_change" };
  }
  const targets = resolveTargets(options.client, options.dest);
  const installed = targets.map((target) =>
    installSkill(target.skillsDir, target.name, skill, options.force ?? false)
  );
  const projectRoot = resolvePath(options.projectRoot ?? process.cwd());
  ensureProjectMemoryFiles(projectRoot, options.force ?? false);
  const agentsStatus = ensureAgentsGuidance(projectRoot, options.force ?? false);
  return { installed, agentsStatus };
}


function hasProjectMarkers(dir: string): boolean {
  const names = ["AGENTS.md", "Package.swift", "Podfile", ".git", ".viewglassmcp"];
  for (const name of names) {
    if (fs.existsSync(path.join(dir, name))) return true;
  }
  try {
    const entries = fs.readdirSync(dir);
    return entries.some((name) => name.endsWith('.xcodeproj') || name.endsWith('.xcworkspace'));
  } catch {
    return false;
  }
}

function findProjectRoot(startCwd: string = process.cwd()): string | undefined {
  let current = path.resolve(startCwd);
  const rootDir = path.parse(current).root;
  while (true) {
    if (hasProjectMarkers(current)) {
      return current;
    }
    if (current === rootDir) return undefined;
    current = path.dirname(current);
  }
}

export function autoBootstrapForMcpStartup(startCwd: string = process.cwd()): void {
  try {
    const targets = detectClients();
    for (const target of targets) {
      try {
        installSkill(target.skillsDir, target.name, 'mcp', false);
      } catch {
        // already installed or not writable; keep startup non-fatal
      }
    }
  } catch {
    // no clients detected; ignore in startup mode
  }
}

export function ensureProjectBootstrapForUsage(startCwd: string = process.cwd()): void {
  const projectRoot = findProjectRoot(startCwd);
  if (!projectRoot) return;

  try {
    ensureProjectMemoryFiles(projectRoot, false);
  } catch {
    // best-effort only
  }

  try {
    ensureAgentsGuidance(projectRoot, true);
  } catch {
    // best-effort only
  }
}
