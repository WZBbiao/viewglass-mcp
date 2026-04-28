import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveUniqueNodeLocator } from "./locator.js";

export interface UIScreenshotInput {
  /**
   * Locator for a specific node to capture. Omit for full screen.
   * '#accessibilityIdentifier', class name, or OID.
   */
  locator?: string;
  /**
   * Output file path for the screenshot. Defaults to a temp file.
   * Must end in .png.
   */
  outputPath?: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface UIScreenshotResult {
  /** Absolute path where the screenshot was saved. */
  path: string;
  /** Locator used (if capturing a specific node). */
  locator?: string;
  /** Pixel width reported by the Viewglass CLI, when available. */
  width?: number;
  /** Pixel height reported by the Viewglass CLI, when available. */
  height?: number;
  /** Encoded image byte size reported by the Viewglass CLI, when available. */
  dataSize?: number;
  /** Screenshot type reported by the Viewglass CLI. */
  screenshotType?: string;
  /** Capture provider used by the Viewglass CLI, e.g. simctl/server/pymobiledevice3. */
  captureProvider?: string;
  /** Why the CLI fell back to another provider, when applicable. */
  fallbackReason?: string;
  /** Quality warnings such as mostlyBlack or suspiciousSmallEncodedImage. */
  qualityWarnings?: string[];
  /** Approximate sampled black pixel ratio, when available. */
  blackPixelRatio?: number;
  /** Approximate sampled visible/non-black pixel ratio, when available. */
  nonBlackPixelRatio?: number;
}

/**
 * Capture a screenshot of the running app.
 *
 * Without locator: captures the full screen of the device/simulator.
 * With locator: captures only the specified node (useful for design comparison).
 *
 * Returns { path } with the absolute path to the saved PNG.
 * Use compare_with_design if you need a side-by-side Figma comparison.
 */
export async function uiScreenshot(
  input: UIScreenshotInput,
  exec?: ExecFn
): Promise<UIScreenshotResult> {
  const session = await resolveSession(input.session, exec);
  const outputPath =
    input.outputPath ?? join(tmpdir(), `viewglass-screenshot-${Date.now()}.png`);

  let cliArgs: string[];
  if (input.locator) {
    const resolved = await resolveUniqueNodeLocator(input.locator, session, exec);
    cliArgs = ["screenshot", "node", resolved.resolvedTarget, "--output", outputPath, "--json"];
  } else {
    cliArgs = ["screenshot", "screen", "--output", outputPath, "--json"];
  }

  const { stdout } = await runCLI(cliArgs, { session, exec });
  const raw = parseJSON<{
    path?: string;
    outputPath?: string;
    filePath?: string;
    width?: number;
    height?: number;
    dataSize?: number;
    screenshotType?: string;
    captureProvider?: string;
    fallbackReason?: string;
    qualityWarnings?: string[];
    blackPixelRatio?: number;
    nonBlackPixelRatio?: number;
  }>(stdout, "ui_screenshot");
  const savedPath: string = raw.path ?? raw.filePath ?? raw.outputPath ?? outputPath;

  return {
    path: savedPath,
    locator: input.locator,
    width: raw.width,
    height: raw.height,
    dataSize: raw.dataSize,
    screenshotType: raw.screenshotType,
    captureProvider: raw.captureProvider,
    fallbackReason: raw.fallbackReason,
    qualityWarnings: raw.qualityWarnings,
    blackPixelRatio: raw.blackPixelRatio,
    nonBlackPixelRatio: raw.nonBlackPixelRatio,
  };
}
