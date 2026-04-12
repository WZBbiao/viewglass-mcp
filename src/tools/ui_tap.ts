import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UITapInput {
  /**
   * Locator string — `#accessibilityIdentifier`, class name, or OID.
   * Locator must match exactly one visible node.
   */
  locator: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

/**
 * Tap a UI element. After tapping, automatically refreshes and returns
 * a post-action hierarchy summary so the agent can confirm the result
 * without a separate snapshot call.
 *
 * Returns { tapped: locator, hierarchy: <post-action snapshot> }.
 */
export async function uiTap(
  input: UITapInput,
  exec?: ExecFn
): Promise<{ tapped: string; hierarchy: unknown }> {
  const session = await resolveSession(input.session, exec);
  // Perform the tap
  await runCLI(["tap", input.locator], { session, exec });
  // Refresh and return post-action state
  await runCLI(["refresh"], { session, exec });
  const { stdout } = await runCLI(["hierarchy", "--json"], { session, exec });
  const hierarchy = parseJSON(stdout, "ui_tap/hierarchy");
  return { tapped: input.locator, hierarchy };
}
