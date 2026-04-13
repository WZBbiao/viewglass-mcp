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

export interface ViewglassSetupGuide {
  summary: string;
  spm: string;
  cocoapods: string;
  appCode: string;
  verify: string;
}

export interface UIScanResult {
  /** All running Viewglass sessions. Empty if none found. */
  sessions: UISessionInfo[];
  /** Human-readable status. */
  message: string;
  /**
   * Only present when sessions is empty.
   * Step-by-step integration guide for adding ViewglassServer to an iOS project.
   * Read this, then help the user apply the correct integration method.
   */
  setupGuide?: ViewglassSetupGuide;
}

const SETUP_GUIDE: ViewglassSetupGuide = {
  summary:
    "ViewglassServer is not running in any app. To use Viewglass tools, " +
    "the iOS project must embed ViewglassServer (Debug builds only). " +
    "Follow one of the integration steps below, then build & run the app on a simulator or device.",

  spm:
    "## Swift Package Manager (recommended)\n\n" +
    "Check the latest release tag at https://github.com/WZBbiao/ViewglassServer/releases/latest first.\n\n" +
    "1. In Xcode: File → Add Package Dependencies…\n" +
    "2. Enter URL: https://github.com/WZBbiao/ViewglassServer.git\n" +
    "3. Select the latest release version\n" +
    "4. Add the `LookinServer` library to the **app target** (not a framework target)\n\n" +
    "Or in Package.swift:\n" +
    "```swift\n" +
    '.package(url: "https://github.com/WZBbiao/ViewglassServer.git", from: "<latest-tag>")\n' +
    "// then in target dependencies:\n" +
    '.product(name: "LookinServer", package: "ViewglassServer")\n' +
    "```",

  cocoapods:
    "## CocoaPods\n\n" +
    "Check the latest release tag at https://github.com/WZBbiao/ViewglassServer/releases/latest first.\n\n" +
    "Add to your Podfile (Swift project):\n" +
    "```ruby\n" +
    "pod 'LookinServer',\n" +
    "  :git => 'https://github.com/WZBbiao/ViewglassServer.git',\n" +
    "  :tag => '<latest-tag>',\n" +
    "  :subspecs => ['Swift'],\n" +
    "  :configurations => ['Debug']\n" +
    "```\n\n" +
    "Then run: `pod install`",

  appCode:
    "## Import in AppDelegate / App entry point (SPM only)\n\n" +
    "LookinServer uses ObjC `+load` to start automatically — no initialization code needed.\n\n" +
    "**CocoaPods:** skip this step. CocoaPods links with `-ObjC`, so `+load` runs automatically.\n\n" +
    "**SPM:** add a defensive import to prevent the linker from dead-stripping the module:\n\n" +
    "Swift:\n" +
    "```swift\n" +
    "#if DEBUG\n" +
    "import LookinServer\n" +
    "#endif\n" +
    "```\n\n" +
    "Objective-C:\n" +
    "```objc\n" +
    "#if DEBUG\n" +
    "@import LookinServer;\n" +
    "#endif\n" +
    "```",

  verify:
    "## Verify\n\n" +
    "1. Build and run the app on a simulator or connected device (Debug scheme)\n" +
    "2. Call `ui_scan` again — it should list the running session\n\n" +
    "If ui_scan still returns empty after running the app:\n" +
    "- Confirm you are running a Debug build (not Release)\n" +
    "- Confirm LookinServer is linked to the app target, not only a framework",
};

/**
 * Scan for running Viewglass sessions.
 *
 * **Always call this first.** It tells you:
 * - Which apps are available for inspection (use the session string with other tools)
 * - If no app is running: returns a complete ViewglassServer integration guide
 *   so you can help the user add the dependency to their iOS project.
 *
 * Workflow:
 *   1. Call ui_scan
 *   2a. Sessions found → pass session to other tools
 *   2b. Sessions empty → read setupGuide, help user integrate ViewglassServer,
 *       then ask them to build & run the app, then call ui_scan again
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

  if (sessions.length === 0) {
    return {
      sessions,
      message:
        "No Viewglass sessions found. Read setupGuide and help the user " +
        "integrate ViewglassServer into their iOS project, then ask them to " +
        "build & run the app and call ui_scan again.",
      setupGuide: SETUP_GUIDE,
    };
  }

  return {
    sessions,
    message: `Found ${sessions.length} session(s): ${sessions.map((s) => s.session).join(", ")}`,
  };
}
