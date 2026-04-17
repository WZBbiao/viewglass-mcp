import { VIEWGLASS_BIN, parseJSON } from "../runner.js";
import { saveProjectBundleId } from "../project_config.js";
import type { ExecFn } from "../runner.js";
import { defaultExec } from "../runner.js";

export interface UIConnectInput {
  /**
   * Bundle ID of the app to connect to.
   * Partial match is supported (e.g. "ExampleApp" matches "com.example.app").
   */
  bundleId: string;
}

export interface UIConnectResult {
  /** Ready-to-use session string: "bundleId@port". Pass this to all other Viewglass tools. */
  session: string;
  bundleId: string;
  port: number;
}

/**
 * Find and return the session for a specific iOS app by bundle ID.
 * Use this when ui_scan shows sessions that don't match the target app,
 * or when you need to explicitly target a specific app among multiple running sessions.
 */
export async function uiConnect(
  input: UIConnectInput,
  exec?: ExecFn
): Promise<UIConnectResult> {
  const fn = exec ?? defaultExec;

  let apps: Array<{ bundleIdentifier: string; port: number }> = [];
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

  // Exact match first, then partial/contains match
  const match =
    apps.find((a) => a.bundleIdentifier === input.bundleId) ??
    apps.find((a) =>
      a.bundleIdentifier.toLowerCase().includes(input.bundleId.toLowerCase())
    );

  if (!match) {
    const available =
      apps.length > 0
        ? apps.map((a) => a.bundleIdentifier).join(", ")
        : "none";
    throw new Error(
      `App "${input.bundleId}" is not running with ViewglassServer. ` +
        `Currently available: ${available}. ` +
        "Ask the user to build and run the target app in Xcode (Debug scheme), " +
        "then call ui_connect again."
    );
  }

  saveProjectBundleId(match.bundleIdentifier);

  return {
    session: `${match.bundleIdentifier}@${match.port}`,
    bundleId: match.bundleIdentifier,
    port: match.port,
  };
}
