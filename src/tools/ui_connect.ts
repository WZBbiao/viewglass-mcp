import { VIEWGLASS_BIN, getViewglassBinaryDiagnostics, parseJSON } from "../runner.js";
import { loadProjectConfig, saveProjectSessionDefaults } from "../project_config.js";
import type { ExecFn } from "../runner.js";
import { defaultExec } from "../runner.js";
import {
  applySessionSelectors,
  compactSelectors,
  formatAppCandidates,
  hasAnySessionSelector,
  isSameBundleTarget,
  matchingBundleCandidates,
  parseSession,
  selectByConfigFallback,
  sessionOf,
} from "../session_select.js";
import type { DeviceType, RunningApp, SessionSelector } from "../session_select.js";

export interface UIConnectInput {
  /**
   * Bundle ID of the app to connect to.
   * Partial match is supported (e.g. "ExampleApp" matches "com.example.app").
   */
  bundleId: string;
  /** Exact session in bundleId@port format. Strongest selector when known. */
  session?: string;
  /** Exact Viewglass server port. Useful for selecting one simulator among many. */
  port?: number;
  /**
   * Optional device type selector. When set, ui_connect will not silently fall
   * back to a different device type for the same bundle.
   */
  deviceType?: DeviceType;
  /** Exact simulator/device display name as reported by viewglass apps list. */
  deviceName?: string;
  /** Exact physical-device UDID as reported by viewglass apps list. */
  deviceIdentifier?: string;
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

const APPS_LIST_TIMEOUT_MS = 30_000;

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
      timeout: APPS_LIST_TIMEOUT_MS,
    });
    apps = parseJSON<typeof apps>(stdout, "ui_connect");
  } catch (error) {
    throw new Error(
      "Failed to list running apps. Viewglass CLI is unavailable or failed before returning running apps.\n" +
        getViewglassBinaryDiagnostics() +
        "\nUnderlying error: " +
        formatUnderlyingError(error)
    );
  }

  const config = loadProjectConfig(projectCwd);
  const configuredSelectors = matchingConfigSelectors(input.bundleId, config?.sessionDefaults);
  const explicitSelectors = compactSelectors({
    session: input.session,
    port: input.port,
    deviceType: input.deviceType,
    deviceName: input.deviceName,
    deviceIdentifier: input.deviceIdentifier,
  });
  const hasExplicitSelectors = hasAnySessionSelector(explicitSelectors);
  const selectors = hasExplicitSelectors ? explicitSelectors : configuredSelectors;

  const parsedSession = parseSession(selectors.session);
  if (parsedSession && parsedSession.bundleId !== input.bundleId) {
    const sameTarget = isSameBundleTarget(input.bundleId, parsedSession.bundleId);
    if (!sameTarget) {
      throw new Error(
        `Session "${selectors.session}" does not match requested bundle "${input.bundleId}". ` +
          "Pass the matching bundleId or omit session."
      );
    }
  }

  const { candidates: bundleCandidates } = matchingBundleCandidates(apps, input.bundleId);
  const { candidates, appliedSelectors } = hasExplicitSelectors
    ? applySessionSelectors(bundleCandidates, explicitSelectors)
    : selectByConfigFallback(bundleCandidates, configuredSelectors);
  const match = chooseUnambiguousApp(candidates);

  if (!match) {
    const available = formatAppCandidates(apps);
    const matching = bundleCandidates.length > 0 ? formatAppCandidates(bundleCandidates) : "none";
    const narrowed = appliedSelectors.length > 0
      ? ` Applied selectors: ${appliedSelectors.join(", ")}. Matching after selectors: ${formatAppCandidates(candidates)}.`
      : "";
    const selectorHint = bundleCandidates.length > 1
      ? " Multiple sessions match this bundle. Pass session, port, deviceIdentifier, deviceName, or deviceType; " +
        "or set those under sessionDefaults in .viewglassmcp/config.yaml."
      : "";
    throw new Error(
      `App "${input.bundleId}" is not running with ViewglassServer. ` +
        `Currently available: ${available}.` +
        ` Matching sessions: ${matching}.` +
        narrowed +
        selectorHint +
        " " +
        "Ask the user to build and run the target app in Xcode (Debug scheme), " +
        "then call ui_connect again."
    );
  }

  saveProjectSessionDefaults({
    bundleId: match.bundleIdentifier,
    session: sessionOf(match),
    port: match.port,
    deviceType: match.deviceType === "device" || match.deviceType === "simulator" ? match.deviceType : undefined,
    deviceName: match.deviceName,
    deviceIdentifier: match.deviceIdentifier,
  }, projectCwd);

  return {
    session: sessionOf(match),
    bundleId: match.bundleIdentifier,
    port: match.port,
    deviceType: match.deviceType === "device" || match.deviceType === "simulator" ? match.deviceType : undefined,
    deviceName: match.deviceName,
    deviceIdentifier: match.deviceIdentifier,
    serverVersion: match.serverVersion,
  };
}

function formatUnderlyingError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function chooseUnambiguousApp(apps: RunningApp[]): RunningApp | undefined {
  return apps.length === 1 ? apps[0] : undefined;
}

function matchingConfigSelectors(
  requestedBundleId: string,
  sessionDefaults?: SessionSelector & { bundleId?: string }
): SessionSelector {
  const configuredBundleId = sessionDefaults?.bundleId?.trim();
  if (!configuredBundleId) return {};

  if (!isSameBundleTarget(requestedBundleId, configuredBundleId)) return {};

  return compactSelectors({
    session: sessionDefaults?.session,
    port: sessionDefaults?.port,
    deviceType: sessionDefaults?.deviceType,
    deviceName: sessionDefaults?.deviceName,
    deviceIdentifier: sessionDefaults?.deviceIdentifier,
  });
}
