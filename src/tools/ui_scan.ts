import { VIEWGLASS_BIN, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { defaultExec } from "../runner.js";

export interface UISessionInfo {
  /** Bundle identifier of the app. */
  bundleId: string;
  /** Port the Viewglass server is listening on. */
  port: number;
  /** Ready-to-use session string: "bundleId@port". */
  session: string;
}

export interface UIScanResult {
  /** All running Viewglass sessions. Empty if none found. */
  sessions: UISessionInfo[];
  /** Human-readable status. */
  message: string;
}

/**
 * Scan for running Viewglass sessions.
 * Returns all app sessions available for inspection.
 *
 * Call this first if you don't know the session string, or to confirm the
 * target app is running. Pass the returned session value to other tools.
 */
export async function uiScan(exec?: ExecFn): Promise<UIScanResult> {
  const fn = exec ?? defaultExec;

  let apps: Array<{ bundleIdentifier: string; port: number }> = [];
  try {
    const { stdout } = await fn(VIEWGLASS_BIN, ["apps", "list", "--json"], {
      timeout: 8_000,
    });
    apps = parseJSON<typeof apps>(stdout, "ui_scan");
  } catch {
    // binary not found or no apps — return empty
  }

  const sessions: UISessionInfo[] = apps.map((a) => ({
    bundleId: a.bundleIdentifier,
    port: a.port,
    session: `${a.bundleIdentifier}@${a.port}`,
  }));

  const message =
    sessions.length === 0
      ? "No Viewglass sessions found. Ensure the app is running with ViewglassServer integrated."
      : `Found ${sessions.length} session(s): ${sessions.map((s) => s.session).join(", ")}`;

  return { sessions, message };
}
