import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UISnapshotInput {
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
  /** Filter hierarchy to nodes of this UIKit class name (e.g. UILabel, UIButton). */
  filter?: string;
}

/**
 * Capture a full UI hierarchy snapshot from the running app.
 * Returns the raw JSON hierarchy with windows, views, and node metadata.
 */
export async function uiSnapshot(
  input: UISnapshotInput,
  exec?: ExecFn
): Promise<unknown> {
  const session = await resolveSession(input.session, exec);
  const args = ["hierarchy", "--json"];
  if (input.filter) args.push("--filter", input.filter);
  const { stdout } = await runCLI(args, { session, exec });
  return parseJSON(stdout, "ui_snapshot");
}
