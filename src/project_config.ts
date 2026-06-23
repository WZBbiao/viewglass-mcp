import fs from "node:fs";
import path from "node:path";

export interface ViewglassProjectConfig {
  schemaVersion: number;
  sessionDefaults?: {
    bundleId?: string;
    session?: string;
    port?: number;
    deviceType?: "device" | "simulator";
    deviceName?: string;
    deviceIdentifier?: string;
  };
}

export type SessionDefaultsUpdate = NonNullable<ViewglassProjectConfig["sessionDefaults"]>;

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
      } else if (nested.startsWith("session:")) {
        const value = nested.slice("session:".length).trim().replace(/^['\"]|['\"]$/g, "");
        config.sessionDefaults ??= {};
        if (value) config.sessionDefaults.session = value;
      } else if (nested.startsWith("port:")) {
        const value = nested.slice("port:".length).trim().replace(/^['\"]|['\"]$/g, "");
        const parsed = Number(value);
        if (Number.isInteger(parsed)) {
          config.sessionDefaults ??= {};
          config.sessionDefaults.port = parsed;
        }
      } else if (nested.startsWith("deviceType:")) {
        const value = nested.slice("deviceType:".length).trim().replace(/^['\"]|['\"]$/g, "");
        if (value === "device" || value === "simulator") {
          config.sessionDefaults ??= {};
          config.sessionDefaults.deviceType = value;
        }
      } else if (nested.startsWith("deviceName:")) {
        const value = nested.slice("deviceName:".length).trim().replace(/^['\"]|['\"]$/g, "");
        config.sessionDefaults ??= {};
        if (value) config.sessionDefaults.deviceName = value;
      } else if (nested.startsWith("deviceIdentifier:")) {
        const value = nested.slice("deviceIdentifier:".length).trim().replace(/^['\"]|['\"]$/g, "");
        config.sessionDefaults ??= {};
        if (value) config.sessionDefaults.deviceIdentifier = value;
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

export function saveProjectBundleId(
  bundleId: string,
  startCwd: string = process.cwd(),
  deviceType?: "device" | "simulator"
): string | undefined {
  return saveProjectSessionDefaults({
    bundleId,
    ...(deviceType ? { deviceType } : {}),
  }, startCwd);
}

export function saveProjectSessionDefaults(
  defaults: SessionDefaultsUpdate,
  startCwd: string = process.cwd()
): string | undefined {
  const normalizedBundleId = defaults.bundleId?.trim();
  if (!normalizedBundleId) return undefined;

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
      bundleId: normalizedBundleId,
      ...(defaults.session?.trim() ? { session: defaults.session.trim() } : {}),
      ...(defaults.port !== undefined ? { port: defaults.port } : {}),
      ...(defaults.deviceType ? { deviceType: defaults.deviceType } : {}),
      ...(defaults.deviceName?.trim() ? { deviceName: defaults.deviceName.trim() } : {}),
      ...(defaults.deviceIdentifier?.trim() ? { deviceIdentifier: defaults.deviceIdentifier.trim() } : {}),
    },
  };

  const lines = [
    `schemaVersion: ${next.schemaVersion}`,
    "sessionDefaults:",
    `  bundleId: \"${next.sessionDefaults?.bundleId ?? ""}\"`,
    ...(next.sessionDefaults?.session ? [`  session: \"${next.sessionDefaults.session}\"`] : []),
    ...(next.sessionDefaults?.port !== undefined ? [`  port: ${next.sessionDefaults.port}`] : []),
    ...(next.sessionDefaults?.deviceType ? [`  deviceType: \"${next.sessionDefaults.deviceType}\"`] : []),
    ...(next.sessionDefaults?.deviceName ? [`  deviceName: \"${next.sessionDefaults.deviceName}\"`] : []),
    ...(next.sessionDefaults?.deviceIdentifier ? [`  deviceIdentifier: \"${next.sessionDefaults.deviceIdentifier}\"`] : []),
    "",
  ];
  fs.writeFileSync(configPath, lines.join("\n"), "utf8");
  return configPath;
}
