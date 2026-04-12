import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface CompareWithDesignInput {
  /** Figma node URL (e.g. https://figma.com/design/:fileKey/...?node-id=1-2). */
  figmaNodeUrl: string;
  /**
   * Locator for a specific view to capture instead of full screen.
   * Omit to capture the whole screen.
   */
  locator?: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface CompareWithDesignResult {
  /** Absolute path to the captured device screenshot. */
  screenshotPath: string;
  /** Figma node URL for AI agent to fetch the reference design via Figma MCP. */
  figmaNodeUrl: string;
  /**
   * Instructions for the AI agent: use get_design_context or get_screenshot
   * from Figma MCP to fetch the reference, then visually compare both images.
   */
  instructions: string;
}

/**
 * Capture a screenshot of the running app and return it alongside the Figma
 * reference URL for visual comparison.
 *
 * This tool intentionally does NOT perform the diff itself. Instead it:
 * 1. Screenshots the device via Viewglass
 * 2. Returns the screenshot path + Figma URL
 *
 * The AI agent should then call Figma MCP `get_screenshot` with the figmaNodeUrl
 * and compare both images to produce a structured discrepancy report.
 *
 * Expensive: performs a full screenshot capture across the network.
 */
export async function compareWithDesign(
  input: CompareWithDesignInput,
  exec?: ExecFn
): Promise<CompareWithDesignResult> {
  const session = await resolveSession(input.session, exec);
  const outputPath = join(tmpdir(), `viewglass-compare-${Date.now()}.png`);

  let args: string[];
  if (input.locator) {
    // First resolve OID, then screenshot that node
    const { stdout: queryOut } = await runCLI(
      ["query", input.locator, "--json"],
      { session, exec }
    );
    const nodes = parseJSON<Array<{ oid: string }>>(queryOut, "compare/query");
    if (!nodes.length) {
      throw new Error(
        `compare_with_design: locator '${input.locator}' matched 0 nodes`
      );
    }
    args = ["screenshot", "node", nodes[0].oid, "--output", outputPath, "--json"];
  } else {
    args = ["screenshot", "screen", "--output", outputPath, "--json"];
  }

  const { stdout } = await runCLI(args, { session, exec });
  const result = parseJSON<{ filePath?: string; path?: string }>(stdout, "compare/screenshot");
  const savedPath = result.filePath ?? result.path ?? outputPath;

  return {
    screenshotPath: savedPath,
    figmaNodeUrl: input.figmaNodeUrl,
    instructions:
      "Call Figma MCP `get_screenshot` (or `get_design_context`) with figmaNodeUrl to get the reference design image. " +
      "Then visually compare both images and report discrepancies as a structured list with: type (spacing/color/typography/layout), " +
      "description of the issue, and severity (high/medium/low).",
  };
}
