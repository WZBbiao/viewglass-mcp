import fs from "node:fs";
import path from "node:path";

export interface ViewglassProjectConfig {
  schemaVersion: number;
  sessionDefaults?: {
    bundleId?: string;
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
    if (hasProjectMarkers(current)) {
      return current;
    }
    if (current === root) {
      return undefined;
    }
    current = path.dirname(current);
  }
}

function findConfigPath(startCwd: string = process.cwd()): string | undefined {
  let current = path.resolve(startCwd);
  const root = path.parse(current).root;
  while (true) {
    const candidate = path.join(current, ".viewglassmcp", "config.yaml");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    if (current === root) {
      return undefined;
    }
    current = path.dirname(current);
  }
}

function parseProjectConfig(raw: string): ViewglassProjectConfig {
  const lines = raw.split(/\r?\n/);
  const config: ViewglassProjectConfig = { schemaVersion: 1 };
  let inSessionDefaults = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      inSessionDefaults = trimmed.startsWith("sessionDefaults:");
      if (trimmed.startsWith("schemaVersion:")) {
        const value = trimmed.slice("schemaVersion:".length).trim();
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) config.schemaVersion = parsed;
      }
      continue;
    }
    if (inSessionDefaults) {
      const nested = trimmed;
      if (nested.startsWith("bundleId:")) {
        const value = nested.slice("bundleId:".length).trim().replace(/^['\"]|['\"]$/g, "");
        config.sessionDefaults ??= {};
        if (value) config.sessionDefaults.bundleId = value;
      }
    }
  }

  return config;
}

export function loadProjectConfig(startCwd: string = process.cwd()): ViewglassProjectConfig | undefined {
  const configPath = findConfigPath(startCwd);
  if (!configPath) return undefined;
  return parseProjectConfig(fs.readFileSync(configPath, "utf8"));
}

export function saveProjectBundleId(bundleId: string, startCwd: string = process.cwd()): string | undefined {
  const normalized = bundleId.trim();
  if (!normalized) return undefined;

  const projectRoot = findProjectRoot(startCwd);
  if (!projectRoot) return undefined;

  const memoryDir = path.join(projectRoot, ".viewglassmcp");
  fs.mkdirSync(memoryDir, { recursive: true });

  const configPath = path.join(memoryDir, "config.yaml");
  const current = fs.existsSync(configPath)
    ? parseProjectConfig(fs.readFileSync(configPath, "utf8"))
    : { schemaVersion: 1 } satisfies ViewglassProjectConfig;

  const next: ViewglassProjectConfig = {
    schemaVersion: current.schemaVersion || 1,
    sessionDefaults: {
      ...(current.sessionDefaults ?? {}),
      bundleId: normalized,
    },
  };

  const lines = [
    `schemaVersion: ${next.schemaVersion}`,
    "sessionDefaults:",
    `  bundleId: \"${next.sessionDefaults?.bundleId ?? ""}\"`,
    "",
  ];
  fs.writeFileSync(configPath, lines.join("\n"), "utf8");
  return configPath;
}
