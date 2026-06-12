import { VIEWGLASS_BIN, parseJSON } from "../runner.js";
import { loadProjectConfig, saveProjectBundleId } from "../project_config.js";
import type { ExecFn } from "../runner.js";
import { defaultExec } from "../runner.js";

type DeviceType = "device" | "simulator";

export interface UIConnectInput {
  /**
   * Bundle ID of the app to connect to.
   * Partial match is supported (e.g. "ExampleApp" matches "com.example.app").
   */
  bundleId: string;
  /**
   * Optional device type selector. When set, ui_connect will not silently fall
   * back to a different device type for the same bundle.
   */
  deviceType?: DeviceType;
}

export interface UIConnectResult {
  /** Ready-to-use session string: "bundleId@port". Pass this to all other Viewglass tools. */
  session: string;
  bundleId: string;
  port: number;
  deviceType?: DeviceType;
  deviceName?: string;
  deviceIdentifier?: string;
  serverVersion?: string;
}

type RunningApp = {
  bundleIdentifier: string;
  port: number;
  deviceType?: DeviceType;
  deviceName?: string;
  deviceIdentifier?: string;
  serverVersion?: string;
};

/**
 * Find and return the session for a specific iOS app by bundle ID.
 * Use this when ui_scan shows sessions that don't match the target app,
 * or when you need to explicitly target a specific app among multiple running sessions.
 */
export async function uiConnect(
  input: UIConnectInput,
  exec?: ExecFn,
  projectCwd: string = process.cwd()
): Promise<UIConnectResult> {
  const fn = exec ?? defaultExec;

  let apps: RunningApp[] = [];
  try {
    const { stdout } = await fn(VIEWGLASS_BIN, ["apps", "list", "--json"], {
      timeout: 8_000,
    });
    apps = parseJSON<typeof apps>(stdout, "ui_connect");
  } catch {
    throw new Error(
      "Failed to list running apps. Make sure the Viewglass CLI is installed."
    );
  }

  const config = loadProjectConfig(projectCwd);
  const preferredDeviceType = input.deviceType ?? matchingConfigDeviceType(input.bundleId, config?.sessionDefaults);
  const exactMatches = apps.filter((a) => a.bundleIdentifier === input.bundleId);
  const partialMatches = apps.filter((a) =>
    a.bundleIdentifier.toLowerCase().includes(input.bundleId.toLowerCase())
  );
  const candidates = exactMatches.length > 0 ? exactMatches : partialMatches;
  const match = choosePreferredApp(candidates, preferredDeviceType);

  if (!match) {
    const available = formatAvailableApps(apps);
    const matching = candidates.length > 0 ? formatAvailableApps(candidates) : "none";
    const deviceTypeMessage = preferredDeviceType
      ? ` No ${preferredDeviceType} session matched. Matching sessions: ${matching}.`
      : "";
    throw new Error(
      `App "${input.bundleId}" is not running with ViewglassServer. ` +
        `Currently available: ${available}.` +
        deviceTypeMessage +
        " " +
        "Ask the user to build and run the target app in Xcode (Debug scheme), " +
        "then call ui_connect again."
    );
  }

  saveProjectBundleId(match.bundleIdentifier, projectCwd, match.deviceType);

  return {
    session: `${match.bundleIdentifier}@${match.port}`,
    bundleId: match.bundleIdentifier,
    port: match.port,
    deviceType: match.deviceType,
    deviceName: match.deviceName,
    deviceIdentifier: match.deviceIdentifier,
    serverVersion: match.serverVersion,
  };
}

function choosePreferredApp(
  apps: RunningApp[],
  preferredDeviceType?: DeviceType
): RunningApp | undefined {
  if (apps.length === 0) return undefined;

  if (preferredDeviceType) {
    return apps.find((app) => app.deviceType === preferredDeviceType);
  }

  return apps.find((app) => app.deviceType === "device") ?? apps[0];
}

function matchingConfigDeviceType(
  requestedBundleId: string,
  sessionDefaults?: { bundleId?: string; deviceType?: DeviceType }
): DeviceType | undefined {
  const configuredBundleId = sessionDefaults?.bundleId?.trim();
  if (!configuredBundleId) return undefined;

  const requested = requestedBundleId.trim().toLowerCase();
  const configured = configuredBundleId.toLowerCase();
  const sameTarget =
    configured === requested ||
    configured.includes(requested) ||
    requested.includes(configured);

  return sameTarget ? sessionDefaults?.deviceType : undefined;
}

function formatAvailableApps(apps: RunningApp[]): string {
  if (apps.length === 0) return "none";
  return apps
    .map((app) => {
      const suffix = [
        app.deviceType,
        app.deviceName,
        app.deviceIdentifier,
        `port:${app.port}`,
      ]
        .filter(Boolean)
        .join("/");
      return suffix ? `${app.bundleIdentifier} (${suffix})` : app.bundleIdentifier;
    })
    .join(", ");
}
