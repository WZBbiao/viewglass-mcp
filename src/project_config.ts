import fs from "node:fs";
import path from "node:path";

export interface ViewglassProjectConfig {
  schemaVersion: number;
  sessionDefaults?: {
    bundleId?: string;
  };
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

export function loadProjectConfig(startCwd: string = process.cwd()): ViewglassProjectConfig | undefined {
  const configPath = findConfigPath(startCwd);
  if (!configPath) return undefined;
  const raw = fs.readFileSync(configPath, "utf8");
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
